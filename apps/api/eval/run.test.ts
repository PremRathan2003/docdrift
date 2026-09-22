import { describe, expect, it } from 'vitest';
import type { EvalCase } from './dataset.js';
import type { Detection, Detector } from './detectors.js';
import { toMarkdown } from './report.js';
import { runEval } from './run.js';

function evalCase(id: string, expected: string[]): EvalCase {
  return {
    id,
    title: id,
    body: '',
    group: expected.length ? 'drift' : 'no-drift',
    category: 'c',
    expected: expected.map((path) => ({ path, mustContain: [], mustNotContain: [] })),
    acceptable: [],
    added: [],
    notes: 'n',
    source: 'synthetic',
    head: new Map(expected.map((p) => [p, 'doc\n'])),
    base: new Map(),
    changedFiles: [],
  };
}

/** Flags README.md on odd calls only, so repeated runs disagree. */
function flakyDetector(): Detector {
  let calls = 0;
  return {
    name: 'flaky',
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
