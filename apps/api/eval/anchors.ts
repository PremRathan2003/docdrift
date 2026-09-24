/**
 * Where in a document the developer's own edit landed.
 *
 * Retrieval is measured at document level: did the file that needed changing
 * reach the model? On real repositories that is no longer the hard part. A
 * 54 kB reference file is shown as a few sections, and the model can only fix
 * what it was shown — so the question that decides recall is finer: were those
 * the RIGHT sections?
 *
 * Answering it needs ground truth for "right", and the pull request already
 * has it. Diffing the document before and after the developer's edit gives the
 * sections of the pre-PR file they touched. Those headings are the anchors: a
 * run that never showed one of them could not have produced the update, and
 * that is a retrieval failure rather than a model failure.
 *
 * This measurement needs no model and no API key, so section ranking can be
 * improved in a loop that costs nothing.
 */
import { structuredPatch } from 'diff';
import { splitIntoSections } from '../src/modules/analysis/sections.js';

/**
 * Headings of the sections of `before` that the change to `after` touched.
 * Text above the first heading has no heading to name, so it is reported as
 * an empty string and callers decide what to do with it.
 */
export function anchorHeadings(before: string, after: string): string[] {
  const { hunks } = structuredPatch('doc', 'doc', before, after, '', '', { context: 0 });
  const sections = splitIntoSections(before);
  const hit = new Set<string>();

  for (const h of hunks) {
    // An insertion has no lines in the old file: it sits at oldStart.
    const from = h.oldStart;
    const to = h.oldLines === 0 ? h.oldStart : h.oldStart + h.oldLines - 1;
    for (const s of sections) {
      if (s.startLine <= to && s.endLine >= from) hit.add(s.heading);
    }
  }
  return [...hit];
}
