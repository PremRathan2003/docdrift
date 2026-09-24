/**
 * Sweeps the settings that decide which parts of a long document are shown,
 * and reports how often the part the developer actually edited was among them.
 *
 *   npm run eval:sections
 *
 * No model and no API key: the answer comes from the cases' anchors, so this
 * loop costs nothing and can be run as often as you like. It is the ceiling on
 * recall for long documents — a section that was never shown cannot be updated,
 * however good the model is.
 */
import { buildContext, type PipelineConfig } from '../src/modules/analysis/pipeline.js';
import { splitIntoSections } from '../src/modules/analysis/sections.js';
import { caseSource, loadCases } from './dataset.js';
import { pullRequestOf } from './detectors.js';

const CASES = process.env.DOCDRIFT_CASES_DIR ?? new URL('../../../eval/cases', import.meta.url).pathname;

interface Variant {
  label: string;
  sectionSize: { min: number; max: number };
  sectionBudget: number;
}

/** The current defaults first, so a change is always read against them. */
const VARIANTS: Variant[] = [
  { label: 'current defaults', sectionSize: { min: 400, max: 6_000 }, sectionBudget: 9_000 },
  { label: 'smaller sections', sectionSize: { min: 400, max: 3_000 }, sectionBudget: 9_000 },
  { label: 'more room', sectionSize: { min: 400, max: 6_000 }, sectionBudget: 18_000 },
  { label: 'smaller + more room', sectionSize: { min: 400, max: 3_000 }, sectionBudget: 18_000 },
  { label: 'small sections, lots of room', sectionSize: { min: 300, max: 2_000 }, sectionBudget: 24_000 },
];

const cases = (await loadCases(CASES)).filter((c) => c.expected.some((e) => e.anchors.length));
if (!cases.length) throw new Error('No cases carry anchors. Run npm run eval:anchors first.');

console.warn(`${cases.length} case(s) with anchors\n`);
for (const v of VARIANTS) {
  const config: PipelineConfig = {
    timeoutMs: 1_000,
    maxInputTokens: 30_000,
    retrieval: 'content',
    sectionSize: v.sectionSize,
    sectionBudget: v.sectionBudget,
  };
  let hit = 0;
  let measured = 0;
  let promptChars = 0;
  const missed: string[] = [];

  for (const c of cases) {
    const ctx = await buildContext(caseSource(c), pullRequestOf(c), config);
    promptChars += ctx.manifest.promptChars;
    for (const e of c.expected) {
      const doc = ctx.docs.find((d) => d.path === e.path);
      // Only documents shown in parts can miss; a complete one always contains it.
      if (!doc?.sections || !e.anchors.length) continue;
      measured++;
      const shown = splitIntoSections(doc.content).map((s) => s.heading);
      if (shown.some((h) => e.anchors.includes(h))) hit++;
      else missed.push(`${c.id.slice(0, 3)}:${e.path.split('/').pop()}`);
    }
  }

  const pct = measured ? Math.round((hit / measured) * 100) : 0;
  console.warn(
    `${v.label.padEnd(30)} sections ${String(hit).padStart(2)}/${measured} (${String(pct).padStart(3)}%)  ` +
      `prompt ${Math.round(promptChars / cases.length / 1000)}k chars/case`,
  );
  if (missed.length) console.warn(`${''.padEnd(30)} still missed: ${missed.join(', ')}`);
}
console.warn(
  '\nA document shown without the section the developer edited cannot be updated by any model.',
);
