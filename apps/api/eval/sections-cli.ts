/**
 * Sweeps the settings that decide which parts of a long document are shown,
 * and reports how often the part the developer actually edited reached the
 * model — whether because the document fitted whole or because the right
 * section was chosen. The denominator is every expected document with an
 * anchor, so settings stay comparable: one that shows more of one document by
 * dropping another is not an improvement, and this counts both.
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
  sectionSize?: { min: number; max: number };
  sectionBudget?: number;
  docShare?: number;
  maxInputTokens?: number;
}

/** The current defaults first, so a change is always read against them. */
const VARIANTS: Variant[] = [
  { label: 'current defaults' },
  { label: 'max 6k (the old default)', sectionSize: { min: 400, max: 6_000 } },
  { label: 'max 5k', sectionSize: { min: 400, max: 5_000 } },
  { label: 'max 4k', sectionSize: { min: 400, max: 4_000 } },
  { label: 'max 3k', sectionSize: { min: 400, max: 3_000 } },
  { label: 'max 2.5k', sectionSize: { min: 400, max: 2_500 } },
  { label: 'max 2k', sectionSize: { min: 400, max: 2_000 } },
  { label: 'max 1.5k', sectionSize: { min: 300, max: 1_500 } },
  // Does a modest extra allowance add anything once the pieces are small?
  { label: 'max 3k + 12k per doc', sectionSize: { min: 400, max: 3_000 }, sectionBudget: 12_000 },
  { label: 'max 2k + 12k per doc', sectionSize: { min: 400, max: 2_000 }, sectionBudget: 12_000 },
  // The expensive option, for reference: +30% prompt.
  { label: 'max 3k + 18k per doc + half the budget', sectionSize: { min: 400, max: 3_000 }, sectionBudget: 18_000, docShare: 0.5 },
];

const cases = (await loadCases(CASES)).filter((c) => c.expected.some((e) => e.anchors.length));
if (!cases.length) throw new Error('No cases carry anchors. Run npm run eval:anchors first.');

console.warn(`${cases.length} case(s) with anchors\n`);
for (const v of VARIANTS) {
  const config: PipelineConfig = {
    timeoutMs: 1_000,
    maxInputTokens: v.maxInputTokens ?? 30_000,
    retrieval: 'content',
    ...(v.sectionSize ? { sectionSize: v.sectionSize } : {}),
    ...(v.sectionBudget ? { sectionBudget: v.sectionBudget } : {}),
    ...(v.docShare ? { docShare: v.docShare } : {}),
  };
  let complete = 0;
  let sectionHit = 0;
  let sectionMiss = 0;
  let neverRetrieved = 0;
  let promptChars = 0;
  const missed: string[] = [];

  for (const c of cases) {
    const ctx = await buildContext(caseSource(c), pullRequestOf(c), config);
    promptChars += ctx.manifest.promptChars;
    for (const e of c.expected) {
      if (!e.anchors.length) continue;
      const doc = ctx.docs.find((d) => d.path === e.path);
      const where = `${c.id.slice(0, 3)}:${e.path.split('/').pop()}`;
      if (!doc) {
        // Giving one document more room can push another out of the prompt
        // altogether; that is a loss, and counting only sectioned documents
        // would hide it.
        neverRetrieved++;
        missed.push(`${where} (not sent)`);
      } else if (!doc.sections) {
        complete++;
      } else if (splitIntoSections(doc.content).some((x) => e.anchors.includes(x.heading))) {
        sectionHit++;
      } else {
        sectionMiss++;
        missed.push(where);
      }
    }
  }

  const total = complete + sectionHit + sectionMiss + neverRetrieved;
  const reachable = complete + sectionHit;
  const pct = total ? Math.round((reachable / total) * 100) : 0;
  console.warn(
    `${v.label.padEnd(30)} reachable ${String(reachable).padStart(2)}/${total} (${String(pct).padStart(3)}%)  ` +
      `whole ${complete}, right section ${sectionHit}, wrong section ${sectionMiss}, not sent ${neverRetrieved}  ` +
      `prompt ${Math.round(promptChars / cases.length / 1000)}k chars`,
  );
  if (missed.length) console.warn(`${''.padEnd(30)} missed: ${missed.join(', ')}`);
}

console.warn(
  '\nA document shown without the section the developer edited cannot be updated by any model.',
);
