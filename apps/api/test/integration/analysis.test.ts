import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { analysisResponseSchema } from '@docdrift/shared';
import { AIProviderError } from '../../src/modules/ai/provider.js';
import { FakeAI, reply } from '../helpers/fake-ai.js';
import { createFakeGitHub, type FakeGitHubState } from '../helpers/fake-github.js';
import { createTestApp } from '../helpers/test-app.js';
import { createTestDb, resetDb } from '../helpers/test-db.js';
import { PROMPT_VERSION } from '../../src/modules/analysis/prompts/v3.js';

const db = createTestDb();
const creds = { email: 'prem@example.com', password: 'a-long-enough-password' };
const SANDBOX = 'PremRathan2003/docdrift-sandbox';

const README =
  '# Task API\n\n## Endpoints\n\nEach task: `{ "id": 1, "done": false }`.\n\n`POST /tasks/:id/done` marks a task as done.\n';
const STORE_PATCH =
  '@@ -1,3 +1,3 @@\n-  const task = { id, done: false };\n+  const task = { id, completed: false, priority };\n const x = 1;';

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
            { filename: 'src/store.js', patch: STORE_PATCH },
            { filename: '.env', patch: '@@ -0,0 +1 @@\n+API_TOKEN=supersecretvalue123' },
            { filename: 'package-lock.json', patch: '@@ -1 +1 @@\n-a\n+b' },
          ],
        },
      ],
    },
    files: {
      [SANDBOX]: {
        'README.md': README,
        'docs/configuration.md':
          '# Configuration\n\n`TASKS_LIMIT` sets the maximum number of tasks.\n',
        'src/store.js': 'code',
      },
    },
  };
});
afterAll(async () => {
  await db.$disconnect();
});

const goodOutput = {
  summary: 'The task field `done` was renamed to `completed`; the README still shows `done`.',
  recommendations: [
    {
      documentationPath: 'README.md',
      reason: 'The README response example and endpoint use `done`.',
      evidence: [{ filePath: 'src/store.js', detail: 'done renamed to completed; priority added' }],
      suggestedUpdate: 'Each task: `{ "id": 1, "completed": false, "priority": "medium" }`.',
      modelConfidence: 0.86,
      uncertainty: 'The routes file was not changed in the shown diff.',
    },
  ],
};

const blobRequests: string[] = [];

async function setup(ai: FakeAI | null, extra: Parameters<typeof createTestApp>[3] = {}) {
  const fake = createFakeGitHub(
    new Proxy({} as FakeGitHubState, { get: (_t, k) => gh[k as keyof FakeGitHubState] }),
  );
  // Count how often file contents are downloaded, to prove the cache works.
  const counting = {
    ...fake,
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path.includes('/git/blobs/')) blobRequests.push(path);
      return fake.fetchImpl(input as string, init);
    }) as typeof fetch,
  };
  const app = createTestApp(db, undefined, counting, { ai, ...extra });
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send(creds).expect(201);
  const auth = await agent.get('/api/github/authorize');
  const state = new URL(auth.headers.location!).searchParams.get('state')!;
  await agent.get(`/api/github/callback?code=good-code&state=${state}`).expect(303);
  const { body: repo } = await agent
    .post('/api/repositories')
    .send({ githubRepoId: '9001' })
    .expect(201);
  const { body: list } = await agent
    .get(`/api/repositories/${repo.repository.id}/pull-requests`)
    .expect(200);
  return { app, agent, prId: list.pullRequests[0].id as string };
}

async function runAndWait(ctx: Awaited<ReturnType<typeof setup>>) {
  const start = await ctx.agent.post(`/api/pull-requests/${ctx.prId}/analyses`).expect(202);
  expect(start.body.analysis.status).toBe('QUEUED');
  await ctx.app.services.analysis.whenIdle();
  const { body } = await ctx.agent.get(`/api/analyses/${start.body.analysis.id}`).expect(200);
  return analysisResponseSchema.parse(body).analysis;
}

