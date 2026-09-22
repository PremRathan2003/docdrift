import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { E2E, analysePullRequest, setUpRepository } from './helpers';

const REVIEWER_NOTE = 'Checked against the store change.';

/** Moves the Monaco cursor to the end of the document (the shortcut differs on macOS). */
async function editorToEnd(page: Page) {
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
}

async function openDriftSuggestion(page: Page) {
  await setUpRepository(page);
  await analysePullRequest(page, E2E.prs.drift.title);
  const card = page.getByRole('article', { name: 'README.md' });
  await expect(card).toContainText('still use `done`');
  // The confidence is labelled as the model's own estimate, never as accuracy.
  await expect(card).toContainText('Model’s self-reported confidence: 82%');
  await card.getByRole('link', { name: 'Review changes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'README.md' })).toBeVisible();
}

test('analyse a PR, edit the suggestion, approve it and download a patch', async ({ page }) => {
  await openDriftSuggestion(page);

  // The diff compares the document on the PR branch with the suggestion.
  const diff = page.getByRole('table', { name: 'Proposed changes to README.md' });
  await expect(diff.getByRole('row', { name: /^\d+ − Each task .*"done": false/ })).toBeVisible();
  await expect(
    diff.getByRole('row', { name: /^\d+ \+ Each task .*"completed": false/ }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.getByText('started reviewing')).toBeVisible();

  // Edit in the Monaco editor and save.
  await page.getByRole('tab', { name: 'Edit' }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 20_000 });
  await editorToEnd(page);
  await page.keyboard.type('\nTasks can also have a priority.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('edited the suggestion')).toBeVisible();

  // The AI's original text is kept unchanged.
  await page.getByRole('tab', { name: 'Original AI suggestion' }).click();
  await expect(page.getByRole('tabpanel')).not.toContainText('priority');

  // Requesting changes needs a note.
  await page.getByRole('button', { name: 'Request changes' }).click();
  await expect(page.locator('#note-error')).toBeVisible();

  await page.getByLabel(/^Note/).fill(REVIEWER_NOTE);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect(page.getByText(`“${REVIEWER_NOTE}”`)).toBeVisible();

  // The downloaded patch contains the AI change and the reviewer's edit.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download approved patch' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('README.md.patch');
  const patch = await readFile((await download.path())!, 'utf8');
  expect(patch).toContain('--- a/README.md');
  expect(patch).toContain('+++ b/README.md');
  expect(patch).toContain('+Each task looks like `{ "id": 1, "completed": false }`.');
  expect(patch).toContain('+Tasks can also have a priority.');

  // The dashboard counts come from the database.
  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  const approved = page.locator('dl > div', { hasText: 'Approved' });
  await expect(approved.locator('dd')).toHaveText('1');
  await expect(page.getByText('Nothing waiting for you.')).toBeVisible();
  // Every getting-started step is now done, so the checklist is gone.
  await expect(page.getByRole('region', { name: 'Getting started' })).toHaveCount(0);
});

test('reject, then reopen a suggestion', async ({ page }) => {
  await openDriftSuggestion(page);

  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
  // A rejected suggestion can only be reopened: no approving or downloading.
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download approved patch' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await expect(page.getByText('reopened')).toBeVisible();
});

test('a stale tab cannot overwrite a newer review', async ({ page }) => {
  await openDriftSuggestion(page);

  // Same user, second tab, same suggestion.
  const other = await page.context().newPage();
  await other.goto(page.url());
  await expect(other.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();

  // First tab moves the suggestion on…
  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.getByText('started reviewing')).toBeVisible();

  // …so the second tab's action is refused instead of silently winning.
  await other.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(other.getByText('Someone changed this suggestion')).toBeVisible();
  await other.getByRole('button', { name: 'Load the latest version' }).click();
  await expect(other.getByText('started reviewing')).toBeVisible();
  await expect(other.getByText('Someone changed this suggestion')).toHaveCount(0);
});
