import { datasetHash, type EvalCase } from './dataset.js';
import type { Detector } from './detectors.js';
import { aggregate, scoreCase, type CaseOutcome, type Metrics } from './score.js';

export interface EvalOptions {
  cases: EvalCase[];
  detector: Detector;
  /** Run every case this many times: models are not deterministic. */
  repeat?: number;
  /** Pause between model calls, to stay inside free-tier rate limits. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  onCase?: (outcome: CaseOutcome, index: number, total: number) => void;
}

export async function runEval(opts: EvalOptions) {
  const repeat = opts.repeat ?? 1;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const clock = opts.clock ?? Date.now;
  const outcomes: CaseOutcome[] = [];
  const total = opts.cases.length * repeat;

  for (let run = 1; run <= repeat; run++) {
    for (const c of opts.cases) {
      const started = clock();
      const detection = await opts.detector.detect(c);
      const outcome = scoreCase(c, detection, {
        run,
        latencyMs: clock() - started,
        checkContent: opts.detector.writesContent,
      });
      outcomes.push(outcome);
      opts.onCase?.(outcome, outcomes.length, total);
      const calledModel = !detection.skipped && detection.attempts > 0;
      if (calledModel && opts.delayMs && outcomes.length < total) await sleep(opts.delayMs);
    }
  }

  const expectedCounts = new Map(opts.cases.map((c) => [c.id, c.expected.length]));
  const groups = [...new Set(opts.cases.map((c) => c.group))];
  const byGroup: Record<string, Metrics> = {};
  for (const g of groups)
    byGroup[g] = aggregate(
      outcomes.filter((o) => o.group === g),
      expectedCounts,
    );
  const perRun = Array.from({ length: repeat }, (_, i) => {
    const m = aggregate(
      outcomes.filter((o) => o.run === i + 1),
      expectedCounts,
    );
    return { run: i + 1, precision: m.precision, recall: m.recall, f1: m.f1 };
  });
  // Cases whose verdict changed between runs: the model's answer isn't stable there.
  const unstableCases = opts.cases
    .map((c) => c.id)
    .filter(
      (id) => new Set(outcomes.filter((o) => o.caseId === id).map((o) => o.correct)).size > 1,
    );

  return {
    generatedAt: new Date().toISOString(),
    detector: {
      name: opts.detector.name,
      model: opts.detector.model,
      promptVersion: opts.detector.promptVersion,
    },
    dataset: {
      hash: await datasetHash(opts.cases),
      cases: opts.cases.length,
      byGroup: Object.fromEntries(
        groups.map((g) => [g, opts.cases.filter((c) => c.group === g).length]),
      ),
      expectedDocs: opts.cases.reduce((s, c) => s + c.expected.length, 0),
      synthetic: opts.cases.filter((c) => c.source === 'synthetic').length,
    },
    repeat,
    overall: aggregate(outcomes, expectedCounts),
    byGroup,
    perRun,
    unstableCases,
    outcomes,
  };
}

export type EvalReport = Awaited<ReturnType<typeof runEval>>;
