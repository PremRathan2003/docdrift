/**
 * Answers one question the fake GitHub cannot: does the real API accept a
 * branch name whose slash we percent-encoded?
 *
 *   npm run github:probe-ref -w @docdrift/api
 *
 * `setBranch` builds its path with encodeURIComponent('heads/docdrift/pr-1'),
 * which sends `heads%2Fdocdrift%2Fpr-1`. Our test double accepts that because
 * it was written to match what our code sends — agreement that proves nothing.
 *
 * This reads the ref, then PATCHes it to the commit it ALREADY points at. That
 * is a no-op on the repository: no new commit, no branch moved, nothing to
 * undo. It only reveals whether GitHub accepts the encoding.
 */
import { loadEnv } from '../src/config/env.js';
import { createAppJwt } from '../src/modules/github/app-jwt.js';
import { loadGitHubConfig } from '../src/modules/github/config.js';
import { createGitHubClient, GitHubError } from '../src/modules/github/github-client.js';
import { createInstallationTokenProvider } from '../src/modules/github/installation-tokens.js';

const BRANCH = process.env.PROBE_BRANCH ?? 'docdrift/pr-1';

async function main() {
  const config = loadGitHubConfig(loadEnv());
  if (!config) throw new Error('GitHub is not configured (GITHUB_APP_* in apps/api/.env)');
  const client = createGitHubClient();
  const jwt = () => createAppJwt(config.clientId, config.privateKey);

  const { data: installations } = await client.request<
    { id: number; account: { login: string } }[]
  >({ path: '/app/installations', token: jwt() });
  const inst = installations[0];
  if (!inst) throw new Error('The app is not installed anywhere');

  const tokens = createInstallationTokenProvider({ client, appJwt: jwt });
  const token = await tokens.get(String(inst.id));

  const { data: repos } = await client.request<{ repositories: { full_name: string }[] }>({
    path: '/installation/repositories?per_page=100',
    token,
  });
  const target = repos.repositories.find((r) => r.full_name.endsWith('/docdrift-sandbox'));
  if (!target) throw new Error('docdrift-sandbox is not among the installed repositories');
  const [owner, repo] = target.full_name.split('/') as [string, string];

  const encoded = encodeURIComponent(`heads/${BRANCH}`);
  console.warn(`Repository: ${target.full_name}`);
  console.warn(`Branch:     ${BRANCH}`);
  console.warn(`Sent as:    git/ref/${encoded}\n`);

  let sha: string;
  try {
    const { data } = await client.request<{ object: { sha: string } }>({
      path: `/repos/${owner}/${repo}/git/ref/${encoded}`,
      token,
    });
    sha = data.object.sha;
    console.warn(`✓ GET  git/ref/${encoded} → ${sha.slice(0, 7)}`);
  } catch (err) {
    const code = err instanceof GitHubError ? err.code : String(err);
    console.warn(`✗ GET  failed: ${code}`);
    console.warn(
      `  If this is GITHUB_NOT_FOUND, either the branch does not exist yet (open a\n` +
        `  documentation pull request first) or GitHub rejects the encoding — the PATCH\n` +
        `  below is what distinguishes them, so try again once the branch exists.`,
    );
    process.exit(1);
  }

  // Pointing the branch at the commit it already points at changes nothing.
  try {
    await client.request({
      method: 'PATCH',
      path: `/repos/${owner}/${repo}/git/refs/${encoded}`,
      token,
      body: { sha, force: true },
    });
    console.warn(`✓ PATCH git/refs/${encoded} → accepted (set to the same commit, a no-op)`);
    console.warn('\n✓ GitHub accepts the percent-encoded branch name. setBranch is sound.');
  } catch (err) {
    const code = err instanceof GitHubError ? err.code : String(err);
    console.warn(`✗ PATCH failed: ${code}`);
    console.warn(
      '\n✗ GitHub does NOT accept the encoding on this endpoint. setBranch must build\n' +
        '  the ref path without encodeURIComponent on the slashes.',
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