describe('running an analysis', () => {
  it('builds a safe prompt, validates the answer and stores suggestions', async () => {
    const ai = new FakeAI([reply(goodOutput)]);
    const ctx = await setup(ai);
    const run = await runAndWait(ctx);

    expect(run).toMatchObject({
      status: 'SUCCEEDED',
      provider: 'fake',
      model: 'fake-model-1',
      promptVersion: PROMPT_VERSION,
      summary: goodOutput.summary,
      attemptCount: 1,
      inputTokens: 1000,
      outputTokens: 200,
      costUsd: null, // no prices configured: never guessed
      warnings: [],
    });
    expect(run.suggestions).toHaveLength(1);
    expect(run.suggestions[0]).toMatchObject({
      documentationPath: 'README.md',
      status: 'PENDING',
      modelConfidence: 0.86,
      originalContent: goodOutput.recommendations[0]!.suggestedUpdate,
      currentContent: goodOutput.recommendations[0]!.suggestedUpdate,
    });

    // What was sent — and what wasn't.
    const prompt = ai.requests[0]!.user;
    expect(prompt).toContain('completed: false, priority');
    expect(prompt).toContain('README.md');
    expect(prompt).not.toContain('supersecretvalue123');
    expect(run.inputManifest).toMatchObject({
      filesSent: [{ filename: 'src/store.js', kind: 'source', truncated: false }],
      filesSkipped: expect.arrayContaining([
        { filename: '.env', reason: 'sensitive' },
        { filename: 'package-lock.json', reason: 'generated' },
      ]),
    });
    expect(run.inputManifest!.docsSent[0]).toMatchObject({
      path: 'README.md',
      matchedKeywords: expect.arrayContaining(['done']),
    });

    const list = await ctx.agent.get(
      `/api/repositories/${(await db.repository.findFirstOrThrow()).id}/pull-requests`,
    );
    expect(list.body.pullRequests[0].latestAnalysisStatus).toBe('SUCCEEDED');
  });

  it('computes cost only when prices are configured', async () => {
    const ctx = await setup(new FakeAI([reply(goodOutput)]), {
      analysisConfig: { sleep: async () => {}, inputUsdPerMTok: 0.3, outputUsdPerMTok: 2.5 },
    });
    const run = await runAndWait(ctx);
    expect(run.costUsd).toBeCloseTo((1000 * 0.3 + 200 * 2.5) / 1e6, 10);
  });

  it('retries malformed output and succeeds, summing token usage', async () => {
    const ctx = await setup(
      new FakeAI([reply('{"summary": "oops'), reply({ summary: 'x' }), reply(goodOutput)]),
    );
    const run = await runAndWait(ctx);
    expect(run).toMatchObject({
      status: 'SUCCEEDED',
      attemptCount: 3,
      inputTokens: 3000,
      outputTokens: 600,
    });
  });

  it('fails cleanly after repeated malformed output', async () => {
    const ctx = await setup(new FakeAI([reply('not json at all')]));
    const run = await runAndWait(ctx);
    expect(run).toMatchObject({
      status: 'FAILED',
      errorCode: 'AI_INVALID_OUTPUT',
      attemptCount: 3,
    });
    expect(run.suggestions).toEqual([]);
  });

  it('retries rate limits, but not authentication errors', async () => {
    const rate = await setup(
      new FakeAI([new AIProviderError('AI_RATE_LIMITED', 'slow down', 5), reply(goodOutput)]),
    );
    expect(await runAndWait(rate)).toMatchObject({ status: 'SUCCEEDED', attemptCount: 2 });

    await resetDb(db);
    const ai = new FakeAI([new AIProviderError('AI_AUTH', 'Gemini rejected the API key')]);
    const bad = await setup(ai);
    expect(await runAndWait(bad)).toMatchObject({
      status: 'FAILED',
      errorCode: 'AI_AUTH',
      attemptCount: 1,
    });
    expect(ai.requests).toHaveLength(1);
  });

  it('drops hallucinated paths and records a warning', async () => {
    const output = {
      ...goodOutput,
      recommendations: [
        ...goodOutput.recommendations,
        { ...goodOutput.recommendations[0]!, documentationPath: 'docs/made-up.md' },
      ],
    };
    const run = await runAndWait(await setup(new FakeAI([reply(output)])));
    expect(run.suggestions.map((s) => s.documentationPath)).toEqual(['README.md']);
    expect(run.warnings).toEqual([expect.stringContaining('docs/made-up.md')]);
  });

  it('accepts "no documentation affected" as a successful result', async () => {
    const run = await runAndWait(
      await setup(new FakeAI([reply({ summary: 'Internal refactor only.', recommendations: [] })])),
    );
    expect(run).toMatchObject({
      status: 'SUCCEEDED',
      summary: 'Internal refactor only.',
      suggestions: [],
    });
  });

  it('skips the model call when there are no documentation files', async () => {
    gh.files![SANDBOX] = { 'src/store.js': 'code' };
    const ai = new FakeAI([reply(goodOutput)]);
    const run = await runAndWait(await setup(ai));
    expect(run.status).toBe('SUCCEEDED');
    expect(run.summary).toMatch(/No documentation files/);
    expect(ai.requests).toHaveLength(0);
  });

  it('reports GitHub failures without leaking details', async () => {
    const ctx = await setup(new FakeAI([reply(goodOutput)]));
    gh.down = true;
    const run = await runAndWait(ctx);
    expect(run).toMatchObject({ status: 'FAILED', errorCode: 'GITHUB_ERROR' });
  });
});

