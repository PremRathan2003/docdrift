/**
 * The documentation pull request, end to end against the real routes, the real
 * database and the fake GitHub — the one flow that writes to a repository.
 *
 * The fake records what was pushed, so these tests assert the commit and the
 * pull request DocDrift actually created, not just the JSON it returned.
 */
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeAI, reply } from '../helpers/fake-ai.js';
import { createFakeGitHub, liveState, type FakeGitHubState } from '../helpers/fake-github.js';
import { createTestApp } from '../helpers/test-app.js';
import { createTestDb, resetDb } from '../helpers/test-db.js';

const db = createTestDb();
const creds = { email: 'prem@example.com', password: 'a-long-enough-password' };
const SANDBOX = 'PremRathan2003/docdrift-sandbox';
const README = '# Task API\n\nEach task: `{ "id": 1, "done": false }`.\n';
const SUGGESTED = '# Task API\n\nEach task: `{ "id": 1, "completed": false }`.\n';
const GUIDE = '# Guide\n\nThe `done` field marks completion.\n';
const GUIDE_SUGGESTED = '# Guide\n\nThe `completed` field marks completion.\n';

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
          number: 7,
          title: 'Rename done',
          headSha: 'headsha7',
          files: [
            { filename: 'src/store.js', patch: '@@ -1 +1 @@\n-done: false\n+completed: false' },
          ],
        },
      ],
    },
    files: { [SANDBOX]: { 'README.md': README, 'docs/guide.md': GUIDE } },
  };
});
afterAll(async () => {
  await db.$disconnect();
});

const two = {
  summary: 'done → completed',
  recommendations: [
    {
      documentationPath: 'README.md',
      reason: 'Example uses done',
      evidence: [{ filePath: 'src/store.js', detail: 'renamed' }],
      suggestedUpdate: SUGGESTED,
      modelConfidence: 0.9,
      uncertainty: '',
    },
    {
      documentationPath: 'docs/guide.md',
      reason: 'Guide uses done',
      evidence: [{ filePath: 'src/store.js', detail: 'renamed' }],
      suggestedUpdate: GUIDE_SUGGESTED,
      modelConfidence: 0.7,
      uncertainty: '',
    },
  ],
};

async function setup(output = two) {
  const fake = createFakeGitHub(liveState(() => gh));
  const app = createTestApp(db, undefined, fake, { ai: new FakeAI([reply(output)]) });
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send(creds).expect(201);
  const auth = await agent.get('/api/github/authorize');
  const state = new URL(auth.headers.location!).searchParams.get('state')!;
  await agent.get(`/api/github/callback?code=good-code&state=${state}`).expect(303);
  const { body: repo } = await agent.post('/api/repositories').send({ githubRepoId: '9001' }).expect(201);
  const { body: list } = await agent.get(`/api/repositories/${repo.repository.id}/pull-requests`);
  const prId = list.pullRequests[0].id;
  const { body: started } = await agent.post(`/api/pull-requests/${prId}/analyses`).expect(202);
  await app.services.analysis.whenIdle();
  const { body: run } = await agent.get(`/api/analyses/${started.analysis.id}`);
  return { agent, runId: started.analysis.id as string, suggestions: run.analysis.suggestions };
}

const approve = (agent: request.Agent, s: { id: string; version: number }) =>
  agent.post(`/api/suggestions/${s.id}/decision`).send({ action: 'APPROVE', version: s.version }).expect(200);

