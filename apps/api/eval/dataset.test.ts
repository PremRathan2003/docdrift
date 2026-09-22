import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedFilesOf, githubPatch, loadCases, problemsWith } from './dataset.js';

const CASES = join(import.meta.dirname, '../../../eval/cases');

describe('githubPatch', () => {
  it('produces hunks without file headers, like GitHub', () => {
    const patch = githubPatch('a.js', 'one\ntwo\nthree\n', 'one\n2\nthree\n');
    expect(patch).toBe('@@ -1,3 +1,3 @@\n one\n-two\n+2\n three');
  });

  it('handles added files', () => {
    expect(githubPatch('new.js', '', 'hello\n')).toBe('@@ -0,0 +1,1 @@\n+hello');
  });
});

describe('changedFilesOf', () => {
  it('derives status and line counts', () => {
    const head = new Map([
      ['a.js', 'x\n'],
      ['b.js', 'new\n'],
    ]);
    const base = new Map([
      ['a.js', 'y\n'],
      ['gone.js', 'bye\n'],
    ]);
    const files = changedFilesOf(head, base, ['b.js']);
    expect(files.map((f) => [f.filename, f.status, f.additions, f.deletions])).toEqual([
      ['a.js', 'modified', 1, 1],
      ['b.js', 'added', 1, 0],
      ['gone.js', 'removed', 0, 1],
    ]);
  });
});

describe('the committed dataset', async () => {
  const cases = await loadCases(CASES);

  it('has cases in every group', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(cases.map((c) => c.group))).toEqual(new Set(['drift', 'no-drift', 'tricky']));
  });

  it.each(cases.map((c) => [c.id, c] as const))('%s is well-formed', (_id, c) => {
    expect(problemsWith(c)).toEqual([]);
  });

  it('uses unique ids that match folder names', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });
});

describe('context selection on the dataset', async () => {
  const { keywordBaseline } = await import('./detectors.js');
  const cases = await loadCases(CASES);
  const detector = keywordBaseline({ timeoutMs: 0, maxInputTokens: 30_000 });

  // If an expected document never reaches the model, no model could get the case
  // right and the case would be measuring document selection instead.
  it.each(cases.filter((c) => c.expected.length).map((c) => [c.id, c] as const))(
    '%s sends every expected document to the model',
    async (_id, c) => {
      const d = await detector.detect(c);
      for (const e of c.expected) expect(d.docsSent).toContain(e.path);
    },
  );
});
