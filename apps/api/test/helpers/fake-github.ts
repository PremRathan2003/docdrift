import { createHash, generateKeyPairSync } from 'node:crypto';
import type { GitHubAppConfig } from '../../src/modules/github/config.js';

/**
 * An in-memory stand-in for github.com and api.github.com, just big enough for
 * the connect flow. Tests never touch the real GitHub.
 */
/** Content hash, like git's blob SHA: identical content, identical id. */
const blobSha = (content: string) =>
  createHash('sha1').update(`blob ${content.length}\0${content}`).digest('hex');

export interface FakeRepo {
  id: number;
  name: string;
  owner: string;
  private?: boolean;
}

export interface FakeGitHubState {
  /** OAuth code -> the GitHub user it belongs to */
  codes: Record<string, string>;
  /** GitHub user -> installation ids that user can access */
  userInstallations: Record<string, number[]>;
  /** installation id -> account + repositories (missing = uninstalled) */
  installations: Record<number, { login: string; type: string; repos: FakeRepo[] }>;
  /** Make api.github.com answer 503 */
  down?: boolean;
  /** "owner/name" -> pull requests */
  pulls?: Record<string, FakePull[]>;
  /** "owner/name" -> file path -> content (same for every ref, which is enough for tests) */
  files?: Record<string, Record<string, string>>;
  /** Refuse the write endpoints, as an App without "Contents: write" would. */
  readOnly?: boolean;
  /**
   * Filled in by the fake as the docs pull request flow runs, so a test can
   * assert what DocDrift actually pushed rather than only what it displayed.
   */
  written?: {
    commits: { message: string; parent: string; files: { path: string; content: string }[] }[];
    branches: Record<string, string>;
    pulls: { branch: string; base: string; title: string; body: string; number: number }[];
  };
}

