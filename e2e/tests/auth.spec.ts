import { expect, test } from '@playwright/test';
import { PASSWORD, register } from './helpers';

test('register, sign out, and sign back in to the page you asked for', async ({ page }) => {
  const email = await register(page);
  await expect(page.getByRole('heading', { name: 'Welcome, Prem' })).toBeVisible();
  // A new user gets a checklist built from their real progress.
  const checklist = page.getByRole('region', { name: 'Getting started' });
  await expect(checklist).toContainText('0 of 4 done');
  await expect(checklist.getByRole('link', { name: 'Connect GitHub' })).toBeVisible();

  await page.getByRole('button', { name: /Prem/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);

  // Protected pages send you to sign in, then back where you were going.
  await page.goto('/repositories');
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/repositories$/);
});

test('wrong password shows one generic error', async ({ page, browser }) => {
  const email = await register(page);

  // A separate browser context is a clean, signed-out browser. (Clearing cookies
  // on the first one races with dashboard requests still in flight.)
  const guest = await browser.newContext();
  const signedOut = await guest.newPage();
  await signedOut.goto('/login');
  await signedOut.getByLabel('Email').fill(email);
  await signedOut.getByLabel('Password').fill('not the right password');
  await signedOut.getByRole('button', { name: 'Sign in' }).click();
  await expect(signedOut.getByRole('alert')).toContainText(/email or password/i);
  await expect(signedOut).toHaveURL(/\/login/);
  await guest.close();
});
