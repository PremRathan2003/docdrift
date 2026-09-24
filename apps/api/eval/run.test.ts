import { describe, expect, it } from 'vitest';
import type { EvalCase } from './dataset.js';
import type { Detection, Detector } from './detectors.js';
import { toMarkdown } from './report.js';
import { EvalStopped, runEval, type Checkpoint, type SavedAnswer } from './run.js';

function evalCase(id: string, expected: string[]): EvalCase {
  return {
    id,
    title: id,
    body: '',
    group: expected.length ? 'drift' : 'no-drift',
    category: 'c',
    expected: expected.map((path) => ({ path, mustContain: [], mustNotContain: [], anchors: [] })),
    acceptable: [],
    added: [],
    trimmedFiles: [],
    notes: 'n',
    source: 'synthetic',
    head: new Map(expected.map((p) => [p, 'doc\n'])),
    base: new Map(),
    changedFiles: [],
    tree: null,
  };
}

/** Flags README.md on odd calls only, so repeated runs disagree. */
function flakyDetector(): Detector {
  let calls = 0;
  return {
    name: 'flaky',
    retrieval: 'content',
    model: 'fake/m',
    promptVersion: 'v2',
    writesContent: true,
    async detect(): Promise<Detection> {
      calls++;
      return {
        recommendations:
          calls % 2
            ? [
                {
                  documentationPath: 'README.md',
                  reason: 'r',
                  suggestedUpdate: 'doc\n',
                  modelConfidence: 0.7,
                },
              ]
            : [],
        warnings: [],
        skipped: false,
        summary: '',
        attempts: 1,
        inputTokens: 1,
        outputTokens: 1,
        docsSent: ['README.md'],
        docsTruncated: [],
      };
    },
  };
}

