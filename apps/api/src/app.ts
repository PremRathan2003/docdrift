import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import type { Logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';

export interface AppDeps {
  env: Pick<Env, 'WEB_ORIGIN' | 'NODE_ENV'>;
  logger: Logger;
  version: string;
  checkDatabase: () => Promise<void>;
}

/**
 * Builds the Express app without starting a server. Dependencies are passed
 * in, so tests can supply fakes (e.g. a database check that fails) and use
 * Supertest without opening a real port or database connection.
 */
export function createApp(deps: AppDeps) {
  const app = express();

  app.disable('x-powered-by');
  // Behind Render/Railway/Vercel there is exactly one proxy hop; needed for
  // correct client IPs (rate limiting) and secure cookies.
  if (deps.env.NODE_ENV === 'production') app.set('trust proxy', 1);

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
      origin: deps.env.WEB_ORIGIN, // exactly one allowed origin, never "*"
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', healthRouter({ version: deps.version, checkDatabase: deps.checkDatabase }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
