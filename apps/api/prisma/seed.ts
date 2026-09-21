/**
 * Local development seed. Creates (or resets) one demo user so you can log in.
 * Safe to run repeatedly.
 */
import { createPrismaClient } from '../src/lib/prisma.js';
import { hashPassword } from '../src/modules/auth/password.js';

const DEMO_EMAIL = 'demo@docdrift.local';
const DEMO_PASSWORD = 'demo-password-change-me';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const prisma = createPrismaClient(url);
  try {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      // Re-seeding resets the demo password (and upgrades old hash formats).
      update: { passwordHash },
      create: { email: DEMO_EMAIL, passwordHash, displayName: 'Demo User' },
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
