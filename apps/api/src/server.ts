import { readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './lib/prisma.js';

// Works from both src/ (dev) and dist/ (prod): package.json is one level up.
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const prisma = createPrismaClient(env.DATABASE_URL);

const app = createApp({
  env,
  logger,
  version,
  db: prisma,
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `API listening on http://localhost:${env.PORT}`);
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
