/**
 * Runs the evaluation and writes a report to eval/reports/.
 *
 *   npm run eval                               DocDrift with your AI settings (apps/api/.env)
 *   npm run eval -- --baseline                 the keyword baseline (no AI, free)
 *   npm run eval -- --cases 001,021 --repeat 3 some cases, three times each
 *   npm run eval -- --no-save                  print only, don't write a report
 *   npm run eval -- --fresh                    ignore answers saved by an interrupted run
 *   npm run eval -- --retrieval path-rules     measure the old filename-based document selection
 *   npm run eval -- --model <id>               another model than AI_MODEL (see npm run ai:models)
 *
 * The AI run sends each case (small synthetic repositories, no real code or
 * secrets) to your configured provider: about 26 calls per run.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEnv } from '../src/config/env.js';
import { createAIProvider } from '../src/modules/ai/index.js';
import { fileCheckpoint } from './checkpoint.js';
import { loadCases, problemsWith } from './dataset.js';
import { aiDetector, keywordBaseline, type Detector } from './detectors.js';
import { toMarkdown } from './report.js';
import { EvalStopped, runEval } from './run.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const CASES = join(REPO_ROOT, 'eval/cases');
const REPORTS = join(REPO_ROOT, 'eval/reports');

const { values } = parseArgs({
  options: {
    baseline: { type: 'boolean', default: false },
    cases: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    'delay-ms': { type: 'string' },
    'no-save': { type: 'boolean', default: false },
    /** Ignore answers saved by an interrupted run and ask everything again. */
    fresh: { type: 'boolean', default: false },
    /** 'content' (default) or 'path-rules' (the Phase 1 selection), for comparison. */
    retrieval: { type: 'string' },
    /** Use another model than AI_MODEL (free-tier quotas are per model). */
    model: { type: 'string' },
  },
});

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const cases = await loadCases(CASES, values.cases?.split(',').filter(Boolean) ?? []);
  if (cases.length === 0) throw new Error(`No cases matched in ${CASES}`);
  const broken = cases.flatMap((c) => problemsWith(c).map((p) => `${c.id}: ${p}`));
  if (broken.length) throw new Error(`Invalid cases:\n  ${broken.join('\n  ')}`);

  const repeat = Number(values.repeat);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10)
    throw new Error('--repeat must be 1–10');

  let detector: Detector;
  let delayMs = 0;
  const retrieval = values.retrieval as 'content' | 'path-rules' | undefined;
  if (retrieval && retrieval !== 'content' && retrieval !== 'path-rules')
    throw new Error("--retrieval must be 'content' or 'path-rules'");

  if (values.baseline) {
    detector = keywordBaseline({ timeoutMs: 0, maxInputTokens: 30_000, retrieval });
  } else {
    if (values.model && !/^[a-z0-9][a-z0-9.-]*$/.test(values.model))
      throw new Error(
        `"${values.model}" is not a model id. Run npm run ai:models and copy an id from the list (e.g. one containing "flash").`,
      );
    const env = loadEnv(values.model ? { ...process.env, AI_MODEL: values.model } : process.env);
    const ai = createAIProvider(env);
    if (!ai)
      throw new Error(
        'No AI provider configured (AI_PROVIDER, AI_API_KEY, AI_MODEL in apps/api/.env). Use --baseline to run without AI.',
      );
    detector = aiDetector(ai, {
      timeoutMs: env.AI_TIMEOUT_MS,
      maxInputTokens: env.AI_MAX_INPUT_TOKENS,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
      retrieval,
    });
    // Free tiers allow only a few requests per minute; pace the calls.
    delayMs = Number(values['delay-ms'] ?? 4000);
  }

  // Only full, saved runs resume: a partial selection or --no-save is a quick check.
  const resumable = !values['no-save'] && !values.cases && detector.promptVersion !== null;
  const checkpoint = resumable
    ? fileCheckpoint(
        join(
          REPO_ROOT,
          'eval/.checkpoints',
          `${detector.name}-${detector.model}-${detector.promptVersion}-x${repeat}.json`.replace(
            /[^a-z0-9.-]+/gi,
            '_',
          ),
        ),
      )
    : undefined;
  if (checkpoint && values.fresh) await checkpoint.clear();
  const saved = (await checkpoint?.count()) ?? 0;
  if (saved)
    console.warn(
      `Resuming: ${saved} answer(s) saved by an earlier, interrupted run will be reused (use --fresh to ask again).`,
    );

  console.warn(
    `Evaluating ${detector.name} (${detector.model}) on ${cases.length} case(s) × ${repeat}\n`,
  );
  const report = await runEval({
    cases,
    detector,
    repeat,
    delayMs,
    checkpoint,
    onRetry: (id, code, waitMs) =>
      console.warn(`  ${id}: ${code} (provider busy) — trying again in ${waitMs / 1000} s`),
    onCase: (o, i, total) => {
      const verdict = o.detection.error
        ? `ERROR ${o.detection.error.code}: ${o.detection.error.message.slice(0, 200)}`
        : o.correct
          ? 'right'
          : `WRONG${o.fn.length ? ` missed ${o.fn.join(', ')}` : ''}${o.fp.length ? ` flagged ${o.fp.join(', ')}` : ''}`;
      console.warn(`[${i}/${total}] ${o.caseId}: ${verdict}`);
    },
  });

  await checkpoint?.clear(); // complete: the next run starts fresh
  const m = report.overall;
  const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);
  console.warn(
    `\nPrecision ${pct(m.precision)} · Recall ${pct(m.recall)} · F1 ${pct(m.f1)} · ` +
      `cases right ${pct(m.caseAccuracy)} · false alarms ${pct(m.falseAlarmRate)} · errors ${m.errors.count}`,
  );

  if (!values['no-save']) {
    await mkdir(REPORTS, { recursive: true });
    const stamp = report.generatedAt.slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const model = detector.model.replace(/[^a-z0-9.-]+/gi, '_');
    const base = join(REPORTS, `${stamp}-${detector.name}-${model}-${detector.retrieval}`);
    await writeFile(`${base}.md`, toMarkdown(report));
    await writeFile(`${base}.json`, JSON.stringify(report, null, 2) + '\n');
    console.warn(`Report: ${relative(process.cwd(), `${base}.md`)} (+ .json with every answer)`);
  }
}

main().catch((err: unknown) => {
  if (err instanceof EvalStopped) {
    console.error(
      `\n✗ ${err.message}. No report was written (a partial run would give misleading numbers).`,
    );
    console.error(
      '  Answers received so far are saved: run the same command again later and it continues where it stopped.',
    );
    if (err.lastError.code === 'AI_RATE_LIMITED')
      console.error(
        /per ?day|daily|exceeded your current quota/i.test(err.lastError.message)
          ? '  This looks like the daily free-tier quota: try again tomorrow.'
          : '  Wait a minute, then try again with more time between calls, e.g. npm run eval -- --delay-ms 15000',
      );
    else if (['AI_AUTH', 'AI_BAD_REQUEST'].includes(err.lastError.code))
      console.error(
        '  Check AI_API_KEY and the model id (npm run ai:models lists valid ids), then npm run ai:check.',
      );
    else console.error('  The provider seems unavailable right now; try again later.');
    process.exit(1);
  }
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
