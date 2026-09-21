import type { Db } from '../../lib/prisma.js';
import { generateSessionToken, hashSessionToken } from './session-token.js';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_TOKEN_LENGTH = 100;
const MAX_USER_AGENT_LENGTH = 255;

/** The user fields a validated session exposes. Never includes passwordHash. */
const sessionUserSelect = { id: true, email: true, displayName: true, createdAt: true } as const;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
}

export interface SessionServiceDeps {
  db: Db;
  secret: string;
  ttlMs?: number;
  /** Injected so tests can move time forward instead of waiting 7 days. */
  now?: () => Date;
}

export function createSessionService({
  db,
  secret,
  ttlMs = SESSION_TTL_MS,
  now = () => new Date(),
}: SessionServiceDeps) {
  const hash = (token: string) => hashSessionToken(token, secret);

  return {
    /** Creates a session and returns the raw token. This is the only time the raw token exists. */
    async create(userId: string, meta: { userAgent?: string } = {}) {
      const token = generateSessionToken();
      const expiresAt = new Date(now().getTime() + ttlMs);
      await db.session.create({
        data: {
          tokenHash: hash(token),
          userId,
          expiresAt,
          userAgent: meta.userAgent?.slice(0, MAX_USER_AGENT_LENGTH),
        },
      });
      return { token, expiresAt };
    },

    /**
     * Looks up the session for a cookie token. Returns null for unknown,
     * malformed or expired tokens. Uses a *sliding* expiry: an active user
     * stays logged in, an idle one is logged out after ttlMs.
     */
    async validate(
      token: string | undefined,
    ): Promise<{ sessionId: string; expiresAt: Date; user: SessionUser } | null> {
      if (!token || token.length > MAX_TOKEN_LENGTH) return null;

      const session = await db.session.findUnique({
        where: { tokenHash: hash(token) },
        select: { id: true, expiresAt: true, user: { select: sessionUserSelect } },
      });
      if (!session) return null;

      const current = now();
      if (session.expiresAt <= current) {
        await db.session.deleteMany({ where: { id: session.id } });
        return null;
      }

      // Only write to the database when less than half the lifetime is left,
      // instead of on every single request.
      let expiresAt = session.expiresAt;
      if (session.expiresAt.getTime() - current.getTime() < ttlMs / 2) {
        expiresAt = new Date(current.getTime() + ttlMs);
        await db.session.update({
          where: { id: session.id },
          data: { expiresAt, lastUsedAt: current },
        });
      }

      return { sessionId: session.id, expiresAt, user: session.user };
    },

    /** Logout. Idempotent: revoking an unknown token is not an error. */
    async revoke(token: string | undefined) {
      if (!token || token.length > MAX_TOKEN_LENGTH) return;
      await db.session.deleteMany({ where: { tokenHash: hash(token) } });
    },

    /** "Sign out everywhere" — also used after a password change. */
    async revokeAllForUser(userId: string) {
      const { count } = await db.session.deleteMany({ where: { userId } });
      return count;
    },

    /** Housekeeping: remove sessions that expired. Safe to run on a schedule. */
    async deleteExpired() {
      const { count } = await db.session.deleteMany({ where: { expiresAt: { lte: now() } } });
      return count;
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