describe('opening a documentation pull request', () => {
  it('commits the approved documents and opens one pull request into the code branch', async () => {
    const { agent, runId, suggestions } = await setup();
    await approve(agent, suggestions[0]);
    await approve(agent, suggestions[1]);

    const { body } = await agent.post(`/api/analyses/${runId}/docs-pull-request`).expect(201);
    expect(body.docsPullRequest).toMatchObject({
      base: 'feature-7',
      documents: ['README.md', 'docs/guide.md'],
      created: true,
    });

    // One commit, both documents, on top of the pull request's head.
    expect(gh.written!.commits).toHaveLength(1);
    expect(gh.written!.commits[0]).toMatchObject({
      parent: 'headsha7',
      files: [
        { path: 'README.md', content: SUGGESTED },
        { path: 'docs/guide.md', content: GUIDE_SUGGESTED },
      ],
    });
    expect(gh.written!.commits[0]!.message).toContain('#7');

    // A branch of DocDrift's own, and a pull request into the PR's branch.
    const branch = Object.keys(gh.written!.branches)[0]!;
    expect(branch).toMatch(/^docdrift\/pr-7-/);
    expect(gh.written!.pulls).toHaveLength(1);
    expect(gh.written!.pulls[0]).toMatchObject({ branch, base: 'feature-7' });
    expect(gh.written!.pulls[0]!.body).toContain('approved by @prem');

    // The suggestions are now applied, and the run carries the pull request.
    const { body: after } = await agent.get(`/api/analyses/${runId}`).expect(200);
    expect(after.analysis.suggestions.map((s: { status: string }) => s.status)).toEqual([
      'APPLIED',
      'APPLIED',
    ]);
    expect(after.analysis.docsPullRequest).toMatchObject({ base: 'feature-7', number: 901 });
  });

  it('commits only what was approved', async () => {
    const { agent, runId, suggestions } = await setup();
    await approve(agent, suggestions[0]);
    await agent
      .post(`/api/suggestions/${suggestions[1].id}/decision`)
      .send({ action: 'REJECT', version: suggestions[1].version })
      .expect(200);

    const { body } = await agent.post(`/api/analyses/${runId}/docs-pull-request`).expect(201);
    expect(body.docsPullRequest.documents).toEqual(['README.md']);
    expect(gh.written!.commits[0]!.files.map((f) => f.path)).toEqual(['README.md']);
  });

  it('a second attempt updates the same branch instead of opening another pull request', async () => {
    const { agent, runId, suggestions } = await setup();
    await approve(agent, suggestions[0]);
    const first = await agent.post(`/api/analyses/${runId}/docs-pull-request`).expect(201);

    const again = await agent.post(`/api/analyses/${runId}/docs-pull-request`).expect(200);
    expect(again.body.docsPullRequest).toMatchObject({
      number: first.body.docsPullRequest.number,
      created: false,
    });
    expect(gh.written!.pulls).toHaveLength(1);
    expect(Object.keys(gh.written!.branches)).toHaveLength(1);
    // The branch was moved again, and the second commit still carries every
    // applied document — each commit is built on the PR head, not on the last
    // documentation commit, so a partial second commit would erase the first.
    expect(gh.written!.commits).toHaveLength(2);
    expect(gh.written!.commits[1]!.files.map((f) => f.path)).toEqual(['README.md']);
  });

  it('refuses when nothing was approved, and writes nothing', async () => {
    const { agent, runId } = await setup();
    const res = await agent.post(`/api/analyses/${runId}/docs-pull-request`).expect(409);
    expect(res.body.error.code).toBe('NOTHING_APPROVED');
    expect(gh.written?.commits ?? []).toHaveLength(0);
  });

  it('refuses when the pull request has moved past the analysed commit', async () => {
    const { agent, runId, suggestions } = await setup();
    await approve(agent, suggestions[0]);
    // A new commit lands on the pull request after the analysis ran.
    gh.pulls![SANDBOX]![0]!.headSha = 'newer-sha';
    await db.pullRequest.updateMany({ data: { headSha: 'newer-sha' } });

    const res = await agent.post(`/api/analyses/${runId}/docs-pull-request`).expect(409);
    expect(res.body.error.code).toBe('STALE_ANALYSIS');
    expect(gh.written?.commits ?? []).toHaveLength(0);
  });

  it('explains what to change when the App may not write', async () => {
    const { agent, runId, suggestions } = await setup();
    await approve(agent, suggestions[0]);
    gh.readOnly = true;

    const res = await agent.post(`/api/analyses/${runId}/docs-pull-request`).expect(403);
    expect(res.body.error.code).toBe('GITHUB_WRITE_FORBIDDEN');
    expect(res.body.error.message).toContain('Contents');
  });

  it('is not reachable without signing in', async () => {
    const { runId } = await setup();
    const fake = createFakeGitHub(liveState(() => gh));
    const app = createTestApp(db, undefined, fake);
    await request(app).post(`/api/analyses/${runId}/docs-pull-request`).expect(401);
    expect(gh.written?.commits ?? []).toHaveLength(0);
  });
});
