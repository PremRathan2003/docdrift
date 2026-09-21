import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';
import { createTestDb, resetDb } from '../helpers/test-db.js';

const db = createTestDb();
const creds = { email: 'prem@example.com', password: 'a-long-enough-password' };
const wrong = { ...creds, password: 'wrong-password!' };

beforeEach(async () => {
  await resetDb(db);
});
afterAll(async () => {
  await db.$disconnect();
});

describe('per-account login throttle', () => {
  // Tight limits so the test stays fast; a fresh app = fresh counters.
  const limits = {
    ipMax: 1000,
    ipWindowMs: 60_000,
    accountMaxFailures: 3,
    accountWindowMs: 60_000,
  };

  it('locks an account after repeated failures, even for the right password', async () => {
    const app = createTestApp(db, limits);
    await request(app).post('/api/auth/register').send(creds).expect(201);

    for (let i = 0; i < 3; i++) await request(app).post('/api/auth/login').send(wrong).expect(401);

    const locked = await request(app).post('/api/auth/login').send(creds);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_THROTTLED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);

    // Other accounts are unaffected.
    await request(app)
      .post('/api/auth/register')
      .send({ ...creds, email: 'someone@example.com' })
      .expect(201);
    await request(app)
      .post('/api/auth/login')
      .send({ ...creds, email: 'someone@example.com' })
      .expect(200);
  });

  it('a successful login clears earlier failures', async () => {
    const app = createTestApp(db, limits);
    await request(app).post('/api/auth/register').send(creds).expect(201);

    await request(app).post('/api/auth/login').send(wrong).expect(401);
    await request(app).post('/api/auth/login').send(wrong).expect(401);
    await request(app).post('/api/auth/login').send(creds).expect(200);
    await request(app).post('/api/auth/login').send(wrong).expect(401);
    await request(app).post('/api/auth/login').send(wrong).expect(401);
    await request(app).post('/api/auth/login').send(creds).expect(200);
  });

  it('records throttled attempts in the audit log', async () => {
    const app = createTestApp(db, limits);
    await request(app).post('/api/auth/register').send(creds).expect(201);
    for (let i = 0; i < 4; i++) await request(app).post('/api/auth/login').send(wrong);

    const reasons = (await db.auditLog.findMany({ where: { action: 'auth.login.failure' } })).map(
      (a) => (a.metadata as { reason: string }).reason,
    );
    expect(reasons.filter((r) => r === 'account_throttled')).toHaveLength(1);
  });
});

describe('per-IP limit', () => {
  it('limits requests to /login and /register from one address', async () => {
    const app = createTestApp(db, {
      ipMax: 3,
      ipWindowMs: 60_000,
      accountMaxFailures: 1000,
      accountWindowMs: 60_000,
    });

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ ...wrong, email: `u${i}@example.com` })
        .expect(401);
    }
    const blocked = await request(app).post('/api/auth/login').send(wrong);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['ratelimit-policy']).toBeDefined();

    // Endpoints without passwords are not limited by it.
    await request(app).get('/api/auth/me').expect(401);
  });
});
