import { createPrismaClient, type Db } from '../../src/lib/prisma.js';

/**
 * Integration tests run against a separate database whose name must end in
 * "_test". The check is deliberately strict: these tests delete every row.
 */
export function getTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Create the test database and add it to apps/api/.env (see README → Testing).',
    );
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against "${dbName}": the name must end with "_test".`,
    );
  }
  return url;
}

export function createTestDb(): Db {
  return createPrismaClient(getTestDatabaseUrl());
}

/** Empties every table between tests. Faster than re-running migrations. */
export async function resetDb(db: Db) {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
