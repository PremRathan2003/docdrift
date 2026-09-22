import { expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E } from '../../apps/api/test/e2e/fixtures';

export { E2E };
export const PASSWORD = 'a long enough password';

/** A fresh user per test keeps tests independent (no shared state, safe in parallel). */
export function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function register(page: Page, name = 'Prem') {
  const email = uniqueEmail();
  await page.goto('/register');
  await page.getByLabel('Name (optional)').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

/**
 * Stands in for github.com during the connect flow.
 *
 * Playwright can't intercept requests in the middle of a redirect chain, so we
 * intercept our own /api/github/* responses instead: each redirect becomes a
 * small page that navigates onwards, and a redirect *to github.com* is replaced
 * with what GitHub would do — send the browser back to our callback. Everything
 * on our side (state cookie, code exchange, installation check) runs for real.
 */
export async function fakeGitHubInBrowser(context: BrowserContext) {
  await context.route('**/api/github/**', async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    let location = response.headers()['location'];
    if (!location) return route.fulfill({ response });

    const target = new URL(location, route.request().url());
    if (target.host === 'github.com' && target.pathname.startsWith('/apps/')) {
      // "Install the app" → GitHub returns without a state (like the real thing).
      location = `/api/github/callback?installation_id=${E2E.installationId}&setup_action=install`;
    } else if (target.host === 'github.com' && target.pathname === '/login/oauth/authorize') {
      const state = target.searchParams.get('state') ?? '';
      location = `/api/github/callback?code=${E2E.oauthCode}&state=${encodeURIComponent(state)}`;
    }

    const headers: Record<string, string> = { 'content-type': 'text/html' };
    const cookies = response
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
    if (cookies.length) headers['set-cookie'] = cookies.join('\n');
    return route.fulfill({
      status: 200,
      headers,
      body: `<script>location.replace(${JSON.stringify(location)})</script>`,
    });
  });
}

/** Register, connect GitHub and the sandbox repository; ends on its pull request list. */
export async function setUpRepository(page: Page) {
  await fakeGitHubInBrowser(page.context());
  await register(page);
  await page.goto('/repositories');
  await page.getByRole('link', { name: 'Install the GitHub App' }).click();
  await expect(page.getByText('GitHub is connected.')).toBeVisible();

  const full = `${E2E.owner}/${E2E.repo}`;
  await page.getByRole('button', { name: `Connect ${full}`, exact: true }).click();
  await page.getByRole('link', { name: 'Pull requests' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(E2E.repo);
}

/** Open a PR from the list and run the analysis; waits until it has finished. */
export async function analysePullRequest(page: Page, title: string) {
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
  await page.getByRole('button', { name: 'Run analysis' }).click();
  await expect(page.getByRole('heading', { name: 'Documentation recommendations' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run analysis again' })).toBeEnabled({
    timeout: 20_000,
  });
}
