import { describe, expect, it } from 'vitest';
import { createLogger } from '../../lib/logger.js';
import type { Db } from '../../lib/prisma.js';
import type { GitHubService } from '../github/github.service.js';
import { createDocsPullRequestService } from './docs-pr.service.js';

/** Records what the service did, so the order and the idempotency are visible. */
function fakes(opts: { existingPr?: { number: number; htmlUrl: string } } = {}) {
  const calls: string[] = [];
  let applied: string[] = [];
  let saved: Record<string, unknown> | null = null;

  const run = {
    id: 'clz0000000run12345678',
    status: 'SUCCEEDED',
    headSha: 'abc1234',
    suggestions: [
      { id: 's1', documentationPath: 'README.md', currentContent: '# new\n', status: 'APPROVED' },
      { id: 's2', documentationPath: 'docs/a.md', currentContent: 'no\n', status: 'PENDING' },
    ],
    pullRequest: {
      number: 42,
      headSha: 'abc1234',
      headRef: 'feature',
      title: 'Rename',
      repository: {
        owner: 'prem',
        name: 'demo',
        installation: { installationId: 1n },
      },
    },
  };

  const db = {
    analysisRun: { findFirst: async () => run },
    user: { findUniqueOrThrow: async () => ({ email: 'prem@example.com' }) },
    docsPullRequest: {
      findUnique: async () => null,
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        calls.push('save');
        saved = create;
        // Prisma answers with the stored row, and the service replies from it —
        // so the mock has to include what the database adds.
        return { ...create, createdAt: new Date('2026-09-29T10:00:00.000Z') };
      },
    },
    suggestion: {
      updateMany: ({ where }: { where: { id: { in: string[] } } }) => {
        calls.push('mark applied');
        applied = where.id.in;
        return where;
      },
    },
    // $transaction resolves its operations; returning them unresolved would
    // hand the service promises where it expects rows.
    $transaction: async (ops: unknown[]) => Promise.all(ops),
  } as unknown as Db;

  const github = {
    async commitDocuments(_repo: unknown, o: { files: { path: string }[] }) {
      calls.push(`commit ${o.files.map((f) => f.path).join(',')}`);
      return 'commitsha';
    },
    async setBranch(_repo: unknown, branch: string) {
      calls.push(`branch ${branch}`);
      return 'created' as const;
    },
    async findDocsPullRequest() {
      calls.push('look for an existing pull request');
      return opts.existingPr ?? null;
    },
    async openDocsPullRequest() {
      calls.push('open pull request');
      return { number: 7, htmlUrl: 'https://github.com/prem/demo/pull/7' };
    },
  } as unknown as GitHubService;

  return {
    service: createDocsPullRequestService({ db, github, logger: createLogger('silent') }),
    calls,
    applied: () => applied,
    saved: () => saved,
  };
}

describe('createDocsPullRequestService', () => {
  it('commits only approved documents, then opens the pull request, then marks them applied', async () => {
    const f = fakes();
    const result = await f.service.create({ runId: 'r', userId: 'u' });

    expect(result).toMatchObject({
      number: 7,
      branch: 'docdrift/pr-42',
      base: 'feature',
      documents: ['README.md'],
      created: true,
    });
    // Order matters: nothing is marked applied until a pull request exists.
    expect(f.calls).toEqual([
      'commit README.md',
      'branch docdrift/pr-42',
      'look for an existing pull request',
      'open pull request',
      'mark applied',
      'save',
    ]);
    expect(f.applied()).toEqual(['s1']);
    expect(f.saved()).toMatchObject({ commitSha: 'commitsha', documents: ['README.md'] });
  });

  it('reuses the pull request that is already open for that branch', async () => {
    const f = fakes({ existingPr: { number: 3, htmlUrl: 'https://github.com/prem/demo/pull/3' } });
    const result = await f.service.create({ runId: 'r', userId: 'u' });

    expect(result).toMatchObject({ number: 3, created: false });
    expect(f.calls).not.toContain('open pull request');
    // The branch is still moved: the approved content may have been edited.
    expect(f.calls).toContain('branch docdrift/pr-42');
  });
});
