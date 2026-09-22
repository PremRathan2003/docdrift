import { expect, test } from '@playwright/test';
import { E2E, analysePullRequest, setUpRepository } from './helpers';

test('lists the pull requests of a connected repository', async ({ page }) => {
  await setUpRepository(page);
  for (const pr of Object.values(E2E.prs)) {
    await expect(page.getByRole('link', { name: pr.title })).toBeVisible();
  }
});

test('a PR that needs no documentation changes says so', async ({ page }) => {
  await setUpRepository(page);
  await analysePullRequest(page, E2E.prs.clean.title);
  await expect(
    page.getByText('No documentation appears to need updating for this pull request.'),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('invalid AI output fails the run with an explanation, not fake results', async ({ page }) => {
  await setUpRepository(page);
  await analysePullRequest(page, E2E.prs.broken.title);
  await expect(page.getByText('Analysis failed (AI_INVALID_OUTPUT).')).toBeVisible();
  await expect(page.getByText('Running again usually works.')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
});
