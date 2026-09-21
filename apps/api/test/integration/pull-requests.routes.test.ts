import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pullRequestFilesResponseSchema, pullRequestListResponseSchema } from '@docdrift/shared';
import { MAX_PATCH_CHARS } from '../../src/modules/pull-requests/pull-requests.routes.js';
import { createFakeGitHub, type FakeGitHubState } from '../helpers/fake-github.js';
import { createTestApp } from '../helpers/test-app.js';
import { createTestDb, resetDb } from '../helpers/test-db.js';

const db = createTestDb();
const creds = { email: 'prem@example.com', password: 'a-long-enough-password' };
const SANDBOX = 'PremRathan2003/docdrift-sandbox';

let gh: FakeGitHubState;
beforeEach(async () => {
  await resetDb(db);
  gh = {
    codes: { 'good-code': 'prem' },
    userInstallations: { prem: [111] },
    installations: {
      111: {
        login: 'PremRathan2003',
        type: 'User',
        repos: [{ id: 9001, name: 'docdrift-sandbox', owner: 'PremRathan2003' }],
      },
    },
    pulls: {
      [SANDBOX]: [
        {
          number: 1,
          title: 'Rename done to completed',
          files: [
            {
              filename: 'src/models/task.js',
              additions: 3,
              deletions: 2,
              patch: '@@ -1,2 +1,2 @@\n-done\n+completed',
            },
            { filename: 'README.md', additions: 1, deletions: 1 },
            { filename: 'docs/logo.png', patch: null },
            { filename: 'package-lock.json', patch: 'x'.repeat(MAX_PATCH_CHARS + 10) },
          ],
        },
        { number: 2, title: 'Add priority field', state: 'MERGED', author: null },
        { number: 3, title: 'Old experiment', state: 'CLOSED' },
      ],
    },
  };
});
afterAll(async () => {
  await db.$disconnect();
});

async function setup() {
  const fake = createFakeGitHub(
    new Proxy({} as FakeGitHubState, { get: (_t, k) => gh[k as keyof FakeGitHubState] }),
  );
  const app = createTestApp(db, undefined, fake);
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send(creds).expect(201);
  const auth = await agent.get('/api/github/authorize');
  const state = new URL(auth.headers.location!).searchParams.get('state')!;
  await agent.get(`/api/github/callback?code=good-code&state=${state}`).expect(303);
  const { body } = await agent.post('/api/repositories').send({ githubRepoId: '9001' }).expect(201);
  return { app, agent, repoId: body.repository.id as string };
}

