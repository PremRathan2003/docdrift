import { loginRequestSchema, registerRequestSchema, type MeResponse } from '@docdrift/shared';
import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/require-auth.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthService } from './auth.service.js';
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
  type SessionCookieConfig,
} from './cookie.js';
import { createLoginThrottle } from './login-throttle.js';
import type { SessionService, SessionUser } from './session.service.js';

export interface AuthRateLimits {
  /** Requests per IP to /login and /register, per window. */
  ipMax: number;
  ipWindowMs: number;
  /** Failed logins per email before that account is temporarily locked. */
  accountMaxFailures: number;
  accountWindowMs: number;
}

export const DEFAULT_AUTH_RATE_LIMITS: AuthRateLimits = {
  ipMax: 20,
  ipWindowMs: 15 * 60_000,
  accountMaxFailures: 5,
  accountWindowMs: 15 * 60_000,
};

export interface AuthRouterDeps {
  auth: AuthService;
  sessions: SessionService;
  audit: AuditService;
  cookie: SessionCookieConfig;
  rateLimits?: AuthRateLimits;
}

/** Converts a database user into the public JSON shape (dates as ISO strings). */
export function toPublicUser(user: SessionUser): MeResponse['user'] {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');

export function authRouter({
  auth,
  sessions,
  audit,
  cookie,
  rateLimits = DEFAULT_AUTH_RATE_LIMITS,
}: AuthRouterDeps) {
  const router = Router();

  // Layer 1: per-IP limit on the endpoints that accept passwords.
  const ipLimiter = rateLimit({
    windowMs: rateLimits.ipWindowMs,
    limit: rateLimits.ipMax,
    standardHeaders: 'draft-8', // RateLimit / RateLimit-Policy headers
    legacyHeaders: false,
    handler: (_req, res, next) => {
      next(
        new AppError(
          429,
          'RATE_LIMITED',
          'Too many attempts from this network. Please wait and try again.',
          {
            retryAfterSeconds: Number(res.getHeader('Retry-After')) || undefined,
          },
        ),
      );
    },
  });

  // Layer 2: per-account limit on failed logins.
  const throttle = createLoginThrottle({
    maxFailures: rateLimits.accountMaxFailures,
    windowMs: rateLimits.accountWindowMs,
  });

  /**
   * Starts a fresh session. Any session the browser already had is revoked
   * first, which prevents "session fixation" (an attacker planting a known
   * session id in a victim's browser before they log in).
   */
  async function startSession(req: Request, res: Response, user: SessionUser) {
    await sessions.revoke(readSessionCookie(req.cookies, cookie));
    const { token, expiresAt } = await sessions.create(user.id, {
      userAgent: req.get('user-agent'),
    });
    setSessionCookie(res, cookie, token, expiresAt);
  }

  router.post('/register', ipLimiter, async (req, res) => {
    const input = registerRequestSchema.parse(req.body);
    const user = await auth.register(input);
    await startSession(req, res, user);
    await audit.record({
      action: 'auth.register',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      metadata: { ip: req.ip ?? null },
    });
    const body: MeResponse = { user: toPublicUser(user) };
    res.status(201).json(body);
  });

  router.post('/login', ipLimiter, async (req, res) => {
    const input = loginRequestSchema.parse(req.body);

    // Checked *before* the password, so a locked account gives no signal
    // about whether a guess was right.
    const retryAfter = throttle.retryAfterSeconds(input.email);
    if (retryAfter > 0) {
      await audit.record({
        action: 'auth.login.failure',
        actorId: null,
        entityType: 'user',
        entityId: 'unknown',
        metadata: { reason: 'account_throttled', ip: req.ip ?? null },
      });
      res.setHeader('Retry-After', String(retryAfter));
      throw new AppError(
        429,
        'ACCOUNT_THROTTLED',
        'Too many failed attempts for this account. Please wait and try again.',
        {
          retryAfterSeconds: retryAfter,
        },
      );
    }

    const result = await auth.verifyCredentials(input);
    if (!result.ok) {
      throttle.recordFailure(input.email);
      await audit.record({
        action: 'auth.login.failure',
        actorId: null,
        entityType: 'user',
        // For unknown emails we don't store the typed email: it may be a
        // typo of someone's password, and it is personal data we don't need.
        entityId: result.reason === 'wrong_password' ? result.userId : 'unknown',
        metadata: { reason: result.reason, ip: req.ip ?? null },
      });
      throw invalidCredentials();
    }

    throttle.reset(input.email);
    await startSession(req, res, result.user);
    await audit.record({
      action: 'auth.login.success',
      actorId: result.user.id,
      entityType: 'user',
      entityId: result.user.id,
      metadata: { ip: req.ip ?? null },
    });
    const body: MeResponse = { user: toPublicUser(result.user) };
    res.json(body);
  });

  // Logout always succeeds, even without a valid session: the end state
  // ("not logged in") is the same either way.
  router.post('/logout', async (req, res) => {
    const token = readSessionCookie(req.cookies, cookie);
    const session = await sessions.validate(token);
    await sessions.revoke(token);
    clearSessionCookie(res, cookie);
    if (session) {
      await audit.record({
        action: 'auth.logout',
        actorId: session.user.id,
        entityType: 'user',
        entityId: session.user.id,
      });
    }
    res.status(204).end();
  });

  /** "Sign out everywhere": ends every session of this user, on every device. */
  router.post('/logout-all', requireAuth(sessions, cookie), async (req, res) => {
    const user = req.auth!.user;
    const revoked = await sessions.revokeAllForUser(user.id);
    clearSessionCookie(res, cookie);
    await audit.record({
      action: 'auth.logout_all',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      metadata: { sessionsRevoked: revoked },
    });
    res.status(204).end();
  });

  router.get('/me', requireAuth(sessions, cookie), (req, res) => {
    const body: MeResponse = { user: toPublicUser(req.auth!.user) };
    res.json(body);
  });

  return router;
}
