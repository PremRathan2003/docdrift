import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { getTestDatabaseUrl } from './test-db.js';

/**
 * Runs once before all integration tests: wipes the test database and applies
 * every committed migration in order. Applying the real migration files (not
 * `prisma db push`) means the tests also prove our migrations work.
 */
export default async function setup() {
  const client = new pg.Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const migrationsDir = join(import.meta.dirname, '../../prisma/migrations');
    const migrations = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const name of migrations) {
      await client.query(readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}
