import { describe, expect, it } from 'vitest';
import { branchName, planDocsPullRequest, type PlanInput } from './docs-pr.js';

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  run: { id: 'clz0000000run12345678', status: 'SUCCEEDED', headSha: 'abc1234def', ...over.run },
  pullRequest: {
    number: 42,
    headSha: 'abc1234def',
    headRef: 'feature/rename',
    title: 'Rename done to completed',
    ...over.pullRequest,
  },
  suggestions: over.suggestions ?? [
    { id: 's1', documentationPath: 'README.md', currentContent: '# App\n', status: 'APPROVED' },
    {
      id: 's2',
      documentationPath: 'docs/api.md',
      currentContent: '# API\n',
      status: 'APPROVED',
    },
  ],
  actorLogin: over.actorLogin ?? 'prem',
});

describe('planDocsPullRequest', () => {
  it('includes only approved suggestions and targets the pull request branch', () => {
    const result = planDocsPullRequest(
      input({
        suggestions: [
          { id: 's1', documentationPath: 'README.md', currentContent: 'new', status: 'APPROVED' },
          { id: 's2', documentationPath: 'docs/a.md', currentContent: 'no', status: 'PENDING' },
          { id: 's3', documentationPath: 'docs/b.md', currentContent: 'no', status: 'REJECTED' },
          { id: 's4', documentationPath: 'docs/c.md', currentContent: 'no', status: 'EDITED' },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.files).toEqual([{ path: 'README.md', content: 'new' }]);
    expect(result.plan.suggestionIds).toEqual(['s1']);
    // Merging into the PR's own branch keeps docs with the code.
    expect(result.plan.base).toBe('feature/rename');
    expect(result.plan.branch).toBe('docdrift/pr-42-12345678');
  });

  it('keeps documents already applied, so a second attempt does not drop them', () => {
    // Each attempt commits on the pull request's head, not on the previous
    // documentation commit — so a plan that omitted the applied document would
    // push a commit that silently removes it from the branch.
    const result = planDocsPullRequest(
      input({
        suggestions: [
          { id: 's1', documentationPath: 'README.md', currentContent: 'first', status: 'APPLIED' },
          { id: 's2', documentationPath: 'docs/a.md', currentContent: 'second', status: 'APPROVED' },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.files).toEqual([
      { path: 'README.md', content: 'first' },
      { path: 'docs/a.md', content: 'second' },
    ]);
  });

  it('refuses a run whose approved suggestions were all rejected afterwards', () => {
    const result = planDocsPullRequest(
      input({
        suggestions: [
          { id: 's1', documentationPath: 'README.md', currentContent: 'x', status: 'REJECTED' },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: false, code: 'NOTHING_APPROVED' });
  });

  it('names a branch of its own, stable for one run and different for the next', () => {
    expect(branchName(42, 'clz0000000run12345678')).toBe('docdrift/pr-42-12345678');
    expect(branchName(42, 'clz0000000run12345678')).toBe(branchName(42, 'clz0000000run12345678'));
    expect(branchName(42, 'clz0000000run87654321')).not.toBe(branchName(42, 'clz0000000run12345678'));
    expect(branchName(42, 'x'.repeat(25)).startsWith('docdrift/')).toBe(true);
  });

  it('refuses when nothing was approved', () => {
    const result = planDocsPullRequest(
      input({
        suggestions: [
          { id: 's1', documentationPath: 'README.md', currentContent: 'x', status: 'PENDING' },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: false, code: 'NOTHING_APPROVED' });
  });

  it('refuses an analysis of a commit the branch has moved past', () => {
    // The suggestions describe code that may no longer exist.
    const result = planDocsPullRequest(
      input({ pullRequest: { ...input().pullRequest, headSha: 'newsha999' } }),
    );
    expect(result).toMatchObject({ ok: false, code: 'STALE_ANALYSIS' });
    if (result.ok) return;
    expect(result.message).toContain('abc1234');
    expect(result.message).toContain('newsha9');
  });

  it('refuses two approved rewrites of the same document instead of losing one', () => {
    const result = planDocsPullRequest(
      input({
        suggestions: [
          { id: 's1', documentationPath: 'README.md', currentContent: 'first', status: 'APPROVED' },
          { id: 's2', documentationPath: 'README.md', currentContent: 'second', status: 'APPROVED' },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: false, code: 'CONFLICTING_SUGGESTIONS' });
    if (result.ok) return;
    expect(result.message).toContain('README.md');
  });

  it('refuses a run that did not succeed', () => {
    for (const status of ['QUEUED', 'RUNNING', 'FAILED']) {
      expect(planDocsPullRequest(input({ run: { ...input().run, status } }))).toMatchObject({
        ok: false,
        code: 'ANALYSIS_NOT_SUCCEEDED',
      });
    }
  });

  it('says in the pull request who approved the changes and what generated it', () => {
    const result = planDocsPullRequest(input());
    if (!result.ok) throw new Error('expected a plan');
    expect(result.plan.body).toContain('approved by @prem');
    expect(result.plan.body).toContain('clz0000000run12345678');
    expect(result.plan.body).toContain('#42 — Rename done to completed');
    expect(result.plan.commitMessage).toContain('2 document(s) updated');
    expect(result.plan.title).toBe('docs: update documentation for #42');
  });
});
