import { describe, expect, it } from 'vitest';
import type { EvalCase } from './dataset.js';
import type { Detection } from './detectors.js';
import { aggregate, droppedLines, median, scoreCase, wilson } from './score.js';

const DOC = '# API\n\nUse the `X-Key` header.\n\nLimit: 100.\n';

function evalCase(over: Partial<EvalCase> = {}): EvalCase {
  return {
    id: '001-x',
    title: 't',
    body: '',
    group: 'drift',
    category: 'c',
    expected: [{ path: 'docs/api.md', mustContain: ['Authorization'], mustNotContain: ['X-Key'] }],
    acceptable: ['CHANGELOG.md'],
    added: [],
    trimmedFiles: [],
    notes: 'n',
    source: 'synthetic',
    head: new Map([['docs/api.md', DOC]]),
    base: new Map(),
    changedFiles: [],
    tree: null,
    ...over,
  };
}

function detection(recs: [path: string, text?: string, confidence?: number][]): Detection {
  return {
    recommendations: recs.map(
      ([documentationPath, suggestedUpdate = '', modelConfidence = 0.8]) => ({
        documentationPath,
        reason: 'r',
        suggestedUpdate,
        modelConfidence,
      }),
    ),
    warnings: [],
    skipped: false,
    summary: '',
    attempts: 1,
    inputTokens: 100,
    outputTokens: 50,
    docsSent: [],
    docsTruncated: [],
  };
}

const opts = { run: 1, latencyMs: 1000, checkContent: true };

describe('scoreCase', () => {
  it('counts a correct flag with passing content as right', () => {
    const good = DOC.replace('`X-Key`', '`Authorization`');
    const o = scoreCase(evalCase(), detection([['docs/api.md', good]]), opts);
    expect(o).toMatchObject({ tp: ['docs/api.md'], fp: [], fn: [], correct: true });
    expect(o.content).toEqual([
      { path: 'docs/api.md', passed: true, missing: [], stale: [], droppedLines: 1 },
    ]);
  });

  it('reports stale and missing wording', () => {
    const o = scoreCase(evalCase(), detection([['docs/api.md', DOC]]), opts);
    expect(o.content[0]).toMatchObject({
      passed: false,
      missing: ['Authorization'],
      stale: ['X-Key'],
    });
    expect(o.correct).toBe(true); // detection was right even though the text isn't
  });

  it('never counts acceptable documents', () => {
    const o = scoreCase(evalCase(), detection([['docs/api.md'], ['CHANGELOG.md']]), opts);
    expect(o).toMatchObject({ fp: [], acceptableFlagged: ['CHANGELOG.md'], correct: true });
  });

  it('counts misses and false positives', () => {
    const o = scoreCase(evalCase(), detection([['README.md']]), opts);
    expect(o).toMatchObject({ tp: [], fp: ['README.md'], fn: ['docs/api.md'], correct: false });
  });

  it('counts an error as missing everything', () => {
    const d = { ...detection([]), error: { code: 'AI_TIMEOUT', message: 'slow' } };
    expect(scoreCase(evalCase(), d, opts).fn).toEqual(['docs/api.md']);
  });

  it('skips content checks for detectors that write no content', () => {
    const o = scoreCase(evalCase(), detection([['docs/api.md']]), { ...opts, checkContent: false });
    expect(o.content).toEqual([]);
  });
});

describe('aggregate', () => {
  it('micro-averages precision and recall and measures false alarms', () => {
    const drift = evalCase();
    const quiet = evalCase({ id: '002-q', group: 'no-drift', expected: [] });
    const outcomes = [
      scoreCase(drift, detection([['docs/api.md', '', 0.9]]), opts),
      scoreCase(quiet, detection([['README.md', '', 0.5]]), opts),
    ];
    const m = aggregate(
      outcomes,
      new Map([
        ['001-x', 1],
        ['002-q', 0],
      ]),
    );
    expect(m).toMatchObject({ tp: 1, fp: 1, fn: 0, precision: 0.5, recall: 1, caseAccuracy: 0.5 });
    expect(m.f1).toBeCloseTo(2 / 3);
    expect(m.falseAlarmRate).toBe(1);
    expect(m.confidence).toEqual({ meanWhenRight: 0.9, meanWhenWrong: 0.5 });
    expect(m.tokens).toEqual({ input: 200, output: 100 });
  });

  it('returns n/a (null) instead of dividing by zero', () => {
    const m = aggregate([], new Map());
    expect(m.precision).toBeNull();
    expect(m.recall).toBeNull();
    expect(m.f1).toBeNull();
  });
});

describe('helpers', () => {
  it('wilson gives a sensible interval', () => {
    const [lo, hi] = wilson(8, 10)!;
    expect(lo).toBeCloseTo(0.49, 2);
    expect(hi).toBeCloseTo(0.943, 2);
    expect(wilson(0, 0)).toBeNull();
  });

  it('median and droppedLines', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(droppedLines('a\n\nb\nc\n', 'a\nB\nc\n')).toBe(1);
  });
});
