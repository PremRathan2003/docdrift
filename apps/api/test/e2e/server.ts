/**
 * API server for the Playwright end-to-end tests.
 *
 * It is the real app (real routes, sessions, database, analysis queue and
 * validation) with the two outside services swapped for deterministic fakes:
 *   - GitHub: the in-memory fake used by the integration tests.
 *   - AI: a scripted provider that answers per pull request (below).
 * So the browser tests cost nothing, need no secrets and give the same result
 * every time. This file lives under test/ and is never built or deployed.
 *
 * Database: DATABASE_URL_TEST (name must end in "_test"). It is wiped and
 * rebuilt from the migrations on every start.
 */
import { existsSync } from 'node:fs';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/lib/logger.js';
import {
  AIProviderError,
  type AIProvider,
  type JsonGenerationRequest,
  type JsonGenerationResult,
} from '../../src/modules/ai/provider.js';
import rebuildTestDatabase from '../helpers/global-integration-setup.js';
import { createFakeGitHub } from '../helpers/fake-github.js';
import { createTestDb } from '../helpers/test-db.js';
import { E2E, README, README_UPDATED } from './fixtures.js';

const envFile = new URL('../../.env', import.meta.url);
if (!process.env.DATABASE_URL_TEST && existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.E2E_API_PORT ?? 4100);
const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? 'http://localhost:5174';

/** Answers depend on the PR title, so each test can pick a scenario by opening a PR. */
class ScriptedAI implements AIProvider {
  readonly name = 'fake';
  readonly model = 'e2e-fake-model';

  async generateJson(req: JsonGenerationRequest): Promise<JsonGenerationResult> {
    // A short pause so the UI really goes through its "running" state.
    await new Promise((r) => setTimeout(r, 300));
    const usage = { inputTokens: 1200, outputTokens: 300 };
    const ok = (body: unknown): JsonGenerationResult => ({
      text: JSON.stringify(body),
      usage,
      finishReason: 'STOP',
    });

    if (req.user.includes(`Title: ${E2E.prs.drift.title}`)) {
      return ok({
        summary: 'The task field `done` was renamed to `completed`; the README still shows `done`.',
        recommendations: [
          {
            documentationPath: 'README.md',
            reason: 'The README example and the endpoint description still use `done`.',
            evidence: [{ filePath: 'src/store.js', detail: '`done` renamed to `completed`' }],
            suggestedUpdate: README_UPDATED,
            modelConfidence: 0.82,
            uncertainty: 'The routes file was not part of the diff.',
          },
        ],
      });
    }
    if (req.user.includes(`Title: ${E2E.prs.clean.title}`)) {
      return ok({
        summary: 'Internal refactor; no documented behaviour changed.',
        recommendations: [],
      });
    }
    if (req.user.includes(`Title: ${E2E.prs.broken.title}`)) {
      // Never valid JSON: the pipeline retries, then fails the run with AI_INVALID_OUTPUT.
      return {
        text: 'Sure! Here is my analysis: the docs look fine.',
        usage,
        finishReason: 'STOP',
      };
    }
    throw new AIProviderError('AI_BAD_REQUEST', 'E2E fake AI: no script for this pull request');
  }
}

await rebuildTestDatabase();
const db = createTestDb();

const github = createFakeGitHub({
  codes: { [E2E.oauthCode]: 'e2e-user' },
  userInstallations: { 'e2e-user': [E2E.installationId] },
  installations: {
    [E2E.installationId]: {
      login: E2E.owner,
      type: 'User',
      repos: [
        { id: 9001, name: E2E.repo, owner: E2E.owner },
        { id: 9002, name: 'website', owner: E2E.owner, private: true },
      ],
    },
  },
  pulls: {
    [`${E2E.owner}/${E2E.repo}`]: [
      {
        number: 1,
        title: E2E.prs.drift.title,
        headSha: 'a1b2c3d4e5f6',
        files: [
          {
            filename: 'src/store.js',
            additions: 1,
            deletions: 1,
            patch:
              '@@ -1,3 +1,3 @@\n-  const task = { id, done: false };\n+  const task = { id, completed: false };\n   tasks.push(task);',
          },
        ],
      },
      {
        number: 2,
        title: E2E.prs.clean.title,
        files: [{ filename: 'src/log.js', patch: '@@ -1 +1 @@\n-console.log(x)\n+logger.info(x)' }],
      },
      {
        number: 3,
        title: E2E.prs.broken.title,
        files: [
          { filename: 'src/cache.js', patch: '@@ -1 +1 @@\n-const ttl = 60\n+const ttl = 120' },
        ],
      },
    ],
  },
  files: {
    [`${E2E.owner}/${E2E.repo}`]: {
      'README.md': README,
      'src/store.js': 'export const tasks = [];\n',
    },
  },
});

const app = createApp({
  env: {
    WEB_ORIGIN,
    NODE_ENV: 'test',
    SESSION_SECRET: 'e2e-only-session-secret-at-least-32-chars',
  },
  logger: createLogger(process.env.E2E_LOG_LEVEL === 'info' ? 'info' : 'error'),
  version: 'e2e',
  db,
  github,
  ai: new ScriptedAI(),
  // Every test registers a user from the same IP, which the real sign-in limits
  // would (correctly) block. Rate limiting has its own integration tests.
  authRateLimits: {
    ipMax: 10_000,
    ipWindowMs: 60_000,
    accountMaxFailures: 10_000,
    accountWindowMs: 60_000,
  },
  // Retries don't need real back-off waits in tests.
  analysisConfig: { sleep: async () => {} },
});

const server = app.listen(PORT, () => {
  console.warn(`E2E API listening on http://localhost:${PORT} (fake GitHub + scripted AI)`);
});
const stop = () => server.close(() => void db.$disconnect().finally(() => process.exit(0)));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
