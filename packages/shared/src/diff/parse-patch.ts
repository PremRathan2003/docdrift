/**
 * Parses the `patch` field GitHub returns for each changed file (the hunks of a
 * unified diff, without the ---/+++ file headers) into typed lines with line
 * numbers. Used by the diff viewer, and later to cite exact lines as evidence.
 */
export type DiffLineType = 'add' | 'del' | 'context' | 'note';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

export function parsePatch(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.replace(/\r\n/g, '\n').split('\n')) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      current = { header: raw, oldStart: oldLine, newStart: newLine, lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current) continue; // anything before the first hunk is ignored

    const marker = raw[0];
    const content = raw.slice(1);
    if (marker === '+')
      current.lines.push({ type: 'add', content, oldLine: null, newLine: newLine++ });
    else if (marker === '-')
      current.lines.push({ type: 'del', content, oldLine: oldLine++, newLine: null });
    else if (marker === '\\')
      current.lines.push({ type: 'note', content: raw, oldLine: null, newLine: null });
    else if (marker === ' ')
      current.lines.push({ type: 'context', content, oldLine: oldLine++, newLine: newLine++ });
    // An empty string only appears as the trailing split artefact; ignore it.
  }
  return hunks;
}
