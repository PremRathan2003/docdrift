import { GitHubError, type GitHubClient } from './github-client.js';

export interface UserInstallation {
  id: number;
  account: { login: string; type: string };
}

/**
 * Exchanges the one-time `code` from GitHub's redirect for a *user* access
 * token. We use that token for exactly one thing — asking GitHub which
 * installations this GitHub user can access — and then throw it away.
 *
 * Why this matters: GitHub's docs warn that the `installation_id` in the
 * redirect URL can be spoofed. Without this check, someone could paste
 * another organisation's installation id and read its repositories through
 * our app. We never trust that parameter; we ask GitHub instead.
 */
export async function exchangeCodeForUserToken(
  { clientId, clientSecret, code }: { clientId: string; clientSecret: string; code: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'docdrift',
      },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GitHubError('GITHUB_UNAVAILABLE', 'Could not reach GitHub');
  }
  // Note: GitHub reports OAuth errors (like an expired code) with HTTP 200 and an "error" field.
  const body = (await res.json().catch(() => ({}))) as { access_token?: unknown; error?: unknown };
  if (!res.ok || typeof body.access_token !== 'string') {
    const reason = typeof body.error === 'string' ? body.error : `status ${res.status}`;
    throw new GitHubError(
      'GITHUB_UNAUTHORIZED',
      `GitHub authorization failed (${reason})`,
      res.status,
    );
  }
  return body.access_token;
}

export async function listUserInstallations(
  client: GitHubClient,
  userToken: string,
): Promise<UserInstallation[]> {
  const all = await client.paginate<{ installations?: UserInstallation[] }, UserInstallation>(
    { path: '/user/installations', token: userToken },
    (page) => page.installations ?? [],
  );
  return all.filter((i) => typeof i.id === 'number' && typeof i.account?.login === 'string');
}
