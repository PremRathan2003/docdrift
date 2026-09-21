import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/lib/logger.js';
import type { Db } from '../../src/lib/prisma.js';

export const TEST_WEB_ORIGIN = 'http://localhost:5173';

export function createTestApp(db: Db) {
  return createApp({
    env: {
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      NODE_ENV: 'test',
      SESSION_SECRET: 'integration-test-secret-at-least-32-chars',
    },
    logger: createLogger('silent'),
    version: 'test',
    db,
  });
}