export interface FakePull {
  number: number;
  title: string;
  state?: 'OPEN' | 'CLOSED' | 'MERGED';
  author?: string | null;
  updatedAt?: string;
  headSha?: string;
  files?: {
    filename: string;
    status?: string;
    additions?: number;
    deletions?: number;
    patch?: string | null;
  }[];
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

export const fakeGitHubConfig: GitHubAppConfig = {
  appId: '1',
  slug: 'docdrift-test',
  clientId: 'Iv23liTEST',
  clientSecret: 'test-client-secret',
  privateKey,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * A view onto a state object the test still owns, so it can keep mutating the
 * state after the fake was built (`gh.readOnly = true`) AND see what the fake
 * records back into it (`gh.written`). A read-only proxy would silently send
 * the fake's own writes to a throwaway object.
 */
export function liveState(current: () => FakeGitHubState): FakeGitHubState {
  return new Proxy({} as FakeGitHubState, {
    get: (_t, k) => (current() as unknown as Record<string | symbol, unknown>)[k],
    set: (_t, k, v) => {
      (current() as unknown as Record<string | symbol, unknown>)[k] = v;
      return true;
    },
  });
}

export function createFakeGitHub(state: FakeGitHubState) {
  /** Blobs and trees posted while building one commit. */
  const pendingBlobs = new Map<string, string>();
  const pendingTrees = new Map<string, { path: string; sha: string }[]>();

  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization ?? '';
    const token = auth.replace(/^Bearer /, '');

    if (url.host === 'github.com' && url.pathname === '/login/oauth/access_token') {
      const { code } = JSON.parse(String(init.body)) as { code: string };
      const user = state.codes[code];
      return user
        ? json(200, { access_token: `ghu_${user}` })
        : json(200, { error: 'bad_verification_code' });
    }
    if (url.host !== 'api.github.com') return json(404, {});
    if (state.down) return json(503, { message: 'unavailable' });

    if (method === 'GET' && url.pathname === '/user/installations') {
      const ids = state.userInstallations[token.replace(/^ghu_/, '')] ?? [];
      const installations = ids
        .filter((id) => state.installations[id])
        .map((id) => ({
          id,
          account: { login: state.installations[id]!.login, type: state.installations[id]!.type },
        }));
      return json(200, { total_count: installations.length, installations });
    }

    const mint = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(url.pathname);
    if (method === 'POST' && mint) {
      const id = Number(mint[1]);
      if (!state.installations[id]) return json(404, { message: 'Not Found' });
      return json(201, {
        token: `ghs_${id}`,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });
    }

    if (method === 'GET' && url.pathname === '/installation/repositories') {
      const inst = state.installations[Number(token.replace(/^ghs_/, ''))];
      if (!inst) return json(401, { message: 'Bad credentials' });
      const repositories = inst.repos.map((r) => ({
        id: r.id,
        name: r.name,
        full_name: `${r.owner}/${r.name}`,
        owner: { login: r.owner },
        private: r.private ?? false,
        default_branch: 'main',
        html_url: `https://github.com/${r.owner}/${r.name}`,
      }));
      return json(200, { total_count: repositories.length, repositories });
    }

    // Installation tokens look like ghs_<installationId>; they may read repos of that installation.
    const instOfToken = state.installations[Number(token.replace(/^ghs_/, ''))];
    const canRead = (full: string) =>
      !!instOfToken?.repos.some((r) => `${r.owner}/${r.name}` === full);

    if (method === 'POST' && url.pathname === '/graphql') {
      const { variables } = JSON.parse(String(init.body)) as {
        variables: { owner: string; name: string };
      };
      const full = `${variables.owner}/${variables.name}`;
      if (!canRead(full)) {
        return json(200, {
          data: { repository: null },
          errors: [{ type: 'NOT_FOUND', message: 'Could not resolve' }],
        });
      }
      const nodes = (state.pulls?.[full] ?? []).map((p, i) => ({
        fullDatabaseId: String(5_000_000_000 + p.number),
        number: p.number,
        title: p.title,
        body: `Body of #${p.number}`,
        author: p.author === null ? null : { login: p.author ?? 'PremRathan2003' },
        state: p.state ?? 'OPEN',
        isDraft: false,
        headRefName: `feature-${p.number}`,
        baseRefName: 'main',
        headRefOid: p.headSha ?? `sha${p.number}`,
        additions: (p.files ?? []).reduce((a, f) => a + (f.additions ?? 1), 0),
        deletions: (p.files ?? []).reduce((a, f) => a + (f.deletions ?? 0), 0),
        changedFiles: (p.files ?? []).length,
        url: `https://github.com/${full}/pull/${p.number}`,
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: p.updatedAt ?? `2026-09-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
        mergedAt: p.state === 'MERGED' ? '2026-09-20T10:00:00Z' : null,
      }));
      return json(200, { data: { repository: { pullRequests: { nodes } } } });
    }

    const files = /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/files$/.exec(url.pathname);
    if (method === 'GET' && files) {
      const full = `${files[1]}/${files[2]}`;
      if (!canRead(full)) return json(404, { message: 'Not Found' });
      const pr = state.pulls?.[full]?.find((p) => p.number === Number(files[3]));
      if (!pr) return json(404, { message: 'Not Found' });
      return json(
        200,
        (pr.files ?? []).map((f) => ({
          filename: f.filename,
          status: f.status ?? 'modified',
          additions: f.additions ?? 1,
          deletions: f.deletions ?? 0,
          ...(f.patch === null ? {} : { patch: f.patch ?? '@@ -1 +1 @@\n-a\n+b' }),
        })),
      );
    }

    const tree = /^\/repos\/([^/]+)\/([^/]+)\/git\/trees\/[^/]+$/.exec(url.pathname);
    if (method === 'GET' && tree) {
      const full = `${tree[1]}/${tree[2]}`;
      if (!canRead(full)) return json(404, { message: 'Not Found' });
      const files = state.files?.[full] ?? {};
      return json(200, {
        // Like git, the blob SHA is a hash of the content, so the same content
        // always gets the same SHA (that is what makes caching them correct).
        tree: Object.entries(files).map(([path, content]) => ({
          path,
          type: 'blob',
          size: content.length,
          sha: blobSha(content),
        })),
        truncated: false,
      });
    }

    const blob = /^\/repos\/([^/]+)\/([^/]+)\/git\/blobs\/([^/]+)$/.exec(url.pathname);
    if (method === 'GET' && blob) {
      const full = `${blob[1]}/${blob[2]}`;
      if (!canRead(full)) return json(404, { message: 'Not Found' });
      const content = Object.values(state.files?.[full] ?? {}).find((c) => blobSha(c) === blob[3]);
      if (content === undefined) return json(404, { message: 'Not Found' });
      return json(200, {
        encoding: 'base64',
        size: content.length,
        content: Buffer.from(content).toString('base64'),
      });
    }

    const contents = /^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/.exec(url.pathname);
    if (method === 'GET' && contents) {
      const full = `${contents[1]}/${contents[2]}`;
      const path = contents[3]!.split('/').map(decodeURIComponent).join('/');
      const content = state.files?.[full]?.[path];
      if (!canRead(full) || content === undefined) return json(404, { message: 'Not Found' });
      return json(200, {
        type: 'file',
        encoding: 'base64',
        size: content.length,
        content: Buffer.from(content).toString('base64'),
      });
    }

    // ---- writing: the documentation pull request flow (Phase 3.3)

    const written = (state.written ??= { commits: [], branches: {}, pulls: [] });

    const write =
      /^\/repos\/([^/]+)\/([^/]+)\/(git\/blobs|git\/trees|git\/commits|git\/refs|git\/ref\/.+|pulls)$/.exec(
        url.pathname,
      );
    const writeRepo = write ? `${write[1]}/${write[2]}` : null;
    if (write && writeRepo && !canRead(writeRepo)) return json(404, { message: 'Not Found' });
    if (write && state.readOnly && method !== 'GET')
      return json(403, { message: 'Resource not accessible by integration' });

    const blobs = /^\/repos\/([^/]+)\/([^/]+)\/git\/blobs$/.exec(url.pathname);
    if (method === 'POST' && blobs) {
      const { content } = JSON.parse(String(init.body)) as { content: string; encoding: string };
      const text = Buffer.from(content, 'base64').toString('utf8');
      const sha = blobSha(text);
      pendingBlobs.set(sha, text);
      return json(201, { sha });
    }

    const trees = /^\/repos\/([^/]+)\/([^/]+)\/git\/trees$/.exec(url.pathname);
    if (method === 'POST' && trees) {
      const body = JSON.parse(String(init.body)) as {
        base_tree: string;
        tree: { path: string; sha: string }[];
      };
      const sha = `tree-${body.tree.map((t) => t.path).join('|')}`;
      pendingTrees.set(
        sha,
        body.tree.map((t) => ({ path: t.path, sha: t.sha })),
      );
      return json(201, { sha });
    }

    const commits = /^\/repos\/([^/]+)\/([^/]+)\/git\/commits$/.exec(url.pathname);
    if (method === 'POST' && commits) {
      const body = JSON.parse(String(init.body)) as {
        message: string;
        tree: string;
        parents: string[];
      };
      const entries = pendingTrees.get(body.tree) ?? [];
      written.commits.push({
        message: body.message,
        parent: body.parents[0]!,
        files: entries.map((e) => ({ path: e.path, content: pendingBlobs.get(e.sha) ?? '' })),
      });
      return json(201, { sha: `commit-${written.commits.length}` });
    }

    const commitRead = /^\/repos\/([^/]+)\/([^/]+)\/git\/commits\/([^/]+)$/.exec(url.pathname);
    if (method === 'GET' && commitRead)
      return json(200, { tree: { sha: `tree-of-${commitRead[3]}` } });

    const refRead = /^\/repos\/([^/]+)\/([^/]+)\/git\/ref\/(.+)$/.exec(url.pathname);
    if (method === 'GET' && refRead) {
      const branch = decodeURIComponent(refRead[3]!).replace(/^heads\//, '');
      const sha = written.branches[branch];
      return sha ? json(200, { object: { sha } }) : json(404, { message: 'Not Found' });
    }

    const refCreate = /^\/repos\/([^/]+)\/([^/]+)\/git\/refs$/.exec(url.pathname);
    if (method === 'POST' && refCreate) {
      const body = JSON.parse(String(init.body)) as { ref: string; sha: string };
      written.branches[body.ref.replace('refs/heads/', '')] = body.sha;
      return json(201, { ref: body.ref, object: { sha: body.sha } });
    }

    const refUpdate = /^\/repos\/([^/]+)\/([^/]+)\/git\/refs\/(.+)$/.exec(url.pathname);
    if (method === 'PATCH' && refUpdate) {
      const body = JSON.parse(String(init.body)) as { sha: string };
      written.branches[decodeURIComponent(refUpdate[3]!).replace(/^heads\//, '')] = body.sha;
      return json(200, { object: { sha: body.sha } });
    }

    const pullsPath = /^\/repos\/([^/]+)\/([^/]+)\/pulls$/.exec(url.pathname);
    if (pullsPath && method === 'GET') {
      // "Is there already an open pull request from this branch?"
      const head = (url.searchParams.get('head') ?? '').split(':').pop();
      const base = url.searchParams.get('base');
      const found = written.pulls.filter((p) => p.branch === head && p.base === base);
      return json(
        200,
        found.map((p) => ({
          number: p.number,
          html_url: `https://github.com/${writeRepo}/pull/${p.number}`,
        })),
      );
    }
    if (pullsPath && method === 'POST') {
      const body = JSON.parse(String(init.body)) as {
        head: string;
        base: string;
        title: string;
        body: string;
      };
      const number = 900 + written.pulls.length + 1;
      written.pulls.push({
        branch: body.head,
        base: body.base,
        title: body.title,
        body: body.body,
        number,
      });
      return json(201, { number, html_url: `https://github.com/${writeRepo}/pull/${number}` });
    }

    return json(404, { message: 'Not Found' });
  }) as typeof fetch;

  return { config: fakeGitHubConfig, fetchImpl };
}
