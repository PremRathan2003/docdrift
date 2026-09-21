import { loginRequestSchema, registerRequestSchema, type MeResponse } from '@docdrift/shared';
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import type { AuthService } from './auth.service.js';
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
  type SessionCookieConfig,
} from './cookie.js';
import type { SessionService, SessionUser } from './session.service.js';

export interface AuthRouterDeps {
  auth: AuthService;
  sessions: SessionService;
  cookie: SessionCookieConfig;
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

export function authRouter({ auth, sessions, cookie }: AuthRouterDeps) {
  const router = Router();

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

  router.post('/register', async (req, res) => {
    const input = registerRequestSchema.parse(req.body);
    const user = await auth.register(input);
    await startSession(req, res, user);
    const body: MeResponse = { user: toPublicUser(user) };
    res.status(201).json(body);
  });

  router.post('/login', async (req, res) => {
    const input = loginRequestSchema.parse(req.body);
    const user = await auth.verifyCredentials(input);
    await startSession(req, res, user);
    const body: MeResponse = { user: toPublicUser(user) };
    res.json(body);
  });

  // Logout always succeeds, even without a valid session: the end state
  // ("not logged in") is the same either way.
  router.post('/logout', async (req, res) => {
    await sessions.revoke(readSessionCookie(req.cookies, cookie));
    clearSessionCookie(res, cookie);
    res.status(204).end();
  });

  router.get('/me', requireAuth(sessions, cookie), (req, res) => {
    const body: MeResponse = { user: toPublicUser(req.auth!.user) };
    res.json(body);
  });

  return router;
}
