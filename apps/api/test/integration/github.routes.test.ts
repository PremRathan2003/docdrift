import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { availableRepositoriesResponseSchema, githubStatusSchema } from '@docdrift/shared';
import { createFakeGitHub, type FakeGitHubState } from '../helpers/fake-github.js';
import { createTestApp } from '../helpers/test-app.js';
import { createTestDb, resetDb } from '../helpers/test-db.js';

const db = createTestDb();
const creds = { email: 'prem@example.com', password: 'a-long-enough-password' };

let gh: FakeGitHubState;
beforeEach(async () => {
  await resetDb(db);
  gh = {
    codes: { 'good-code': 'prem', 'attacker-code': 'mallory' },
    userInstallations: { prem: [111], mallory: [222] },
    installations: {
      111: {
        login: 'PremRathan2003',
        type: 'User',
        repos: [
          { id: 9001, name: 'docdrift-sandbox', owner: 'PremRathan2003' },
          { id: 9002, name: 'prescripto', owner: 'PremRathan2003', private: true },
        ],
      },
      222: {
        login: 'victim-org',
        type: 'Organization',
        repos: [{ id: 7777, name: 'secret-code', owner: 'victim-org' }],
      },
    },
  };
});
afterAll(async () => {
  await db.$disconnect();
});

function appWithGitHub() {
  // The fake reads `gh` lazily, so tests can change it after creating the app.
  const fake = createFakeGitHub(
    new Proxy({} as FakeGitHubState, { get: (_t, k) => gh[k as keyof FakeGitHubState] }),
  );
  return createTestApp(db, undefined, fake);
}

async function signedIn(app: ReturnType<typeof createTestApp>, email = creds.email) {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/register')
    .send({ ...creds, email })
    .expect(201);
  return agent;
}

/** Runs the real redirect dance: /authorize sets the state cookie, GitHub returns it. */
async function completeOAuth(agent: request.Agent, code: string, extra = '') {
  const auth = await agent.get('/api/github/authorize').expect(303);
  const githubUrl = new URL(auth.headers.location!);
  expect(githubUrl.origin + githubUrl.pathname).toBe('https://github.com/login/oauth/authorize');
  const state = githubUrl.searchParams.get('state')!;
  return agent
    .get(`/api/github/callback?code=${code}&state=${encodeURIComponent(state)}${extra}`)
    .expect(303);
}

describe('connect GitHub', () => {
  it('sends signed-out browsers to the login page', async () => {
    const res = await request(appWithGitHub()).get('/api/github/install').expect(303);
    expect(res.headers.location).toBe('/login?next=%2Frepositories');
  });

  it('sends signed-in users to the app installation page', async () => {
    const agent = await signedIn(appWithGitHub());
    const res = await agent.get('/api/github/install').expect(303);
    expect(res.headers.location).toBe('https://github.com/apps/docdrift-test/installations/new');
  });

  it('never trusts a callback without state: it re-runs authorization instead', async () => {
    const agent = await signedIn(appWithGitHub());
    const res = await agent.get(
      '/api/github/callback?code=good-code&installation_id=111&setup_action=install',
    );
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/api/github/authorize');
    expect(await db.githubInstallation.count()).toBe(0);
  });

  it('links the installations GitHub says the user can access', async () => {
    const agent = await signedIn(appWithGitHub());
    const res = await completeOAuth(
      agent,
      'good-code',
      '&installation_id=111&setup_action=install',
    );
    expect(res.headers.location).toBe('/repositories?github=connected');

    const status = githubStatusSchema.parse(
      (await agent.get('/api/github/status').expect(200)).body,
    );
    expect(status).toMatchObject({
      configured: true,
      installations: [{ installationId: '111', accountLogin: 'PremRathan2003' }],
    });
    expect(await db.auditLog.count({ where: { action: 'github.link' } })).toBe(1);
  });

  it('rejects a spoofed installation_id (someone else’s installation)', async () => {
    const agent = await signedIn(appWithGitHub());
    const res = await completeOAuth(
      agent,
      'good-code',
      '&installation_id=222&setup_action=install',
    );
    expect(res.headers.location).toBe('/repositories?github=installation_not_verified');

    const linked = (await db.githubInstallation.findMany()).map((i) => String(i.installationId));
    expect(linked).not.toContain('222');
    expect(await db.auditLog.count({ where: { action: 'github.installation.rejected' } })).toBe(1);
  });

  it('rejects a wrong or missing state (CSRF)', async () => {
    const agent = await signedIn(appWithGitHub());
    await agent.get('/api/github/authorize').expect(303);
    const res = await agent.get('/api/github/callback?code=attacker-code&state=forged').expect(303);
    expect(res.headers.location).toBe('/repositories?github=state_mismatch');
    expect(await db.githubInstallation.count()).toBe(0);
  });

  it('a state cannot be replayed', async () => {
    const agent = await signedIn(appWithGitHub());
    const auth = await agent.get('/api/github/authorize');
    const state = new URL(auth.headers.location!).searchParams.get('state')!;
    await agent.get(`/api/github/callback?code=good-code&state=${state}`).expect(303);
    const again = await agent.get(`/api/github/callback?code=good-code&state=${state}`);
    expect(again.headers.location).toBe('/repositories?github=state_mismatch');
  });

  it('reports an expired or invalid code as a GitHub error', async () => {
    const agent = await signedIn(appWithGitHub());
    const res = await completeOAuth(agent, 'expired-code');
    expect(res.headers.location).toBe('/repositories?github=github_error');
  });

  it('works when GitHub is not configured on the server', async () => {
    const agent = await signedIn(createTestApp(db));
    expect((await agent.get('/api/github/status').expect(200)).body).toEqual({
      configured: false,
      installations: [],
    });
    expect((await agent.get('/api/github/install').expect(303)).headers.location).toBe(
      '/repositories?github=not_configured',
    );
    const res = await agent.get('/api/repositories/available');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('GITHUB_NOT_CONFIGURED');
  });
});

