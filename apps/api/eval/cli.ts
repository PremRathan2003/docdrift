/**
 * Runs the evaluation and writes a report to eval/reports/.
 *
 *   npm run eval                               DocDrift with your AI settings (apps/api/.env)
 *   npm run eval -- --baseline                 the keyword baseline (no AI, free)
 *   npm run eval -- --cases 001,021 --repeat 3 some cases, three times each
 *   npm run eval -- --no-save                  print only, don't write a report
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
import { loadCases, problemsWith } from './dataset.js';
import { aiDetector, keywordBaseline, type Detector } from './detectors.js';
import { toMarkdown } from './report.js';
import { runEval } from './run.js';

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
  if (values.baseline) {
    detector = keywordBaseline({ timeoutMs: 0, maxInputTokens: 30_000 });
  } else {
    const env = loadEnv();
    const ai = createAIProvider(env);
    if (!ai)
      throw new Error(
        'No AI provider configured (AI_PROVIDER, AI_API_KEY, AI_MODEL in apps/api/.env). Use --baseline to run without AI.',
      );
    detector = aiDetector(ai, {
      timeoutMs: env.AI_TIMEOUT_MS,
      maxInputTokens: env.AI_MAX_INPUT_TOKENS,
    });
    // Free tiers allow only a few requests per minute; pace the calls.
    delayMs = Number(values['delay-ms'] ?? 4000);
  }

  console.warn(
    `Evaluating ${detector.name} (${detector.model}) on ${cases.length} case(s) × ${repeat}\n`,
  );
  const report = await runEval({
    cases,
    detector,
    repeat,
    delayMs,
    onCase: (o, i, total) => {
      const verdict = o.detection.error
        ? `ERROR ${o.detection.error.code}`
        : o.correct
          ? 'right'
          : `WRONG${o.fn.length ? ` missed ${o.fn.join(', ')}` : ''}${o.fp.length ? ` flagged ${o.fp.join(', ')}` : ''}`;
      console.warn(`[${i}/${total}] ${o.caseId}: ${verdict}`);
    },
  });

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
    const base = join(REPORTS, `${stamp}-${detector.name}-${model}`);
    await writeFile(`${base}.md`, toMarkdown(report));
    await writeFile(`${base}.json`, JSON.stringify(report, null, 2) + '\n');
    console.warn(`Report: ${relative(process.cwd(), `${base}.md`)} (+ .json with every answer)`);
  }
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