describe('long documents', () => {
  /** A reference document well past the size that fits in a prompt. */
  const LONG_DOC = [
    '# Reference',
    '',
    '## Tasks',
    '',
    'Each task: `{ "id": 1, "done": false }`.',
    '',
    // Many unrelated sections, so the file is far too big to send whole.
    ...Array.from({ length: 200 }, (_, i) =>
      [`## Unrelated setting ${i}`, '', `Explains setting number ${i} in detail.`, ''].join('\n'),
    ),
    '## Limits',
    '',
    'The default limit is 20.',
    '',
  ].join('\n');

  it('shows sections, and splices the updated section back into the whole file', async () => {
    gh.files![SANDBOX]!['docs/reference.md'] = LONG_DOC;
    const ai = new FakeAI([
      reply({
        summary: 'The task field was renamed.',
        recommendations: [
          {
            documentationPath: 'docs/reference.md',
            reason: 'The Tasks section still shows `done`.',
            evidence: [{ filePath: 'src/store.js', detail: 'done → completed' }],
            scope: 'section',
            sectionHeading: '## Tasks',
            suggestedUpdate: '## Tasks\n\nEach task: `{ "id": 1, "completed": false }`.\n',
            modelConfidence: 0.8,
            uncertainty: '',
          },
        ],
      }),
    ]);
    const ctx = await setup(ai);
    const run = await runAndWait(ctx);

    expect(run.status).toBe('SUCCEEDED');
    expect(run.warnings).toEqual([]);
    // The model saw only the matching sections, not the whole 20 kB file…
    const sent = run.inputManifest!.docsSent.find((d) => d.path === 'docs/reference.md')!;
    expect(sent.truncated).toBe(true);
    expect(ai.requests[0]!.user.length).toBeLessThan(LONG_DOC.length);
    expect(ai.requests[0]!.user).toContain('sections, chosen because they match');

    // …and the stored suggestion is still the complete document.
    const suggestion = run.suggestions.find((s) => s.documentationPath === 'docs/reference.md')!;
    expect(suggestion.currentContent).toContain('"completed": false');
    expect(suggestion.currentContent).toContain('Explains setting number 199 in detail.');
    expect(suggestion.currentContent).toContain('The default limit is 20.');
    expect(suggestion.currentContent.split('\n')).toHaveLength(LONG_DOC.split('\n').length);
  });

  it('refuses a section it never showed, instead of writing it somewhere', async () => {
    gh.files![SANDBOX]!['docs/reference.md'] = LONG_DOC;
    const ai = new FakeAI([
      reply({
        summary: 's',
        recommendations: [
          {
            documentationPath: 'docs/reference.md',
            reason: 'r',
            evidence: [{ filePath: 'src/store.js', detail: 'd' }],
            scope: 'section',
            sectionHeading: '## A section that was never shown',
            suggestedUpdate: '## A section that was never shown\n\nText.\n',
            modelConfidence: 0.9,
            uncertainty: '',
          },
        ],
      }),
    ]);
    const ctx = await setup(ai);
    const run = await runAndWait(ctx);

    expect(run.status).toBe('SUCCEEDED');
    expect(run.suggestions).toHaveLength(0);
    expect(run.warnings[0]).toContain('was not one of the sections shown');
  });
});

