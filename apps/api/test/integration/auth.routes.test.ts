import { randomBytes, scryptSync } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { meResponseSchema } from '@docdrift/shared';
import { createTestApp, TEST_WEB_ORIGIN } from '../helpers/test-app.js';
import { createTestDb, resetDb } from '../helpers/test-db.js';

const db = createTestDb();
const app = createTestApp(db);

const creds = { email: 'prem@example.com', password: 'a-long-enough-password' };

/** A cookie-keeping client, like a browser tab. */
const browser = () => request.agent(app);

function sessionCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('docdrift_session='));
}

beforeEach(async () => {
  await resetDb(db);
});
afterAll(async () => {
  await db.$disconnect();
});

describe('POST /api/auth/register', () => {
  it('creates the user, starts a session and returns only public fields', async () => {
    const res = await browser()
      .post('/api/auth/register')
      .send({ ...creds, email: '  Prem@Example.com ', displayName: 'Prem' });

    expect(res.status).toBe(201);
    const body = meResponseSchema.parse(res.body);
    expect(body.user).toMatchObject({ email: 'prem@example.com', displayName: 'Prem' });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);

    const stored = await db.user.findUniqueOrThrow({ where: { email: 'prem@example.com' } });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
  });

  it('rejects a duplicate email with 409', async () => {
    await browser().post('/api/auth/register').send(creds).expect(201);
    const res = await browser()
      .post('/api/auth/register')
      .send({ ...creds, email: 'PREM@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns field-level validation errors without echoing the password', async () => {
    const res = await browser()
      .post('/api/auth/register')
      .send({ email: 'nope', password: 'short-pw' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'email',
      'password',
    ]);
    expect(JSON.stringify(res.body)).not.toContain('short-pw');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await browser().post('/api/auth/register').send(creds).expect(201);
  });

  it('logs in with correct credentials (email is case-insensitive)', async () => {
    const res = await browser()
      .post('/api/auth/login')
      .send({ ...creds, email: 'PREM@EXAMPLE.COM' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('prem@example.com');
    expect(sessionCookie(res)).toBeDefined();
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await browser()
      .post('/api/auth/login')
      .send({ ...creds, password: 'wrong-password!' });
    const unknownEmail = await browser()
      .post('/api/auth/login')
      .send({ ...creds, email: 'nobody@example.com' });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password',
      });
      expect(sessionCookie(res)).toBeUndefined();
    }
  });

  it('replaces the previous session instead of keeping it (no session fixation)', async () => {
    const tab = browser();
    await tab.post('/api/auth/login').send(creds).expect(200);
    await tab.post('/api/auth/login').send(creds).expect(200);
    // One from register (other agent) + only one from this tab.
    expect(await db.session.count()).toBe(2);
  });

  it('upgrades a password hash made with older, weaker parameters on login', async () => {
    // Build a valid hash for the same password, but with N=2^14, p=1.
    const salt = randomBytes(16);
    const key = scryptSync(creds.password, salt, 64, { N: 2 ** 14, r: 8, p: 1 });
    const oldHash = `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
    await db.user.update({ where: { email: creds.email }, data: { passwordHash: oldHash } });

    await browser().post('/api/auth/login').send(creds).expect(200);

    const user = await db.user.findUniqueOrThrow({ where: { email: creds.email } });
    expect(user.passwordHash).toMatch(/^scrypt\$32768\$8\$3\$/);
    // And the upgraded hash still works.
    await browser().post('/api/auth/login').send(creds).expect(200);
  });
});

describe('GET /api/auth/me and POST /api/auth/logout', () => {
  it('returns the current user only while logged in', async () => {
    const tab = browser();
    await tab.get('/api/auth/me').expect(401);

    await tab.post('/api/auth/register').send(creds).expect(201);
    const me = await tab.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe(creds.email);

    const out = await tab.post('/api/auth/logout').expect(204);
    expect(sessionCookie(out)).toMatch(/Expires=Thu, 01 Jan 1970/);

    const after = await tab.get('/api/auth/me');
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('UNAUTHENTICATED');
    expect(await db.session.count()).toBe(0);
  });

  it('logout succeeds even without a session', async () => {
    await browser().post('/api/auth/logout').expect(204);
  });

  it('rejects a forged cookie', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'docdrift_session=forged-token-value');
    expect(res.status).toBe(401);
  });
});

describe('CSRF protection', () => {
  it('blocks login attempts coming from another website', async () => {
    const res = await browser()
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send(creds);
    expect(res.status).toBe(403);
  });

  it('allows the web app origin', async () => {
    await browser()
      .post('/api/auth/register')
      .set('Origin', TEST_WEB_ORIGIN)
      .send(creds)
      .expect(201);
  });
});
