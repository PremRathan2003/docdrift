import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Local runs read DATABASE_URL_TEST from .env; CI sets it as an env var.
if (existsSync('.env')) process.loadEnvFile('.env');

/**
 * Integration tests: real PostgreSQL (a dedicated *_test database), still no
 * network calls to GitHub or LLM providers.
 */
export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/helpers/global-integration-setup.ts'],
    // All files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
    },
  },
});