describe('document cache', () => {
  it('downloads each document once and reuses it for later analyses', async () => {
    const ctx = await setup(new FakeAI([reply(goodOutput), reply(goodOutput)]));
    blobRequests.length = 0;

    const first = await runAndWait(ctx);
    expect(first.status).toBe('SUCCEEDED');
    const downloaded = blobRequests.length;
    expect(downloaded).toBeGreaterThan(0);

    // A second analysis of the same commit reads the same documents…
    blobRequests.length = 0;
    await db.analysisRun.deleteMany({});
    const second = await runAndWait(ctx);
    expect(second.status).toBe('SUCCEEDED');
    // …without downloading any of them again.
    expect(blobRequests).toEqual([]);
    expect(second.inputManifest!.docsSent).toEqual(first.inputManifest!.docsSent);

    const cached = await db.documentBlob.count();
    expect(cached).toBe(downloaded);
  });
});

describe('analysis API rules', () => {
  it('is idempotent while a run for the same commit is in progress', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ai = new FakeAI([reply(goodOutput)]);
    const original = ai.generateJson.bind(ai);
    ai.generateJson = async (req) => {
      await gate;
      return original(req);
    };
    const ctx = await setup(ai);
    const first = await ctx.agent.post(`/api/pull-requests/${ctx.prId}/analyses`).expect(202);
    const second = await ctx.agent.post(`/api/pull-requests/${ctx.prId}/analyses`).expect(200);
    expect(second.body.analysis.id).toBe(first.body.analysis.id);
    release();
    await ctx.app.services.analysis.whenIdle();
    expect(await db.analysisRun.count()).toBe(1);
  });

  it('answers 503 when no AI provider is configured', async () => {
    const ctx = await setup(null);
    const res = await ctx.agent.post(`/api/pull-requests/${ctx.prId}/analyses`);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
    expect((await ctx.agent.get('/api/ai/status')).body).toEqual({
      configured: false,
      provider: null,
      model: null,
    });
  });

  it('limits how many analyses a user can start per hour', async () => {
    const ctx = await setup(new FakeAI([reply(goodOutput)]), { maxAnalysesPerHour: 1 });
    await ctx.agent.post(`/api/pull-requests/${ctx.prId}/analyses`).expect(202);
    await ctx.app.services.analysis.whenIdle();
    const res = await ctx.agent.post(`/api/pull-requests/${ctx.prId}/analyses`);
    expect(res.status).toBe(429);
  });

  it('keeps analyses private to their owner and lists history', async () => {
    const ctx = await setup(new FakeAI([reply(goodOutput)]));
    const run = await runAndWait(ctx);
    const history = await ctx.agent.get(`/api/pull-requests/${ctx.prId}/analyses`).expect(200);
    expect(history.body.analyses).toEqual([
      expect.objectContaining({ id: run.id, suggestionCount: 1 }),
    ]);

    const other = request.agent(ctx.app);
    await other
      .post('/api/auth/register')
      .send({ ...creds, email: 'other@example.com' })
      .expect(201);
    await other.get(`/api/analyses/${run.id}`).expect(404);
    await other.post(`/api/pull-requests/${ctx.prId}/analyses`).expect(404);
    await other.get(`/api/pull-requests/${ctx.prId}/analyses`).expect(404);
  });

  it('marks runs interrupted by a restart as failed', async () => {
    const ctx = await setup(new FakeAI([reply(goodOutput)]));
    const pr = await db.pullRequest.findFirstOrThrow();
    await db.analysisRun.create({
      data: {
        pullRequestId: pr.id,
        trigger: 'MANUAL',
        status: 'RUNNING',
        headSha: 'x',
        promptVersion: PROMPT_VERSION,
        schemaVersion: '1',
        provider: 'fake',
        model: 'm',
      },
    });
    expect(await ctx.app.services.analysis.failInterruptedRuns()).toBe(1);
    expect(await db.analysisRun.findFirstOrThrow()).toMatchObject({
      status: 'FAILED',
      errorCode: 'INTERRUPTED',
    });
  });
});
