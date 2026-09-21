import type { LoginRequest, RegisterRequest } from '@docdrift/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { getDummyHash, hashPassword, needsRehash, verifyPassword } from './password.js';
import type { SessionUser } from './session.service.js';

const userSelect = { id: true, email: true, displayName: true, createdAt: true } as const;

/** One message for "no such email" and "wrong password", so the API doesn't reveal which emails exist. */
const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');

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

    async verifyCredentials(input: LoginRequest): Promise<SessionUser> {
      const user = await db.user.findUnique({
        where: { email: input.email },
        select: { ...userSelect, passwordHash: true },
      });

      // Always run one full scrypt verification so both failure cases take the same time.
      const ok = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));
      if (!user || !ok) throw invalidCredentials();

      // Transparently upgrade hashes made with older parameters.
      if (needsRehash(user.passwordHash)) {
        await db.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(input.password) },
        });
      }

      // Return an explicit object so passwordHash can never leak by accident.
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
