/**
 * Local development seed. Creates one demo user so you can log in once auth
 * lands in the next milestone. Safe to run repeatedly (upsert).
 *
 * The password hash format here must match src/modules/auth (next milestone).
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { createPrismaClient } from '../src/lib/prisma.js';

const DEMO_EMAIL = 'demo@docdrift.local';
const DEMO_PASSWORD = 'demo-password-change-me';

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const prisma = createPrismaClient(url);
  try {
    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: {},
      create: {
        email: DEMO_EMAIL,
        passwordHash: hashPassword(DEMO_PASSWORD),
        displayName: 'Demo User',
      },
    });
    console.warn(`Seeded user ${user.email} (password: ${DEMO_PASSWORD}) — local development only`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
