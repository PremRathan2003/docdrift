/**
 * Turns detections into numbers. Pure functions, unit-tested in score.test.ts.
 *
 * Definitions (per document, summed over all cases = "micro-averaged"):
 *   TP  flagged and expected          FP  flagged, not expected, not acceptable
 *   FN  expected, not flagged         (acceptable documents never count)
 *   precision = TP / (TP + FP)   "when it flags a doc, how often is it right?"
 *   recall    = TP / (TP + FN)   "of the docs that needed updating, how many did it find?"
 * A run that errors flags nothing, so its expected documents count as misses:
 * a user would have got no help either.
 */
import type { Detection } from './detectors.js';
import type { EvalCase } from './dataset.js';

export interface ContentCheck {
  path: string;
  passed: boolean;
  /** mustContain strings that were missing. */
  missing: string[];
  /** mustNotContain strings still present. */
  stale: string[];
  /** Non-empty lines of the original document that the suggestion no longer has. */
  droppedLines: number;
}

export interface CaseOutcome {
  caseId: string;
  group: EvalCase['group'];
  source: EvalCase['source'];
  category: string;
  run: number;
  tp: string[];
  fp: string[];
  fn: string[];
  acceptableFlagged: string[];
  correct: boolean;
  /** Expected documents that document selection actually sent to the model. */
  retrieved: string[];
  /** Of those, the ones sent only in part: DocDrift refuses to rewrite a document it can't see whole. */
  retrievedTruncated: string[];
  content: ContentCheck[];
  latencyMs: number;
  detection: Detection;
}

export function droppedLines(original: string, suggestion: string): number {
  const kept = new Set(suggestion.split('\n').map((l) => l.trimEnd()));
  return original
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '' && !kept.has(l)).length;
}

export function scoreCase(
  c: EvalCase,
  detection: Detection,
  opts: { run: number; latencyMs: number; checkContent: boolean },
): CaseOutcome {
  const flagged = [...new Set(detection.recommendations.map((r) => r.documentationPath))];
  const expected = new Set(c.expected.map((e) => e.path));
  const acceptable = new Set(c.acceptable);

  const tp = flagged.filter((p) => expected.has(p));
  const fp = flagged.filter((p) => !expected.has(p) && !acceptable.has(p));
  const fn = [...expected].filter((p) => !flagged.includes(p));
  const acceptableFlagged = flagged.filter((p) => acceptable.has(p));

  const retrieved = [...expected].filter((p) => detection.docsSent.includes(p));
  const retrievedTruncated = retrieved.filter((p) => detection.docsTruncated.includes(p));
  const content: ContentCheck[] = [];
  if (opts.checkContent) {
    for (const e of c.expected.filter((x) => tp.includes(x.path))) {
      const text = detection.recommendations.find(
        (r) => r.documentationPath === e.path,
      )!.suggestedUpdate;
      const missing = e.mustContain.filter((s) => !text.includes(s));
      const stale = e.mustNotContain.filter((s) => text.includes(s));
      content.push({
        path: e.path,
        passed: missing.length === 0 && stale.length === 0,
        missing,
        stale,
        droppedLines: droppedLines(c.head.get(e.path) ?? '', text),
      });
    }
  }

  return {
    caseId: c.id,
    group: c.group,
    source: c.source,
    category: c.category,
    run: opts.run,
    tp,
    fp,
    fn,
    acceptableFlagged,
    correct: fp.length === 0 && fn.length === 0,
    retrieved,
    retrievedTruncated,
    content,
    latencyMs: opts.latencyMs,
    detection,
  };
}

/** 95% Wilson score interval: honest error bars for a proportion from a small sample. */
export function wilson(successes: number, total: number): [number, number] | null {
  if (total === 0) return null;
  const z = 1.96;
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function aggregate(outcomes: CaseOutcome[], expectedCounts: Map<string, number>) {
  const sum = (f: (o: CaseOutcome) => number) => outcomes.reduce((s, o) => s + f(o), 0);
  const tp = sum((o) => o.tp.length);
  const fp = sum((o) => o.fp.length);
  const fn = sum((o) => o.fn.length);
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);

  const quiet = outcomes.filter((o) => (expectedCounts.get(o.caseId) ?? 0) === 0);
  const checks = outcomes.flatMap((o) => o.content);
  const recs = (paths: (o: CaseOutcome) => string[]) =>
    outcomes.flatMap((o) =>
      o.detection.recommendations.filter((r) => paths(o).includes(r.documentationPath)),
    );
  const errors = outcomes.filter((o) => o.detection.error);
  const byCode: Record<string, number> = {};
  for (const o of errors)
    byCode[o.detection.error!.code] = (byCode[o.detection.error!.code] ?? 0) + 1;
  const asked = outcomes.filter((o) => !o.detection.skipped && !o.detection.error);
  const tokensIn = outcomes.map((o) => o.detection.inputTokens).filter((t) => t !== null);
  const tokensOut = outcomes.map((o) => o.detection.outputTokens).filter((t) => t !== null);

  const expectedDocs = sum((o) => o.tp.length + o.fn.length);
  return {
    runs: outcomes.length,
    tp,
    fp,
    fn,
    precision,
    recall,
    f1,
    precisionCI: wilson(tp, tp + fp),
    recallCI: wilson(tp, tp + fn),
    /** Cases where the flagged set was exactly right. */
    caseAccuracy: ratio(outcomes.filter((o) => o.correct).length, outcomes.length),
    /**
     * Of the documents that needed updating, how many even reached the model.
     * Recall can never beat this: document selection is the ceiling.
     */
    retrieval: {
      reached: sum((o) => o.retrieved.length),
      expected: expectedDocs,
      rate: ratio(
        sum((o) => o.retrieved.length),
        expectedDocs,
      ),
      /** Of those, fetched but too long to send whole, so never recommendable. */
      truncated: sum((o) => o.retrievedTruncated.length),
    },
    /** Of the cases where nothing needed updating, how often something was flagged anyway. */
    falseAlarmRate: ratio(quiet.filter((o) => o.fp.length > 0).length, quiet.length),
    quietCases: quiet.length,
    content: {
      checked: checks.length,
      passed: checks.filter((c) => c.passed).length,
      passRate: ratio(checks.filter((c) => c.passed).length, checks.length),
      medianDroppedLines: median(checks.map((c) => c.droppedLines)),
    },
    confidence: {
      meanWhenRight: mean(recs((o) => o.tp).map((r) => r.modelConfidence)),
      meanWhenWrong: mean(recs((o) => o.fp).map((r) => r.modelConfidence)),
    },
    errors: { count: errors.length, byCode },
    validationWarnings: sum((o) => o.detection.warnings.length),
    modelCalls: asked.length,
    meanAttempts: mean(asked.map((o) => o.detection.attempts)),
    tokens: {
      input: tokensIn.length ? tokensIn.reduce((s, t) => s + t, 0) : null,
      output: tokensOut.length ? tokensOut.reduce((s, t) => s + t, 0) : null,
    },
    latencyMs: {
      median: median(asked.map((o) => o.latencyMs)),
      max: asked.length ? Math.max(...asked.map((o) => o.latencyMs)) : null,
    },
  };
}

export type Metrics = ReturnType<typeof aggregate>;
