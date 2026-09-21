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

    return json(404, { message: 'Not Found' });
  }) as typeof fetch;

  return { config: fakeGitHubConfig, fetchImpl };
}
