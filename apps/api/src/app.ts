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
import { createAuditService } from './modules/audit/audit.service.js';
import { authRouter, type AuthRateLimits } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { sessionCookieConfig } from './modules/auth/cookie.js';
import { createSessionService } from './modules/auth/session.service.js';
import type { GitHubAppConfig } from './modules/github/config.js';
import { createGitHubClient } from './modules/github/github-client.js';
import { githubRouter } from './modules/github/github.routes.js';
import { webhooksRouter } from './modules/github/webhooks.routes.js';
import { createGitHubService } from './modules/github/github.service.js';
import type { AIProvider } from './modules/ai/provider.js';
import { analysisRouter } from './modules/analysis/analysis.routes.js';
import { createAnalysisService, type AnalysisConfig } from './modules/analysis/analysis.service.js';
import { pullRequestsRouter } from './modules/pull-requests/pull-requests.routes.js';
import { repositoriesRouter } from './modules/repositories/repositories.routes.js';
import { suggestionsRouter } from './modules/suggestions/suggestions.routes.js';
import { docsPullRequestRouter } from './modules/suggestions/docs-pr.routes.js';
import { createDocsPullRequestService } from './modules/suggestions/docs-pr.service.js';
import { healthRouter } from './routes/health.js';

/**
 * OAuth callbacks carry a one-time `code` and our CSRF `state` in the query
 * string. They're short-lived, but credentials don't belong in logs at all.
 */
export function redactUrl(url: string): string {
  const i = url.indexOf('?');
  if (i === -1 || !url.startsWith('/api/github/callback')) return url;
  return `${url.slice(0, i)}?[redacted]`;
}

export interface AppDeps {
  env: Pick<Env, 'WEB_ORIGIN' | 'NODE_ENV' | 'SESSION_SECRET'> &
    // Optional so existing callers (and tests of other routes) need not mention
    // it; without it the webhook endpoint answers 503 and nothing else changes.
    Partial<Pick<Env, 'GITHUB_WEBHOOK_SECRET'>>;
  logger: Logger;
  version: string;
  db: Db;
  /** Defaults to `SELECT 1`. Tests override it to simulate a database outage. */
  checkDatabase?: () => Promise<void>;
  /** Defaults to DEFAULT_AUTH_RATE_LIMITS. Tests raise them so unrelated tests aren't throttled. */
  authRateLimits?: AuthRateLimits;
  /** Null/undefined: GitHub features answer 503 GITHUB_NOT_CONFIGURED. */
  github?: { config: GitHubAppConfig; fetchImpl?: typeof fetch } | null;
  /** Null/undefined: analysis answers 503 AI_NOT_CONFIGURED. */
  ai?: AIProvider | null;
  analysisConfig?: Partial<AnalysisConfig>;
  maxAnalysesPerHour?: number;
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
        req: (req) => ({ id: req.id, method: req.method, url: redactUrl(req.url) }),
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

  // Before express.json, and with the raw bytes: a webhook signature is over
  // exactly what GitHub sent, and re-serialising parsed JSON changes it.
  app.use(
    '/api/webhooks',
    express.raw({ type: 'application/json', limit: '5mb' }),
    webhooksRouter({
      db,
      secret: env.GITHUB_WEBHOOK_SECRET ?? null,
      logger: deps.logger,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // --- wiring: build services once, hand them to the routers that need them
  const cookie = sessionCookieConfig(env.NODE_ENV);
  const sessions = createSessionService({ db, secret: env.SESSION_SECRET });
  const auth = createAuthService({ db });
  const audit = createAuditService({ db, logger: deps.logger });
  const github = deps.github
    ? createGitHubService({
        db,
        config: deps.github.config,
        client: createGitHubClient({ fetchImpl: deps.github.fetchImpl }),
        oauthFetch: deps.github.fetchImpl,
      })
    : null;
  const analysis = createAnalysisService({
    db,
    github,
    ai: deps.ai ?? null,
    logger: deps.logger,
    config: { timeoutMs: 90_000, maxInputTokens: 30_000, ...deps.analysisConfig },
  });
  const checkDatabase =
    deps.checkDatabase ??
    (async () => {
      await db.$queryRaw`SELECT 1`;
    });

  app.use('/api', healthRouter({ version: deps.version, checkDatabase }));
  app.use(
    '/api/auth',
    authRouter({ auth, sessions, audit, cookie, rateLimits: deps.authRateLimits }),
  );

  app.use('/api/github', githubRouter({ github, sessions, audit, cookie }));
  app.use('/api/repositories', repositoriesRouter({ db, github, sessions, audit, cookie }));

  app.use('/api', pullRequestsRouter({ db, github, sessions, cookie }));
  app.use(
    '/api',
    analysisRouter({ db, analysis, sessions, cookie, maxRunsPerHour: deps.maxAnalysesPerHour }),
  );

  app.use('/api', suggestionsRouter({ db, github, sessions, audit, cookie }));
  app.use(
    '/api',
    docsPullRequestRouter({
      db,
      docsPr: github ? createDocsPullRequestService({ db, github, logger: deps.logger }) : null,
      sessions,
      audit,
      cookie,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  // Exposed for server startup (recovering interrupted runs) and for tests.
  return Object.assign(app, { services: { analysis } });
}
