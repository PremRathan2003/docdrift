import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileCheckpoint } from './checkpoint.js';

describe('fileCheckpoint', () => {
  it('persists answers across instances and clears them', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'eval-')), 'nested', 'cp.json');
    const answer = {
      detection: {
        recommendations: [],
        warnings: [],
        skipped: false,
        summary: 's',
        attempts: 1,
        inputTokens: 1,
        outputTokens: 1,
        docsSent: [],
        docsTruncated: [],
      },
      latencyMs: 5,
      savedAt: '2026-09-22T12:00:00.000Z',
    };
    await fileCheckpoint(path).save('001#1#abc', answer);
    const again = fileCheckpoint(path);
    expect(await again.get('001#1#abc')).toEqual(answer);
    expect(await again.count()).toBe(1);
    await again.clear();
    expect(await fileCheckpoint(path).count()).toBe(0);
  });
});
