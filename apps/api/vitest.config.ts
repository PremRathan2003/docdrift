import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Unit/integration tests must never call real GitHub or LLM APIs.
    // Live tests will get their own config (vitest.live.config.ts) later.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
      SESSION_SECRET: 'test-only-secret-that-is-at-least-32-characters',
      WEB_ORIGIN: 'http://localhost:5173',
    },
  },
});
