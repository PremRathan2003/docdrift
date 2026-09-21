import { GitHubError, type GitHubClient } from './github-client.js';

/** Refresh a little before GitHub's expiry so a token never dies mid-request. */
const REFRESH_MARGIN_MS = 5 * 60_000;

interface Cached {
  token: string;
  expiresAt: number;
}

/**
 * Installation access tokens are what we actually use to read a repository.
 * GitHub makes them valid for one hour. We mint them on demand from the app
 * JWT and keep them in memory only — they are never written to the database
 * or logs. Concurrent callers share one in-flight request.
 */
export function createInstallationTokenProvider({
  client,
  appJwt,
  now = Date.now,
}: {
  client: GitHubClient;
  appJwt: () => string;
  now?: () => number;
}) {
  const cache = new Map<string, Cached>();
  const inFlight = new Map<string, Promise<string>>();

  async function mint(installationId: string): Promise<string> {
    const { data } = await client.request<{ token?: unknown; expires_at?: unknown }>({
      method: 'POST',
      path: `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      token: appJwt(),
    });
    if (typeof data.token !== 'string' || typeof data.expires_at !== 'string') {
      throw new GitHubError('GITHUB_BAD_RESPONSE', 'Unexpected installation token response');
    }
    cache.set(installationId, { token: data.token, expiresAt: Date.parse(data.expires_at) });
    return data.token;
  }

  return {
    async get(installationId: string | bigint): Promise<string> {
      const id = String(installationId);
      const cached = cache.get(id);
      if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now()) return cached.token;

      let pending = inFlight.get(id);
      if (!pending) {
        pending = mint(id).finally(() => inFlight.delete(id));
        inFlight.set(id, pending);
      }
      return pending;
    },

    /** Call when GitHub says a token is invalid (e.g. the app was uninstalled). */
    invalidate(installationId: string | bigint) {
      cache.delete(String(installationId));
    },
  };
}

export type InstallationTokenProvider = ReturnType<typeof createInstallationTokenProvider>;
