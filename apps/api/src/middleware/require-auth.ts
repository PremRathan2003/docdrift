import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import {
  readSessionCookie,
  setSessionCookie,
  type SessionCookieConfig,
} from '../modules/auth/cookie.js';
import type { SessionService, SessionUser } from '../modules/auth/session.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth. Present on every request that reached a protected handler. */
      auth?: { sessionId: string; user: SessionUser };
    }
  }
}

/**
 * Protects a route: responds 401 unless the request has a valid session cookie.
 * If the session's expiry slid forward, the cookie's expiry is refreshed too.
 */
export function requireAuth(sessions: SessionService, cookie: SessionCookieConfig): RequestHandler {
  return async (req, res, next) => {
    const token = readSessionCookie(req.cookies, cookie);
    const session = await sessions.validate(token);
    if (!session || !token) {
      return next(new AppError(401, 'UNAUTHENTICATED', 'You need to sign in'));
    }
    setSessionCookie(res, cookie, token, session.expiresAt);
    req.auth = { sessionId: session.sessionId, user: session.user };
    next();
  };
}
