/**
 * Verifies your GitHub App configuration against the real GitHub API.
 *   npm run github:check -w @docdrift/api
 * Uses only the app's own credentials (a JWT). Prints no secrets.
 */
import { loadEnv } from '../src/config/env.js';
import { createAppJwt } from '../src/modules/github/app-jwt.js';
import { loadGitHubConfig } from '../src/modules/github/config.js';
import { createGitHubClient, GitHubError } from '../src/modules/github/github-client.js';

const EXPECTED_PERMISSIONS: Record<string, string> = {
  contents: 'read',
  metadata: 'read',
  pull_requests: 'read',
};

async function main() {
  const config = loadGitHubConfig(loadEnv());
  if (!config) {
    console.error('✗ GitHub is not configured: set the GITHUB_APP_* variables in apps/api/.env');
    process.exit(1);
  }
  const client = createGitHubClient();
  const jwt = createAppJwt(config.clientId, config.privateKey);

  const { data: app } = await client.request<{
    id: number;
    slug: string;
    name: string;
    owner: { login: string };
    permissions: Record<string, string>;
  }>({ path: '/app', token: jwt });

  console.warn(`✓ Authenticated as GitHub App "${app.name}" (owner: ${app.owner.login})`);

  let ok = true;
  if (String(app.id) !== config.appId) {
    ok = false;
    console.warn(`✗ GITHUB_APP_ID is ${config.appId} but GitHub says the app id is ${app.id}`);
  }
  if (app.slug !== config.slug) {
    ok = false;
    console.warn(`✗ GITHUB_APP_SLUG is "${config.slug}" but GitHub says "${app.slug}"`);
  }

  for (const [perm, level] of Object.entries(EXPECTED_PERMISSIONS)) {
    if (app.permissions[perm] !== level) {
      ok = false;
      console.warn(
        `✗ Permission "${perm}" should be "${level}", is "${app.permissions[perm] ?? 'none'}"`,
      );
    }
  }
  const extra = Object.keys(app.permissions).filter((p) => !(p in EXPECTED_PERMISSIONS));
  if (extra.length)
    console.warn(`! Extra permissions granted (not needed yet): ${extra.join(', ')}`);

  const installations = await client.paginate<
    { id: number; account: { login: string } }[],
    { id: number; account: { login: string } }
  >({ path: '/app/installations', token: jwt }, (page) => page);
  console.warn(
    installations.length
      ? `✓ Installed on: ${installations.map((i) => i.account.login).join(', ')}`
      : `! Not installed anywhere yet — that's expected until milestone 1.3 step 2`,
  );
  console.warn(`  Install page: https://github.com/apps/${config.slug}/installations/new`);

  if (!ok) process.exit(1);
  console.warn('✓ GitHub App configuration looks correct');
}

main().catch((err) => {
  if (err instanceof GitHubError && err.code === 'GITHUB_UNAUTHORIZED') {
    console.error(
      '✗ GitHub rejected the app credentials. Check GITHUB_APP_CLIENT_ID and that the private key belongs to this app.',
    );
  } else {
    console.error('✗', err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
