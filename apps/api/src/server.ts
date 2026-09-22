import { readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './lib/prisma.js';
import { createAIProvider } from './modules/ai/index.js';
import { loadGitHubConfig } from './modules/github/config.js';

// Works from both src/ (dev) and dist/ (prod): package.json is one level up.
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const prisma = createPrismaClient(env.DATABASE_URL);
const githubConfig = loadGitHubConfig(env);

const app = createApp({
  env,
  logger,
  version,
  db: prisma,
  github: githubConfig ? { config: githubConfig } : null,
  ai: createAIProvider(env),
  analysisConfig: {
    timeoutMs: env.AI_TIMEOUT_MS,
    maxInputTokens: env.AI_MAX_INPUT_TOKENS,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    inputUsdPerMTok: env.AI_INPUT_USD_PER_MTOK,
    outputUsdPerMTok: env.AI_OUTPUT_USD_PER_MTOK,
  },
});

// Single-instance deployment: anything still QUEUED/RUNNING was cut off by a restart.
void app.services.analysis.failInterruptedRuns().then((n) => {
  if (n > 0) logger.warn({ count: n }, 'Marked interrupted analyses as failed');
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `API listening on http://localhost:${env.PORT}`);
  if (!githubConfig) logger.warn('GitHub App not configured: GitHub features are disabled');
  if (env.AI_PROVIDER === 'none') logger.warn('AI provider not configured: analysis is disabled');
  else logger.info({ provider: env.AI_PROVIDER, model: env.AI_MODEL }, 'AI provider configured');
});

// Graceful shutdown: stop accepting requests, finish in-flight ones, close DB.
function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
