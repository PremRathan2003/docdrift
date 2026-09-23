import { datasetHash, type EvalCase } from './dataset.js';
import type { Detection, Detector } from './detectors.js';
import { aggregate, scoreCase, type CaseOutcome, type Metrics } from './score.js';

export interface EvalOptions {
  cases: EvalCase[];
  detector: Detector;
  /** Run every case this many times: models are not deterministic. */
  repeat?: number;
  /** Pause between model calls, to stay inside free-tier rate limits. */
  delayMs?: number;
  /**
   * Waits before re-running a case whose run failed with a temporary provider
   * error (overloaded, rate-limited, timed out). The pipeline's own retries are
   * seconds apart; provider outages often last longer. Default: 30 s, then 60 s.
   */
  transientRetryWaitsMs?: number[];
  /**
   * Stop after this many cases in a row end in an error (after retries): the
   * provider is down or the quota is used up, and carrying on only wastes calls.
   */
  stopAfterConsecutiveErrors?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  onCase?: (outcome: CaseOutcome, index: number, total: number) => void;
  onRetry?: (caseId: string, code: string, waitMs: number) => void;
  /**
   * Saved answers from an interrupted run (e.g. the daily quota ran out). A case
   * whose content hasn't changed since is not asked again; the report says how
   * many answers were reused.
   */
  checkpoint?: Checkpoint;
}

export interface SavedAnswer {
  detection: Detection;
  latencyMs: number;
  savedAt: string;
}

export interface Checkpoint {
  get(key: string): Promise<SavedAnswer | null>;
  save(key: string, answer: SavedAnswer): Promise<void>;
}

/** Thrown when the run is abandoned; nothing is scored from a partial run. */
export class EvalStopped extends Error {
  constructor(
    readonly completed: number,
    readonly total: number,
    readonly lastError: { code: string; message: string },
  ) {
    super(`Stopped after ${completed} of ${total} cases: repeated ${lastError.code} errors`);
  }
}

/** Errors that will fail every case the same way (bad key, unknown model): stop at once. */
export const CONFIG_ERRORS = new Set(['AI_AUTH', 'AI_BAD_REQUEST']);

/** Provider errors that say "try again later", not "your request is wrong". */
export const TRANSIENT_ERRORS = new Set(['AI_UNAVAILABLE', 'AI_RATE_LIMITED', 'AI_TIMEOUT']);

export async function runEval(opts: EvalOptions) {
  const repeat = opts.repeat ?? 1;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const clock = opts.clock ?? Date.now;
  const outcomes: CaseOutcome[] = [];
  const total = opts.cases.length * repeat;
  const retryWaits = opts.transientRetryWaitsMs ?? [30_000, 60_000];
  const retries: { caseId: string; run: number; code: string }[] = [];
  const stopAfter = opts.stopAfterConsecutiveErrors ?? 3;
  let errorsInARow = 0;
  const reused: { caseId: string; run: number; savedAt: string }[] = [];

  for (let run = 1; run <= repeat; run++) {
    for (const c of opts.cases) {
      // Same case content + same run number = same question; changed cases are asked again.
      const key = `${c.id}#${run}#${await datasetHash([c])}`;
      const saved = await opts.checkpoint?.get(key);
      if (saved) {
        const outcome = scoreCase(c, saved.detection, {
          run,
          latencyMs: saved.latencyMs,
          checkContent: opts.detector.writesContent,
        });
        outcomes.push(outcome);
        reused.push({ caseId: c.id, run, savedAt: saved.savedAt });
        opts.onCase?.(outcome, outcomes.length, total);
        continue;
      }

      let started = clock();
      let detection = await opts.detector.detect(c);
      for (const wait of retryWaits) {
        if (!detection.error || !TRANSIENT_ERRORS.has(detection.error.code)) break;
        retries.push({ caseId: c.id, run, code: detection.error.code });
        opts.onRetry?.(c.id, detection.error.code, wait);
        await sleep(wait);
        started = clock();
        detection = await opts.detector.detect(c);
      }
      const outcome = scoreCase(c, detection, {
        run,
        latencyMs: clock() - started,
        checkContent: opts.detector.writesContent,
      });
      outcomes.push(outcome);
      opts.onCase?.(outcome, outcomes.length, total);
      // Only real answers are kept: an error should be asked again next time.
      if (!detection.error)
        await opts.checkpoint?.save(key, {
          detection,
          latencyMs: outcome.latencyMs,
          savedAt: new Date().toISOString(),
        });
      errorsInARow = detection.error ? errorsInARow + 1 : 0;
      if (detection.error && (errorsInARow >= stopAfter || CONFIG_ERRORS.has(detection.error.code)))
        throw new EvalStopped(outcomes.length, total, detection.error);
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
  const sources = [...new Set(opts.cases.map((c) => c.source))];
  const bySource: Record<string, Metrics> = {};
  for (const s of sources)
    bySource[s] = aggregate(
      outcomes.filter((o) => o.source === s),
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
    /** synthetic vs real pull requests: the comparison milestone 2.2 exists for. */
    bySource,
    perRun,
    unstableCases,
    /** Cases re-run after a temporary provider error (each counted once, by its final result). */
    retries,
    /** Answers taken from a checkpoint of an earlier, interrupted run. */
    reused,
    outcomes,
  };
}

export type EvalReport = Awaited<ReturnType<typeof runEval>>;
