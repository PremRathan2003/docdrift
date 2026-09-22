import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dashboardResponseSchema, suggestionDetailResponseSchema } from '@docdrift/shared';
import { FakeAI, reply } from '../helpers/fake-ai.js';
import { createFakeGitHub, type FakeGitHubState } from '../helpers/fake-github.js';
import { createTestApp } from '../helpers/test-app.js';
import { createTestDb, resetDb } from '../helpers/test-db.js';

const db = createTestDb();
const creds = { email: 'prem@example.com', password: 'a-long-enough-password' };
const SANDBOX = 'PremRathan2003/docdrift-sandbox';
const README = '# Task API\n\nEach task: `{ "id": 1, "done": false }`.\n';
const SUGGESTED = '# Task API\n\nEach task: `{ "id": 1, "completed": false }`.\n';

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
          title: 'Rename done',
          files: [
            { filename: 'src/store.js', patch: '@@ -1 +1 @@\n-done: false\n+completed: false' },
          ],
        },
      ],
    },
    files: { [SANDBOX]: { 'README.md': README } },
  };
});
afterAll(async () => {
  await db.$disconnect();
});

const output = {
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
  ],
};

async function setup() {
  const fake = createFakeGitHub(
    new Proxy({} as FakeGitHubState, { get: (_t, k) => gh[k as keyof FakeGitHubState] }),
  );
  const app = createTestApp(db, undefined, fake, { ai: new FakeAI([reply(output)]) });
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send(creds).expect(201);
  const auth = await agent.get('/api/github/authorize');
  const state = new URL(auth.headers.location!).searchParams.get('state')!;
  await agent.get(`/api/github/callback?code=good-code&state=${state}`).expect(303);
  const { body: repo } = await agent
    .post('/api/repositories')
    .send({ githubRepoId: '9001' })
    .expect(201);
  const { body: list } = await agent.get(`/api/repositories/${repo.repository.id}/pull-requests`);
  const prId = list.pullRequests[0].id;
  const { body: started } = await agent.post(`/api/pull-requests/${prId}/analyses`).expect(202);
  await app.services.analysis.whenIdle();
  const { body: run } = await agent.get(`/api/analyses/${started.analysis.id}`);
  return { app, agent, suggestionId: run.analysis.suggestions[0].id as string };
}

const decide = (agent: request.Agent, id: string, action: string, version: number, note?: string) =>
  agent.post(`/api/suggestions/${id}/decision`).send({ action, version, note });

describe('suggestion detail', () => {
  it('returns the suggestion, the current document, allowed actions and context', async () => {
    const { agent, suggestionId } = await setup();
    const body = suggestionDetailResponseSchema.parse(
      (await agent.get(`/api/suggestions/${suggestionId}`).expect(200)).body,
    );
    expect(body.suggestion).toMatchObject({
      status: 'PENDING',
      version: 1,
      originalContent: SUGGESTED,
      currentContent: SUGGESTED,
    });
    expect(body.originalDocument).toEqual({ status: 'found', content: README });
    expect(body.allowedActions).toEqual([
      'START_REVIEW',
      'EDIT',
      'REQUEST_CHANGES',
      'APPROVE',
      'REJECT',
    ]);
    expect(body.analysis.promptVersion).toBe('v2');
    expect(body.repository.fullName).toBe(SANDBOX);
    expect(body.reviews).toEqual([]);
  });

  it('reports a documentation file that no longer exists', async () => {
    const { agent, suggestionId } = await setup();
    gh.files![SANDBOX] = {};
    const { body } = await agent.get(`/api/suggestions/${suggestionId}`).expect(200);
    expect(body.originalDocument).toEqual({ status: 'missing', content: null });
  });
});

