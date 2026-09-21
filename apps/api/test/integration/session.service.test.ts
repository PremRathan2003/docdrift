import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createSessionService, SESSION_TTL_MS } from '../../src/modules/auth/session.service.js';
import { hashSessionToken } from '../../src/modules/auth/session-token.js';
import { createTestDb, resetDb } from '../helpers/test-db.js';

const db = createTestDb();
const SECRET = 'integration-test-secret-at-least-32-chars';
const DAY = 24 * 60 * 60 * 1000;

// A controllable clock: tests move time forward explicitly.
let clock = new Date('2026-01-01T00:00:00Z');
const sessions = createSessionService({ db, secret: SECRET, now: () => clock });

async function createUser(email = 'prem@example.com') {
  return db.user.create({ data: { email, passwordHash: 'not-used-here' } });
}

beforeEach(async () => {
  await resetDb(db);
  clock = new Date('2026-01-01T00:00:00Z');
});
afterAll(async () => {
  await db.$disconnect();
});

describe('session service', () => {
  it('creates a session and validates its token', async () => {
    const user = await createUser();
    const { token, expiresAt } = await sessions.create(user.id, { userAgent: 'vitest' });

    expect(expiresAt.getTime()).toBe(clock.getTime() + SESSION_TTL_MS);
    const result = await sessions.validate(token);
    expect(result?.user).toEqual({
      id: user.id,
      email: user.email,
      displayName: null,
      createdAt: user.createdAt,
    });
    expect(result?.user).not.toHaveProperty('passwordHash');
  });

  it('stores only the HMAC of the token', async () => {
    const user = await createUser();
    const { token } = await sessions.create(user.id);
    const [row] = await db.session.findMany();
    expect(row?.tokenHash).toBe(hashSessionToken(token, SECRET));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('rejects unknown, empty, oversized and wrong-secret tokens', async () => {
    const user = await createUser();
    const { token } = await sessions.create(user.id);
    const otherSecret = createSessionService({
      db,
      secret: 'a-different-secret-that-is-32-chars!',
      now: () => clock,
    });

    expect(await sessions.validate(undefined)).toBeNull();
    expect(await sessions.validate('')).toBeNull();
    expect(await sessions.validate('x'.repeat(500))).toBeNull();
    expect(await sessions.validate('not-a-real-token')).toBeNull();
    expect(await otherSecret.validate(token)).toBeNull();
  });

  it('expires idle sessions and deletes them', async () => {
    const user = await createUser();
    const { token } = await sessions.create(user.id);

    clock = new Date(clock.getTime() + 8 * DAY);
    expect(await sessions.validate(token)).toBeNull();
    expect(await db.session.count()).toBe(0);
  });

  it('extends an active session only when less than half its lifetime is left', async () => {
    const user = await createUser();
    const { token, expiresAt: original } = await sessions.create(user.id);

    clock = new Date(clock.getTime() + 1 * DAY); // 6 days left: no write
    expect((await sessions.validate(token))?.expiresAt).toEqual(original);

    clock = new Date(clock.getTime() + 3 * DAY); // 3 days left: extend to now + 7 days
    const extended = await sessions.validate(token);
    expect(extended?.expiresAt).toEqual(new Date(clock.getTime() + SESSION_TTL_MS));

    clock = new Date(clock.getTime() + 6 * DAY); // past the ORIGINAL expiry, still valid
    expect(await sessions.validate(token)).not.toBeNull();
  });

  it('revokes one session (logout) without touching others', async () => {
    const user = await createUser();
    const laptop = await sessions.create(user.id);
    const phone = await sessions.create(user.id);

    await sessions.revoke(laptop.token);
    await sessions.revoke(laptop.token); // idempotent

    expect(await sessions.validate(laptop.token)).toBeNull();
    expect(await sessions.validate(phone.token)).not.toBeNull();
  });

  it('revokes all sessions of one user only', async () => {
    const prem = await createUser('prem@example.com');
    const other = await createUser('other@example.com');
    await sessions.create(prem.id);
    await sessions.create(prem.id);
    const otherSession = await sessions.create(other.id);

    expect(await sessions.revokeAllForUser(prem.id)).toBe(2);
    expect(await sessions.validate(otherSession.token)).not.toBeNull();
  });

  it('cleans up expired sessions in bulk', async () => {
    const user = await createUser();
    await sessions.create(user.id);
    clock = new Date(clock.getTime() + 4 * DAY);
    await sessions.create(user.id);
    clock = new Date(clock.getTime() + 4 * DAY); // first expired, second has 3 days left

    expect(await sessions.deleteExpired()).toBe(1);
    expect(await db.session.count()).toBe(1);
  });

  it('deletes sessions when their user is deleted (cascade)', async () => {
    const user = await createUser();
    await sessions.create(user.id);
    await db.user.delete({ where: { id: user.id } });
    expect(await db.session.count()).toBe(0);
  });
});
