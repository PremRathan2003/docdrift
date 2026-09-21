import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import type { Logger } from './lib/logger.js';
import type { Db } from './lib/prisma.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { originCheck } from './middleware/origin-check.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { sessionCookieConfig } from './modules/auth/cookie.js';
import { createSessionService } from './modules/auth/session.service.js';
import { healthRouter } from './routes/health.js';

export interface AppDeps {
  env: Pick<Env, 'WEB_ORIGIN' | 'NODE_ENV' | 'SESSION_SECRET'>;
  logger: Logger;
  version: string;
  db: Db;
  /** Defaults to `SELECT 1`. Tests override it to simulate a database outage. */
  checkDatabase?: () => Promise<void>;
}

/**
 * Builds the Express app without starting a server. Dependencies are passed
 * in, so tests can supply fakes and use Supertest without opening a port.
 */
export function createApp(deps: AppDeps) {
  const { env, db } = deps;
  const app = express();

  app.disable('x-powered-by');
  // Behind Render/Railway/Vercel there is exactly one proxy hop; needed for
  // correct client IPs (rate limiting) and secure cookies.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // One short line per request. Full headers are noise and can contain secrets.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      // The web app polls /api/health every 30s. Failures are still logged by
      // the health route itself, so skip the per-request line for it.
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN, // exactly one allowed origin, never "*"
      credentials: true,
    }),
  );
  app.use(originCheck(env.WEB_ORIGIN));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // --- wiring: build services once, hand them to the routers that need them
  const cookie = sessionCookieConfig(env.NODE_ENV);
  const sessions = createSessionService({ db, secret: env.SESSION_SECRET });
  const auth = createAuthService({ db });
  const checkDatabase =
    deps.checkDatabase ??
    (async () => {
      await db.$queryRaw`SELECT 1`;
    });

  app.use('/api', healthRouter({ version: deps.version, checkDatabase }));
  app.use('/api/auth', authRouter({ auth, sessions, cookie }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