describe('review workflow', () => {
  it('edit → approve, keeping the original AI text and a full history', async () => {
    const { agent, suggestionId } = await setup();
    await decide(agent, suggestionId, 'START_REVIEW', 1).expect(200);

    const edited = await agent
      .patch(`/api/suggestions/${suggestionId}/content`)
      .send({
        content: SUGGESTED + '\nPriority is low, medium or high.\n',
        version: 2,
        note: 'Added priority',
      })
      .expect(200);
    expect(edited.body.suggestion).toMatchObject({
      status: 'EDITED',
      version: 3,
      originalContent: SUGGESTED,
    });
    expect(edited.body.suggestion.currentContent).toContain('Priority is');

    const approved = await decide(agent, suggestionId, 'APPROVE', 3, 'Looks right').expect(200);
    expect(approved.body.suggestion).toMatchObject({ status: 'APPROVED', version: 4 });
    expect(approved.body.allowedActions).toEqual(['REOPEN']);
    expect(approved.body.reviews.map((r: { decision: string }) => r.decision)).toEqual([
      'START_REVIEW',
      'EDIT',
      'APPROVE',
    ]);
    expect(approved.body.reviews[2]).toMatchObject({
      note: 'Looks right',
      reviewer: { email: creds.email },
    });

    // Every review stores the content at that moment.
    const rows = await db.review.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows[1]!.contentAtTime).toContain('Priority is');
    expect(await db.auditLog.count({ where: { action: 'suggestion.approve' } })).toBe(1);
  });

  it('reject and reopen', async () => {
    const { agent, suggestionId } = await setup();
    await decide(agent, suggestionId, 'REJECT', 1, 'Not needed').expect(200);
    const reopened = await decide(agent, suggestionId, 'REOPEN', 2).expect(200);
    expect(reopened.body.suggestion.status).toBe('IN_REVIEW');
  });

  it('refuses transitions the state machine does not allow', async () => {
    const { agent, suggestionId } = await setup();
    await decide(agent, suggestionId, 'APPROVE', 1).expect(200);
    const res = await agent
      .patch(`/api/suggestions/${suggestionId}/content`)
      .send({ content: 'x', version: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { status: 'APPROVED', allowedActions: ['REOPEN'] },
    });
    // Clients can't pick a status directly, or fake APPLIED.
    await decide(agent, suggestionId, 'APPLIED', 2).expect(400);
  });

  it('detects concurrent edits instead of overwriting them (optimistic locking)', async () => {
    const { agent, suggestionId } = await setup();
    await agent
      .patch(`/api/suggestions/${suggestionId}/content`)
      .send({ content: 'first edit', version: 1 })
      .expect(200);
    const stale = await agent
      .patch(`/api/suggestions/${suggestionId}/content`)
      .send({ content: 'second edit', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: 2 },
    });
    expect((await db.suggestion.findFirstOrThrow()).currentContent).toBe('first edit');
  });

  it('requires a note when requesting changes, and validates content', async () => {
    const { agent, suggestionId } = await setup();
    const noNote = await decide(agent, suggestionId, 'REQUEST_CHANGES', 1);
    expect(noNote.status).toBe(400);
    expect(noNote.body.error.details[0].path).toBe('note');
    await decide(agent, suggestionId, 'REQUEST_CHANGES', 1, 'Mention the new route too').expect(
      200,
    );
    await agent
      .patch(`/api/suggestions/${suggestionId}/content`)
      .send({ content: '', version: 2 })
      .expect(400);
  });

  it('keeps suggestions private to their owner', async () => {
    const { app, suggestionId } = await setup();
    const other = request.agent(app);
    await other
      .post('/api/auth/register')
      .send({ ...creds, email: 'other@example.com' })
      .expect(201);
    await other.get(`/api/suggestions/${suggestionId}`).expect(404);
    await decide(other, suggestionId, 'APPROVE', 1).expect(404);
    await other
      .patch(`/api/suggestions/${suggestionId}/content`)
      .send({ content: 'x', version: 1 })
      .expect(404);
  });
});

describe('dashboard', () => {
  it('summarises real data', async () => {
    const { agent, suggestionId } = await setup();
    let body = dashboardResponseSchema.parse((await agent.get('/api/dashboard').expect(200)).body);
    expect(body.repositoryCount).toBe(1);
    expect(body.suggestionCounts.PENDING).toBe(1);
    expect(body.pendingReviews[0]).toMatchObject({
      id: suggestionId,
      documentationPath: 'README.md',
      repositoryFullName: SANDBOX,
    });
    expect(body.recentAnalyses[0]).toMatchObject({ status: 'SUCCEEDED', suggestionCount: 1 });

    await decide(agent, suggestionId, 'APPROVE', 1).expect(200);
    body = dashboardResponseSchema.parse((await agent.get('/api/dashboard')).body);
    expect(body.suggestionCounts).toMatchObject({ PENDING: 0, APPROVED: 1 });
    expect(body.pendingReviews).toEqual([]);
  });
});