describe('runEval', () => {
  it('repeats cases, reports per run and finds unstable cases', async () => {
    const waits: number[] = [];
    const report = await runEval({
      cases: [evalCase('001-a', ['README.md'])],
      detector: flakyDetector(),
      repeat: 2,
      delayMs: 500,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(report.outcomes.map((o) => [o.run, o.correct])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(report.perRun.map((r) => r.recall)).toEqual([1, 0]);
    expect(report.unstableCases).toEqual(['001-a']);
    expect(waits).toEqual([500]); // no pause after the last call
    expect(report.dataset).toMatchObject({ cases: 1, expectedDocs: 1, synthetic: 1 });
  });

  it('re-runs a case after a temporary provider error and scores the final answer', async () => {
    let calls = 0;
    const detector: Detector = {
      ...flakyDetector(),
      async detect() {
        calls++;
        const base: Detection = {
          recommendations: [],
          warnings: [],
          skipped: false,
          summary: '',
          attempts: 3,
          inputTokens: null,
          outputTokens: null,
          docsSent: [],
          docsTruncated: [],
        };
        if (calls === 1) return { ...base, error: { code: 'AI_UNAVAILABLE', message: 'busy' } };
        return {
          ...base,
          attempts: 1,
          recommendations: [
            {
              documentationPath: 'README.md',
              reason: 'r',
              suggestedUpdate: 'doc\n',
              modelConfidence: 1,
            },
          ],
        };
      },
    };
    const waits: number[] = [];
    const report = await runEval({
      cases: [evalCase('001-a', ['README.md'])],
      detector,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(waits).toEqual([30_000]);
    expect(report.retries).toEqual([{ caseId: '001-a', run: 1, code: 'AI_UNAVAILABLE' }]);
    expect(report.outcomes[0]!.correct).toBe(true);
    expect(toMarkdown(report)).toContain('Re-run after a temporary provider error: 001-a');
  });

  it('does not retry permanent errors such as a bad API key', async () => {
    let calls = 0;
    const detector: Detector = {
      ...flakyDetector(),
      async detect() {
        calls++;
        return {
          recommendations: [],
          warnings: [],
          skipped: false,
          summary: '',
          attempts: 1,
          inputTokens: null,
          outputTokens: null,
          docsSent: [],
          docsTruncated: [],
          error: { code: 'AI_AUTH', message: 'bad key' },
        };
      },
    };
    const waits: number[] = [];
    await expect(
      runEval({
        cases: [evalCase('001-a', ['README.md'])],
        detector,
        sleep: async (ms) => void waits.push(ms),
      }),
    ).rejects.toBeInstanceOf(EvalStopped);
    expect(calls).toBe(1);
    expect(waits).toEqual([]);
  });

  it('stops after repeated errors instead of spending calls on a dead provider', async () => {
    let calls = 0;
    const detector: Detector = {
      ...flakyDetector(),
      async detect() {
        calls++;
        return {
          recommendations: [],
          warnings: [],
          skipped: false,
          summary: '',
          attempts: 3,
          inputTokens: null,
          outputTokens: null,
          docsSent: [],
          docsTruncated: [],
          error: { code: 'AI_RATE_LIMITED', message: 'quota' },
        };
      },
    };
    const cases = ['001-a', '002-b', '003-c', '004-d', '005-e'].map((id) => evalCase(id, []));
    const run = runEval({ cases, detector, transientRetryWaitsMs: [], sleep: async () => {} });
    await expect(run).rejects.toBeInstanceOf(EvalStopped);
    await expect(run).rejects.toMatchObject({ completed: 3, total: 5 });
    expect(calls).toBe(3);
  });

  it('stops at the first configuration error (bad key or model)', async () => {
    let calls = 0;
    const detector: Detector = {
      ...flakyDetector(),
      async detect() {
        calls++;
        return {
          recommendations: [],
          warnings: [],
          skipped: false,
          summary: '',
          attempts: 1,
          inputTokens: null,
          outputTokens: null,
          docsSent: [],
          docsTruncated: [],
          error: { code: 'AI_BAD_REQUEST', message: 'unexpected model name format' },
        };
      },
    };
    const cases = ['001-a', '002-b'].map((id) => evalCase(id, []));
    await expect(runEval({ cases, detector, sleep: async () => {} })).rejects.toMatchObject({
      completed: 1,
    });
    expect(calls).toBe(1);
  });

  it('renders a Markdown report with the headline numbers', async () => {
    const report = await runEval({
      cases: [evalCase('001-a', ['README.md']), evalCase('002-b', [])],
      detector: flakyDetector(),
    });
    const md = toMarkdown(report);
    expect(md).toContain('# Evaluation: flaky (fake/m)');
    expect(md).toContain('All cases are synthetic');
    expect(md).toContain('| Precision (flagged docs that were right) | 100%');
    expect(md).toContain('| 001-a | 1 | right |');
  });
});

describe('resuming an interrupted run', () => {
  it('reuses saved answers, asks only the rest, and says so in the report', async () => {
    const store = new Map<string, SavedAnswer>();
    const checkpoint: Checkpoint = {
      get: async (k) => store.get(k) ?? null,
      save: async (k, v) => void store.set(k, v),
    };
    const cases = ['001-a', '002-b', '003-c'].map((id) => evalCase(id, ['README.md']));
    const asked: string[] = [];
    let quotaLeft = 1;
    const detector: Detector = {
      ...flakyDetector(),
      async detect(c) {
        asked.push(c.id);
        const base: Detection = {
          recommendations: [
            {
              documentationPath: 'README.md',
              reason: 'r',
              suggestedUpdate: 'doc\n',
              modelConfidence: 1,
            },
          ],
          warnings: [],
          skipped: false,
          summary: '',
          attempts: 1,
          inputTokens: 1,
          outputTokens: 1,
          docsSent: [],
          docsTruncated: [],
        };
        if (quotaLeft-- > 0) return base;
        return { ...base, recommendations: [], error: { code: 'AI_AUTH', message: 'quota' } };
      },
    };

    // First run: one answer, then a stopping error.
    await expect(
      runEval({ cases, detector, checkpoint, sleep: async () => {} }),
    ).rejects.toBeInstanceOf(EvalStopped);
    expect(store.size).toBe(1); // the error was not saved

    // Later, with quota again: case 001 is reused, the others are asked.
    quotaLeft = 10;
    asked.length = 0;
    const report = await runEval({ cases, detector, checkpoint, sleep: async () => {} });
    expect(asked).toEqual(['002-b', '003-c']);
    expect(report.reused.map((r) => r.caseId)).toEqual(['001-a']);
    expect(report.overall.caseAccuracy).toBe(1);
    expect(toMarkdown(report)).toContain('Resumed run: 1 of 3 answers');
  });
});
