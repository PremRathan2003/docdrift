/** Renders an evaluation report as Markdown (readable on GitHub). */
import type { EvalReport } from './run.js';

const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);
const ci = (x: [number, number] | null) => (x ? ` (95% CI ${pct(x[0])}–${pct(x[1])})` : '');
const num = (x: number | null, digits = 0) =>
  x === null ? 'n/a' : x.toLocaleString('en-IE', { maximumFractionDigits: digits });

export function toMarkdown(r: EvalReport): string {
  const m = r.overall;
  const writesContent = r.detector.promptVersion !== null;
  const lines: string[] = [
    `# Evaluation: ${r.detector.name} (${r.detector.model})`,
    '',
    `- **Date:** ${r.generatedAt.slice(0, 16).replace('T', ' ')} UTC`,
    `- **Prompt version:** ${r.detector.promptVersion ?? 'n/a (no model)'}`,
    `- **Document selection:** ${r.detector.retrieval === 'content' ? 'content ranking (BM25)' : 'path rules (Phase 1)'}`,
    `- **Dataset:** ${r.dataset.cases} cases (${Object.entries(r.dataset.byGroup)
      .map(([g, n]) => `${n} ${g}`)
      .join(
        ', ',
      )}), ${r.dataset.expectedDocs} documents that need updating, hash \`${r.dataset.hash}\``,
    `- **Runs per case:** ${r.repeat}`,
    '',
    r.dataset.synthetic === r.dataset.cases
      ? '> All cases are synthetic and labelled by the author. Treat these numbers as a regression check on known patterns, not as accuracy on real-world pull requests.'
      : `> ${r.dataset.synthetic} of ${r.dataset.cases} cases are synthetic and labelled by the author.`,
    '',
    '## Results',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Precision (flagged docs that were right) | ${pct(m.precision)}${ci(m.precisionCI)} — ${m.tp} of ${m.tp + m.fp} |`,
    `| Recall (docs needing updates that were found) | ${pct(m.recall)}${ci(m.recallCI)} — ${m.tp} of ${m.tp + m.fn} |`,
    `| F1 | ${pct(m.f1)} |`,
    `| Cases exactly right | ${pct(m.caseAccuracy)} |`,
    `| Documents that needed updating and reached the model (retrieval ceiling) | ${pct(m.retrieval.rate)} — ${m.retrieval.reached} of ${m.retrieval.expected}${m.retrieval.truncated ? `, and ${m.retrieval.truncated} of those only in part (too long to rewrite in full)` : ''} |`,
    `| False alarms on "nothing to update" cases | ${pct(m.falseAlarmRate)} of ${m.quietCases} |`,
  ];
  if (writesContent) {
    lines.push(
      `| Suggested text passes content checks | ${pct(m.content.passRate)} — ${m.content.passed} of ${m.content.checked} |`,
      `| Median original lines dropped per suggestion | ${num(m.content.medianDroppedLines, 1)} |`,
      `| Mean self-reported confidence when right / wrong | ${num(m.confidence.meanWhenRight, 2)} / ${num(m.confidence.meanWhenWrong, 2)} |`,
      `| Errors | ${m.errors.count}${
        Object.keys(m.errors.byCode).length
          ? ` (${Object.entries(m.errors.byCode)
              .map(([k, v]) => `${k} ×${v}`)
              .join(', ')})`
          : ''
      } |`,
      `| Model calls / mean attempts | ${m.modelCalls} / ${num(m.meanAttempts, 2)} |`,
      `| Items removed by validation | ${m.validationWarnings} |`,
      `| Tokens in / out (total) | ${num(m.tokens.input)} / ${num(m.tokens.output)} |`,
      `| Latency median / max | ${num(m.latencyMs.median === null ? null : m.latencyMs.median / 1000, 1)} s / ${num(m.latencyMs.max === null ? null : m.latencyMs.max / 1000, 1)} s |`,
    );
  }
  if (r.reused.length) {
    const dates = r.reused.map((x) => x.savedAt.slice(0, 16).replace('T', ' ')).sort();
    lines.push(
      '',
      `Resumed run: ${r.reused.length} of ${r.outcomes.length} answers were saved by an earlier, interrupted run of the same detector, model and prompt (${dates[0]}${dates.length > 1 && dates.at(-1) !== dates[0] ? ` – ${dates.at(-1)}` : ''} UTC) and not asked again.`,
    );
  }
  if (r.retries.length) {
    lines.push(
      '',
      `Re-run after a temporary provider error: ${r.retries.map((x) => `${x.caseId} (${x.code})`).join(', ')}. Only the final attempt is scored.`,
    );
  }
  if (r.repeat > 1) {
    lines.push(
      '',
      '### Run to run',
      '',
      '| Run | Precision | Recall | F1 |',
      '| --- | --- | --- | --- |',
      ...r.perRun.map(
        (p) => `| ${p.run} | ${pct(p.precision)} | ${pct(p.recall)} | ${pct(p.f1)} |`,
      ),
      '',
      `Cases with a different verdict between runs: ${r.unstableCases.length ? r.unstableCases.join(', ') : 'none'}.`,
    );
  }

  lines.push(
    '',
    '## Synthetic cases vs real pull requests',
    '',
    '| Cases | Precision | Recall | Reached the model | Cases exactly right | False alarms |',
    '| --- | --- | --- | --- | --- | --- |',
    ...Object.entries(r.bySource).map(
      ([s, x]) =>
        `| ${s} (${r.outcomes.filter((o) => o.source === s).length}) | ${pct(x.precision)} | ${pct(x.recall)} | ${pct(x.retrieval.rate)} | ${pct(x.caseAccuracy)} | ${x.quietCases ? pct(x.falseAlarmRate) : '—'} |`,
    ),
    '',
    '## By group',
    '',
    '| Group | Precision | Recall | Cases exactly right | False alarms |',
    '| --- | --- | --- | --- | --- |',
    ...Object.entries(r.byGroup).map(
      ([g, x]) =>
        `| ${g} | ${pct(x.precision)} | ${pct(x.recall)} | ${pct(x.caseAccuracy)} | ${x.quietCases ? pct(x.falseAlarmRate) : '—'} |`,
    ),
    '',
    '## Every case',
    '',
    '| Case | Run | Verdict | Missed | Wrongly flagged | Content check |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const o of r.outcomes) {
    const verdict = o.detection.error
      ? `error: ${o.detection.error.code}`
      : o.correct
        ? 'right'
        : 'wrong';
    const content = o.content.length
      ? o.content
          .map((c) =>
            c.passed
              ? `${c.path} ok`
              : `${c.path}: ${[...c.missing.map((s) => `missing "${s}"`), ...c.stale.map((s) => `still has "${s}"`)].join(', ')}`,
          )
          .join('; ')
      : '—';
    lines.push(
      `| ${o.caseId} | ${o.run} | ${verdict} | ${o.fn.join(', ') || '—'} | ${o.fp.join(', ') || '—'} | ${content.replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push(
    '',
    '## How to read this',
    '',
    '- A document counts once per case and run. "Acceptable" documents (either answer is reasonable) never count.',
    '- Runs that errored flagged nothing, so their expected documents count as misses.',
    '- Document selection decides which files the model ever sees, so recall can never beat the retrieval line.',
    '- Content checks only test that the new wording is there and the stale wording is gone; a person still reviews every suggestion.',
    '- Self-reported confidence is the model’s own estimate, not a probability.',
    '',
  );
  return lines.join('\n');
}
