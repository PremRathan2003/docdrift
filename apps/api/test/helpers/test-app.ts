import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/lib/logger.js';
import type { Db } from '../../src/lib/prisma.js';
import type { AppDeps } from '../../src/app.js';
import type { AuthRateLimits } from '../../src/modules/auth/auth.routes.js';

export const TEST_WEB_ORIGIN = 'http://localhost:5173';

/** Limits high enough that ordinary tests never trip them. Rate-limit tests pass their own. */
const RELAXED_LIMITS: AuthRateLimits = {
  ipMax: 10_000,
  ipWindowMs: 60_000,
  accountMaxFailures: 10_000,
  accountWindowMs: 60_000,
};

export function createTestApp(
  db: Db,
  authRateLimits: AuthRateLimits = RELAXED_LIMITS,
  github: AppDeps['github'] = null,
) {
  return createApp({
    env: {
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      NODE_ENV: 'test',
      SESSION_SECRET: 'integration-test-secret-at-least-32-chars',
    },
    logger: createLogger('silent'),
    version: 'test',
    db,
    authRateLimits,
    github,
  });
}