describe('repositories', () => {
  async function linked() {
    const app = appWithGitHub();
    const agent = await signedIn(app);
    await completeOAuth(agent, 'good-code');
    return { app, agent };
  }

  it('lists repositories available through the user’s installations', async () => {
    const { agent } = await linked();
    const body = availableRepositoriesResponseSchema.parse(
      (await agent.get('/api/repositories/available').expect(200)).body,
    );
    expect(body.repositories.map((r) => r.fullName)).toEqual([
      'PremRathan2003/docdrift-sandbox',
      'PremRathan2003/prescripto',
    ]);
    expect(body.repositories.every((r) => r.connectedRepositoryId === null)).toBe(true);
  });

  it('connects, lists and disconnects a repository', async () => {
    const { agent } = await linked();
    const created = await agent
      .post('/api/repositories')
      .send({ githubRepoId: '9001' })
      .expect(201);
    expect(created.body.repository).toMatchObject({
      fullName: 'PremRathan2003/docdrift-sandbox',
      defaultBranch: 'main',
      isPrivate: false,
    });

    // Connecting twice is idempotent (no duplicate row).
    await agent.post('/api/repositories').send({ githubRepoId: '9001' }).expect(201);
    const list = await agent.get('/api/repositories').expect(200);
    expect(list.body.repositories).toHaveLength(1);

    const available = await agent.get('/api/repositories/available');
    const sandbox = available.body.repositories.find(
      (r: { githubRepoId: string }) => r.githubRepoId === '9001',
    );
    expect(sandbox.connectedRepositoryId).toBe(created.body.repository.id);

    await agent.delete(`/api/repositories/${created.body.repository.id}`).expect(204);
    expect((await agent.get('/api/repositories')).body.repositories).toHaveLength(0);
    expect(
      await db.auditLog.count({
        where: { action: { in: ['repository.connect', 'repository.disconnect'] } },
      }),
    ).toBe(3);
  });

  it('refuses repositories outside the user’s installations', async () => {
    const { agent } = await linked();
    const res = await agent.post('/api/repositories').send({ githubRepoId: '7777' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('REPOSITORY_NOT_ACCESSIBLE');
    await agent.post('/api/repositories').send({ githubRepoId: 'not-a-number' }).expect(400);
  });

  it('keeps users’ repositories separate', async () => {
    const { app, agent } = await linked();
    const { body } = await agent
      .post('/api/repositories')
      .send({ githubRepoId: '9001' })
      .expect(201);

    const other = await signedIn(app, 'someone@example.com');
    expect((await other.get('/api/repositories')).body.repositories).toHaveLength(0);
    await other.delete(`/api/repositories/${body.repository.id}`).expect(404);
    expect((await agent.get('/api/repositories')).body.repositories).toHaveLength(1);
  });

  it('reports installations that were removed on GitHub instead of failing', async () => {
    const { agent } = await linked();
    delete gh.installations[111];
    const body = (await agent.get('/api/repositories/available').expect(200)).body;
    expect(body.repositories).toEqual([]);
    expect(body.unavailableInstallations).toEqual([
      { accountLogin: 'PremRathan2003', reason: expect.any(String) },
    ]);
  });

  it('maps GitHub outages to a clean 502', async () => {
    const { agent } = await linked();
    gh.down = true;
    const res = await agent.get('/api/repositories/available');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('GITHUB_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('ghs_');
  });

  it('requires a session', async () => {
    await request(appWithGitHub()).get('/api/repositories').expect(401);
  });
});
