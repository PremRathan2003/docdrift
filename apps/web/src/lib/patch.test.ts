import { parsePatch } from '@docdrift/shared';
import { describe, expect, it } from 'vitest';
import { buildPatch, patchStats } from './patch';

describe('buildPatch', () => {
  const original = '# Task API\n\nEach task has `done`.\n\n## Other\nUnchanged\n';
  const updated = '# Task API\n\nEach task has `completed`.\n\n## Other\nUnchanged\n';

  it('produces a git-style unified diff that our viewer can parse', () => {
    const patch = buildPatch('README.md', original, updated);
    expect(patch.startsWith('--- a/README.md\n+++ b/README.md\n')).toBe(true);
    expect(patchStats(patch)).toEqual({ additions: 1, deletions: 1 });
    const lines = parsePatch(patch)[0]!.lines;
    expect(lines.find((l) => l.type === 'del')?.content).toBe('Each task has `done`.');
    expect(lines.find((l) => l.type === 'add')?.content).toBe('Each task has `completed`.');
  });

  it('ignores a missing final newline', () => {
    expect(patchStats(buildPatch('README.md', original, original.trimEnd()))).toEqual({
      additions: 0,
      deletions: 0,
    });
  });

  it('treats a missing document as a new file', () => {
    const patch = buildPatch('docs/new.md', null, '# New\n');
    expect(patch).toContain('--- /dev/null');
    expect(patchStats(patch)).toEqual({ additions: 1, deletions: 0 });
  });
});
