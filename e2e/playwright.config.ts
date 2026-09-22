import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: a real browser against the real web app and API.
 * GitHub and the AI provider are deterministic fakes (apps/api/test/e2e/server.ts),
 * so the suite is free, needs no secrets and gives the same result every run.
 *
 * Ports differ from `npm run dev` (4000/5173), so both can run side by side.
 */
const API_PORT = 4100;
const WEB_PORT = 5174;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // Every test registers its own user, so tests are independent and can run in parallel.
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Only for environments with a preinstalled Chromium; normally unset.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: 'npm run e2e:server -w @docdrift/api',
      url: `http://localhost:${API_PORT}/api/health`,
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_ORIGIN: WEB_URL },
      reuseExistingServer: !CI,
      timeout: 60_000,
      stdout: 'pipe',
    },
    {
      // The production build (vite preview), not the dev server: it's what users
      // get, and it avoids dev-only reloads while Vite optimises dependencies.
      command: `npm run build -w @docdrift/web && npm run preview -w @docdrift/web -- --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      env: { DOCDRIFT_API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: !CI,
      timeout: 180_000,
    },
  ],
});
