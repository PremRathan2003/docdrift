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
    // Anything else connected to this database can destroy a run from the
    // outside: the E2E server (test/e2e/server.ts) calls this same rebuild on
    // start, which drops the schema, and a test that had already read its rows
    // then fails with an unexplained 404. That is invisible in the failure, so
    // name the other connections here instead of leaving it a mystery.
    const others = await client.query<{ pid: number; application_name: string; state: string }>(
      `SELECT pid, application_name, state FROM pg_stat_activity
       WHERE datname = current_database() AND pid <> pg_backend_pid()`,
    );
    if (others.rows.length) {
      console.warn(
        `\n! ${others.rows.length} other connection(s) to the test database. These tests wipe it,\n` +
          `  so another process using it can make tests fail for reasons not in their code:\n` +
          others.rows
            .map((r) => `    pid ${r.pid} ${r.application_name || '(unnamed)'} — ${r.state}`)
            .join('\n') +
          `\n  A leftover E2E server is the usual one: check with  lsof -i :4100\n`,
      );
    }
  } finally {
    await client.end();
  }
}
