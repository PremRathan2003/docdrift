import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { GitHubStatus } from '@docdrift/shared';
import { Router, type CookieOptions, type Request, type Response } from 'express';
import { requireAuth, requireAuthOrRedirect } from '../../middleware/require-auth.js';
import type { AuditService } from '../audit/audit.service.js';
import type { SessionCookieConfig } from '../auth/cookie.js';
import type { SessionService } from '../auth/session.service.js';
import { GitHubError } from './github-client.js';
import type { GitHubService } from './github.service.js';

const STATE_COOKIE = 'docdrift_gh_oauth_state';
const STATE_TTL_MS = 10 * 60_000;

export interface GitHubRouterDeps {
  github: GitHubService | null;
  sessions: SessionService;
  audit: AuditService;
  cookie: SessionCookieConfig;
}

function stateCookieOptions(secure: boolean): CookieOptions {
  // Scoped to /api/github so it's never sent anywhere else. SameSite=Lax is
  // still sent on GitHub's top-level redirect back to us (a GET navigation).
  return { httpOnly: true, secure, sameSite: 'lax', path: '/api/github' };
}

function sameState(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Where the browser lands after the flow; the web app shows a message for each outcome. */
const done = (res: Response, outcome: string) =>
  res.redirect(303, `/repositories?github=${encodeURIComponent(outcome)}`);

export function githubRouter({ github, sessions, audit, cookie }: GitHubRouterDeps) {
  const router = Router();
  const browserAuth = requireAuthOrRedirect(sessions, cookie);

  router.get('/status', requireAuth(sessions, cookie), async (req, res) => {
    const installations = github ? await github.listInstallations(req.auth!.user.id) : [];
    const body: GitHubStatus = {
      configured: github !== null,
      installations: installations.map((i) => ({
        id: i.id,
        installationId: String(i.installationId),
        accountLogin: i.accountLogin,
        accountType: i.accountType,
      })),
    };
    res.json(body);
  });

  /** Step 1a: install the app on GitHub (or change which repositories it can see). */
  router.get('/install', browserAuth, (_req, res) => {
    if (!github) return done(res, 'not_configured');
    res.redirect(
      303,
      `https://github.com/apps/${encodeURIComponent(github.config.slug)}/installations/new`,
    );
  });

  /**
   * Step 1b: ask GitHub who the user is, with a CSRF `state` we can verify.
   * Used directly ("link an existing installation") and as the second leg of
   * an install: GitHub doesn't reliably return `state` after an installation,
   * so state-less callbacks are bounced through here instead of trusted.
   */
  router.get('/authorize', browserAuth, (_req, res) => {
    if (!github) return done(res, 'not_configured');
    const state = randomBytes(32).toString('base64url');
    res.cookie(STATE_COOKIE, state, { ...stateCookieOptions(cookie.secure), maxAge: STATE_TTL_MS });
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', github.config.clientId);
    url.searchParams.set('state', state);
    res.redirect(303, url.toString());
  });

  /** Step 2: GitHub sends the browser back here. */
  router.get('/callback', browserAuth, async (req: Request, res: Response) => {
    if (!github) return done(res, 'not_configured');
    const q = req.query;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const code = str(q.code);
    const state = str(q.state);
    const claimedInstallationId = str(q.installation_id);
    const user = req.auth!.user;

    if (str(q.error)) return done(res, 'denied');

    if (!state) {
      // Came straight from an installation. We don't trust a state-less code:
      // re-run authorization with a state (instant for an already-authorized user).
      return res.redirect(303, '/api/github/authorize');
    }

    const expected = str((req.cookies as Record<string, unknown>)[STATE_COOKIE]);
    res.clearCookie(STATE_COOKIE, stateCookieOptions(cookie.secure));
    if (!expected || !sameState(state, expected) || !code) return done(res, 'state_mismatch');

    let linked: string[];
    try {
      linked = await github.linkInstallationsFromCode(user.id, code);
    } catch (err) {
      req.log.warn({ err: err instanceof GitHubError ? err.code : err }, 'GitHub link failed');
      return done(res, 'github_error');
    }

    if (claimedInstallationId && !linked.includes(claimedInstallationId)) {
      await audit.record({
        action: 'github.installation.rejected',
        actorId: user.id,
        entityType: 'github_installation',
        entityId: claimedInstallationId.slice(0, 30),
        metadata: { ip: req.ip ?? null },
      });
      return done(res, 'installation_not_verified');
    }

    await audit.record({
      action: 'github.link',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      metadata: { installations: linked.length },
    });
    done(res, linked.length > 0 ? 'connected' : 'no_installations');
  });

  return router;
}
