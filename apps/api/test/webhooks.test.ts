import { createHmac } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AppDeps } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Db } from '../src/lib/prisma.js';

const SECRET = 'webhook-secret-for-tests';

/**
 * Enough of the database for this route, in memory. The real tables are covered
 * by the integration suite; here the point is the signature, the deduplication
 * and the status codes, none of which need Postgres.
 */
function fakeDb(connectedRepoIds: bigint[] = [7n]) {
  const deliveries = new Map<string, { outcome: string; detail?: string | null }>();
  const upserted: { repositoryId: string; number: number; headSha: string }[] = [];
  let failNextUpsert = false;

  const db = {
    webhookDelivery: {
      findUnique: async ({ where }: { where: { id: string } }) => deliveries.get(where.id) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { id: string };
        create: { outcome: string; detail?: string | null };
        update: { outcome: string; detail?: string | null };
      }) => {
        const existing = deliveries.get(where.id);
        deliveries.set(where.id, existing ? { ...existing, ...update } : { ...create });
        return deliveries.get(where.id);
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { outcome: string };
      }) => {
        deliveries.set(where.id, { ...deliveries.get(where.id), ...data });
        return deliveries.get(where.id);
      },
    },
    repository: {
      findMany: async ({ where }: { where: { githubRepoId: bigint } }) =>
        connectedRepoIds.includes(where.githubRepoId) ? [{ id: 'repo-1' }, { id: 'repo-2' }] : [],
    },
    pullRequest: {
      upsert: (args: {
        where: { repositoryId_number: { repositoryId: string; number: number } };
        create: { headSha: string };
      }) => {
        if (failNextUpsert) throw new Error('database is down');
        upserted.push({
          repositoryId: args.where.repositoryId_number.repositoryId,
          number: args.where.repositoryId_number.number,
          headSha: args.create.headSha,
        });
        return args;
      },
    },
    $transaction: async (ops: unknown[]) => ops,
  };

  return {
    db: db as unknown as Db,
    deliveries,
    upserted,
    breakDatabase: () => {
      failNextUpsert = true;
    },
  };
}

function buildApp(db: Db, overrides: Partial<AppDeps> = {}) {
  return createApp({
    env: {
      WEB_ORIGIN: 'http://localhost:5173',
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-only-secret-that-is-at-least-32-characters',
      GITHUB_WEBHOOK_SECRET: SECRET,
    } as AppDeps['env'],
    logger: createLogger('silent'),
    version: 'test',
    db,
    checkDatabase: async () => {},
    ...overrides,
  });
}

const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    action: 'synchronize',
    repository: { id: 7, full_name: 'prem/docdrift' },
    pull_request: {
      id: 100,
      number: 12,
      title: 'Rename done to completed',
      body: null,
      state: 'open',
      draft: false,
      user: { login: 'prem' },
      head: { sha: 'newsha', ref: 'feature' },
      base: { ref: 'main' },
      additions: 3,
      deletions: 1,
      changed_files: 2,
      html_url: 'https://github.com/prem/docdrift/pull/12',
      created_at: '2026-09-26T09:00:00Z',
      updated_at: '2026-09-26T09:30:00Z',
      merged_at: null,
      ...over,
    },
  });

const post = (
  app: ReturnType<typeof buildApp>,
  body: string,
  opts: { event?: string; delivery?: string; signature?: string } = {},
) =>
  request(app)
    .post('/api/webhooks/github')
    .set('content-type', 'application/json')
    .set('x-github-event', opts.event ?? 'pull_request')
    .set('x-github-delivery', opts.delivery ?? 'delivery-1')
    .set(
      'x-hub-signature-256',
      opts.signature ??
        `sha256=${createHmac('sha256', SECRET).update(Buffer.from(body)).digest('hex')}`,
    )
    .send(body);

