import type { LoginRequest, RegisterRequest } from '@docdrift/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { getDummyHash, hashPassword, needsRehash, verifyPassword } from './password.js';
import type { SessionUser } from './session.service.js';

const userSelect = { id: true, email: true, displayName: true, createdAt: true } as const;

export type CredentialsResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: 'unknown_email' }
  | { ok: false; reason: 'wrong_password'; userId: string };

export function createAuthService({ db }: { db: Db }) {
  return {
    async register(input: RegisterRequest): Promise<SessionUser> {
      const passwordHash = await hashPassword(input.password);
      try {
        return await db.user.create({
          data: { email: input.email, passwordHash, displayName: input.displayName ?? null },
          select: userSelect,
        });
      } catch (err) {
        // Rely on the database's unique index instead of "check then insert":
        // two simultaneous sign-ups with the same email can't both succeed.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
        }
        throw err;
      }
    },

    /**
     * Checks an email/password pair. Returns *why* it failed (for the audit
     * log); the route decides what the client sees, which is always the same
     * generic message.
     */
    async verifyCredentials(input: LoginRequest): Promise<CredentialsResult> {
      const user = await db.user.findUnique({
        where: { email: input.email },
        select: { ...userSelect, passwordHash: true },
      });

      // Always run one full scrypt verification so both failure cases take the same time.
      const ok = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));
      if (!user) return { ok: false, reason: 'unknown_email' };
      if (!ok) return { ok: false, reason: 'wrong_password', userId: user.id };

      // Transparently upgrade hashes made with older parameters.
      if (needsRehash(user.passwordHash)) {
        await db.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(input.password) },
        });
      }

      // Return an explicit object so passwordHash can never leak by accident.
      return {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          createdAt: user.createdAt,
        },
      };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
