import type { Request, RequestHandler, Response } from 'express';
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

/** Validates the session cookie and sets req.auth. Returns false if signed out. */
async function authenticate(
  req: Request,
  res: Response,
  sessions: SessionService,
  cookie: SessionCookieConfig,
) {
  const token = readSessionCookie(req.cookies, cookie);
  const session = await sessions.validate(token);
  if (!session || !token) return false;
  // If the session's expiry slid forward, refresh the cookie's expiry too.
  setSessionCookie(res, cookie, token, session.expiresAt);
  req.auth = { sessionId: session.sessionId, user: session.user };
  return true;
}

/** For JSON API routes: responds 401 unless the request has a valid session. */
export function requireAuth(sessions: SessionService, cookie: SessionCookieConfig): RequestHandler {
  return async (req, res, next) => {
    if (await authenticate(req, res, sessions, cookie)) return next();
    next(new AppError(401, 'UNAUTHENTICATED', 'You need to sign in'));
  };
}

/**
 * For routes the browser *navigates* to (e.g. the GitHub redirect): a JSON
 * 401 would be a dead end, so signed-out users are sent to the login page.
 */
export function requireAuthOrRedirect(
  sessions: SessionService,
  cookie: SessionCookieConfig,
  loginPath = '/login?next=%2Frepositories',
): RequestHandler {
  return async (req, res, next) => {
    if (await authenticate(req, res, sessions, cookie)) return next();
    res.redirect(303, loginPath);
  };
}
