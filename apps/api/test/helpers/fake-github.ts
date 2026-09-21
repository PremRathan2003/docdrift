import { generateKeyPairSync } from 'node:crypto';
import type { GitHubAppConfig } from '../../src/modules/github/config.js';

/**
 * An in-memory stand-in for github.com and api.github.com, just big enough for
 * the connect flow. Tests never touch the real GitHub.
 */
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

export function createFakeGitHub(state: FakeGitHubState) {
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
      const paths = Object.keys(state.files?.[full] ?? {});
      return json(200, {
        tree: paths.map((path) => ({ path, type: 'blob', size: 10 })),
        truncated: false,
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

    return json(404, { message: 'Not Found' });
  }) as typeof fetch;

  return { config: fakeGitHubConfig, fetchImpl };
}