describe('POST /api/webhooks/github', () => {
  let ctx: ReturnType<typeof fakeDb>;
  beforeEach(() => {
    ctx = fakeDb();
  });

  it('caches the pull request for every user who connected the repository', async () => {
    const body = payload();
    const res = await post(buildApp(ctx.db), body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'handled', repositories: 2 });
    expect(ctx.upserted).toEqual([
      { repositoryId: 'repo-1', number: 12, headSha: 'newsha' },
      { repositoryId: 'repo-2', number: 12, headSha: 'newsha' },
    ]);
    expect(ctx.deliveries.get('delivery-1')).toMatchObject({ outcome: 'handled' });
  });

  it('rejects a wrong signature and does no work', async () => {
    const res = await post(buildApp(ctx.db), payload(), { signature: 'sha256=' + '0'.repeat(64) });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('INVALID_SIGNATURE');
    expect(ctx.upserted).toEqual([]);
    expect(ctx.deliveries.size).toBe(0);
  });

  it('rejects a body that was altered after signing', async () => {
    const body = payload();
    const signature = `sha256=${createHmac('sha256', SECRET).update(Buffer.from(body)).digest('hex')}`;
    const res = await post(buildApp(ctx.db), body.replace('newsha', 'tampered'), { signature });
    expect(res.status).toBe(401);
  });

  it('does the work once when GitHub redelivers', async () => {
    const app = buildApp(ctx.db);
    const body = payload();
    await post(app, body);
    const again = await post(app, body);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ status: 'duplicate' });
    expect(ctx.upserted).toHaveLength(2); // not four
  });

  it('lets a delivery that failed halfway be retried', async () => {
    const app = buildApp(ctx.db);
    ctx.breakDatabase();
    const failed = await post(app, payload());
    expect(failed.status).toBe(500);
    expect(ctx.deliveries.get('delivery-1')).toMatchObject({ outcome: 'failed' });
    // A redelivery of unfinished work is not a duplicate.
    ctx = { ...ctx, ...fakeDb() };
    const retried = await post(buildApp(ctx.db), payload());
    expect(retried.body).toEqual({ status: 'handled', repositories: 2 });
  });

  it('accepts and records what it cannot use, so GitHub keeps the hook enabled', async () => {
    const app = buildApp(ctx.db);
    for (const [i, c] of [
      { event: 'ping', body: '{"zen":"Keep it logically awesome."}', reason: 'ping' },
      { event: 'push', body: '{"ref":"refs/heads/main"}', reason: 'event push' },
      { event: 'pull_request', body: payload(), reason: 'action labeled', action: 'labeled' },
      { event: 'pull_request', body: '{"action":"opened"}', reason: 'payload did not match' },
      { event: 'pull_request', body: 'not json at all', reason: 'body was not JSON' },
    ].entries()) {
      const body = c.action ? c.body.replace('"synchronize"', `"${c.action}"`) : c.body;
      const res = await post(app, body, { event: c.event, delivery: `ignored-${i}` });
      expect(res.status, `${c.event} ${c.reason}`).toBe(200);
      expect(res.body.status).toBe('ignored');
      expect(res.body.reason).toContain(c.reason.split(' did not')[0]!);
    }
    expect(ctx.upserted).toEqual([]);
  });

  it('says so when the repository is not connected by anyone', async () => {
    const other = fakeDb([]);
    const res = await post(buildApp(other.db), payload());
    expect(res.body).toEqual({ status: 'ignored', repositories: 0 });
    expect(other.deliveries.get('delivery-1')).toMatchObject({
      outcome: 'ignored',
      detail: 'repository is not connected by any user',
    });
  });

  it('needs a delivery id, and needs a secret to be configured', async () => {
    const noId = await request(buildApp(ctx.db))
      .post('/api/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set(
        'x-hub-signature-256',
        `sha256=${createHmac('sha256', SECRET).update(Buffer.from(payload())).digest('hex')}`,
      )
      .send(payload());
    expect(noId.status).toBe(400);

    const unconfigured = createApp({
      env: {
        WEB_ORIGIN: 'http://localhost:5173',
        NODE_ENV: 'test',
        SESSION_SECRET: 'test-only-secret-that-is-at-least-32-characters',
      } as AppDeps['env'],
      logger: createLogger('silent'),
      version: 'test',
      db: ctx.db,
      checkDatabase: async () => {},
    });
    const res = await post(unconfigured, payload());
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe('GITHUB_WEBHOOK_NOT_CONFIGURED');
  });
});