describe('pull request list', () => {
  it('syncs from GitHub and lists open PRs by default', async () => {
    const { agent, repoId } = await setup();
    const body = pullRequestListResponseSchema.parse(
      (await agent.get(`/api/repositories/${repoId}/pull-requests`).expect(200)).body,
    );
    expect(body.pullRequests.map((p) => p.number)).toEqual([1]);
    expect(body.pullRequests[0]).toMatchObject({
      changedFiles: 4,
      additions: 6,
      deletions: 3,
      latestAnalysisStatus: null,
    });
    expect(body.syncedAt).not.toBeNull();
    expect(body.syncWarning).toBeNull();
    expect(await db.pullRequest.count()).toBe(3);
  });

  it('filters by state and searches title, author and #number', async () => {
    const { agent, repoId } = await setup();
    const list = async (qs: string) =>
      (
        await agent.get(`/api/repositories/${repoId}/pull-requests?${qs}`).expect(200)
      ).body.pullRequests.map((p: { number: number }) => p.number);
    expect(await list('state=all')).toEqual([3, 2, 1]);
    expect(await list('state=merged')).toEqual([2]);
    expect(await list('state=closed')).toEqual([3]);
    expect(await list('state=all&q=PRIORITY')).toEqual([2]);
    expect(await list('state=all&q=%233')).toEqual([3]);
    await agent.get(`/api/repositories/${repoId}/pull-requests?state=bogus`).expect(400);
  });

  it('shows deleted GitHub accounts as "ghost"', async () => {
    const { agent, repoId } = await setup();
    const { body } = await agent.get(`/api/repositories/${repoId}/pull-requests?state=merged`);
    expect(body.pullRequests[0].authorLogin).toBe('ghost');
  });

  it('keeps showing saved data when GitHub is down', async () => {
    const { agent, repoId } = await setup();
    await agent.get(`/api/repositories/${repoId}/pull-requests`).expect(200);
    gh.down = true;
    const res = await agent.get(`/api/repositories/${repoId}/pull-requests?refresh=1`).expect(200);
    expect(res.body.pullRequests).toHaveLength(1);
    expect(res.body.syncWarning).toMatch(/Could not refresh/);
  });

  it('updates existing rows on refresh instead of duplicating them', async () => {
    const { agent, repoId } = await setup();
    await agent.get(`/api/repositories/${repoId}/pull-requests`).expect(200);
    gh.pulls![SANDBOX]![0]!.title = 'Rename done to completed (v2)';
    gh.pulls![SANDBOX]![0]!.headSha = 'newsha';
    const { body } = await agent
      .get(`/api/repositories/${repoId}/pull-requests?refresh=1`)
      .expect(200);
    expect(body.pullRequests[0]).toMatchObject({
      title: 'Rename done to completed (v2)',
      headSha: 'newsha',
    });
    expect(await db.pullRequest.count()).toBe(3);
  });

  it('never exposes another user’s repository or pull requests', async () => {
    const { app, agent, repoId } = await setup();
    const { body } = await agent.get(`/api/repositories/${repoId}/pull-requests`);
    const prId = body.pullRequests[0].id;

    const other = request.agent(app);
    await other
      .post('/api/auth/register')
      .send({ ...creds, email: 'other@example.com' })
      .expect(201);
    await other.get(`/api/repositories/${repoId}/pull-requests`).expect(404);
    await other.get(`/api/pull-requests/${prId}`).expect(404);
    await other.get(`/api/pull-requests/${prId}/files`).expect(404);
  });

  it('unknown /api routes still answer 404, not 401', async () => {
    const { app } = await setup();
    await request(app).get('/api/nope').expect(404);
  });
});

describe('pull request detail and files', () => {
  it('returns the PR and its classified files, handling binary and huge patches', async () => {
    const { agent, repoId } = await setup();
    const list = await agent.get(`/api/repositories/${repoId}/pull-requests`);
    const prId = list.body.pullRequests[0].id;

    const detail = await agent.get(`/api/pull-requests/${prId}`).expect(200);
    expect(detail.body.pullRequest).toMatchObject({
      number: 1,
      body: 'Body of #1',
      headRef: 'feature-1',
    });
    expect(detail.body.repository.fullName).toBe(SANDBOX);

    const files = pullRequestFilesResponseSchema.parse(
      (await agent.get(`/api/pull-requests/${prId}/files`).expect(200)).body,
    );
    expect(files.incomplete).toBe(false);
    const byName = Object.fromEntries(files.files.map((f) => [f.filename, f]));
    expect(byName['src/models/task.js']).toMatchObject({ kind: 'source', patchTruncated: false });
    expect(byName['README.md']!.kind).toBe('documentation');
    expect(byName['docs/logo.png']).toMatchObject({ kind: 'binary', patch: null });
    expect(byName['package-lock.json']).toMatchObject({ kind: 'generated', patchTruncated: true });
    expect(byName['package-lock.json']!.patch!.length).toBe(MAX_PATCH_CHARS);
  });

  it('maps a GitHub outage on files to 502', async () => {
    const { agent, repoId } = await setup();
    const list = await agent.get(`/api/repositories/${repoId}/pull-requests`);
    gh.down = true;
    const res = await agent.get(`/api/pull-requests/${list.body.pullRequests[0].id}/files`);
    expect(res.status).toBe(502);
  });
});
