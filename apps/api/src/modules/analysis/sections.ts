/**
 * Splitting a document into sections, so a long reference file can be shown —
 * and updated — a piece at a time.
 *
 * Why: until now DocDrift sent each document whole and asked for the whole file
 * back. On real projects that broke twice over. execa's `docs/api.md` is far
 * past the size limit, so it arrived truncated and DocDrift refused to rewrite
 * what it could not see in full; and when a 40 kB readme did get through, the
 * model ran out of output space mid-answer. Sections fix both ends: only the
 * relevant parts go in, and only one part comes back.
 *
 * The caller splices the updated section back into the file, so everything
 * downstream (the diff, the review page, the exported patch) still works with
 * complete documents.
 */

export interface Section {
  /** 0-based position in the document. */
  index: number;
  /** The heading line as written, e.g. "### `GET /tasks`". Empty for the part before the first heading. */
  heading: string;
  /** Headings above this one, outermost first: what the section is part of. */
  breadcrumb: string[];
  /** The section's own text, heading line included, exactly as in the file. */
  content: string;
  /** 1-based line range in the document, inclusive. */
  startLine: number;
  endLine: number;
}

/** "## Title" → level 2. Fenced code blocks are skipped: `# comment` is not a heading. */
const ATX = /^(#{1,6})\s+(\S.*?)\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** Splits a Markdown-ish document at its headings. Files without headings give one section. */
export function splitIntoSections(content: string): Section[] {
  const lines = content.split('\n');
  const starts: { line: number; level: number; heading: string }[] = [];
  let inFence = false;

  for (const [i, line] of lines.entries()) {
    if (FENCE.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = ATX.exec(line);
    // A setext heading ("Title" underlined with === or ---) counts too.
    const setext =
      !m &&
      i > 0 &&
      /^(=+|-{2,})\s*$/.test(line) &&
      lines[i - 1]!.trim() !== '' &&
      !ATX.test(lines[i - 1]!);
    if (m) starts.push({ line: i, level: m[1]!.length, heading: line });
    else if (setext)
      starts.push({
        line: i - 1,
        level: line.trim().startsWith('=') ? 1 : 2,
        heading: lines[i - 1]!,
      });
  }

  if (starts.length === 0) {
    return [
      {
        index: 0,
        heading: '',
        breadcrumb: [],
        content,
        startLine: 1,
        endLine: lines.length,
      },
    ];
  }

  const bounds: { from: number; to: number; level: number; heading: string }[] = [];
  if (starts[0]!.line > 0) bounds.push({ from: 0, to: starts[0]!.line - 1, level: 0, heading: '' }); // preamble
  for (const [i, s] of starts.entries()) {
    const next = starts[i + 1];
    bounds.push({
      from: s.line,
      to: (next ? next.line : lines.length) - 1,
      level: s.level,
      heading: s.heading,
    });
  }

  const open: { level: number; heading: string }[] = [];
  return bounds.map((b, index) => {
    while (open.length && open[open.length - 1]!.level >= b.level) open.pop();
    const breadcrumb = open.map((o) => o.heading);
    if (b.heading) open.push({ level: b.level, heading: b.heading });
    return {
      index,
      heading: b.heading,
      breadcrumb,
      content: lines.slice(b.from, b.to + 1).join('\n'),
      startLine: b.from + 1,
      endLine: b.to + 1,
    };
  });
}

/**
 * Replaces one section's text in a document, leaving everything else byte for
 * byte as it was. Returns null if the section no longer matches the document,
 * so a stale or invented answer can never overwrite a file.
 */
export function replaceSection(content: string, section: Section, updated: string): string | null {
  const lines = content.split('\n');
  const current = lines.slice(section.startLine - 1, section.endLine).join('\n');
  if (current !== section.content) return null;
  return [
    ...lines.slice(0, section.startLine - 1),
    ...updated.split('\n'),
    ...lines.slice(section.endLine),
  ].join('\n');
}

/**
 * Groups small sections together and splits huge ones, so each piece is a
 * sensible size to send and to rewrite. Splitting keeps the heading on the
 * first piece and marks the others "(continued)", never cutting mid-line.
 */
export function packSections(sections: Section[], opts: { min: number; max: number }): Section[] {
  const out: Section[] = [];
  const push = (s: Omit<Section, 'index'>) => out.push({ ...s, index: out.length });

  let pending: Section | undefined;
  const flush = () => {
    if (pending) push(pending);
    pending = undefined;
  };

  for (const s of sections) {
    if (s.content.length > opts.max) {
      flush();
      const lines = s.content.split('\n');
      let chunk: string[] = [];
      let startLine = s.startLine;
      let part = 0;
      const emit = (endLine: number) => {
        push({
          heading: part === 0 ? s.heading : `${s.heading} (continued)`,
          breadcrumb: s.breadcrumb,
          content: chunk.join('\n'),
          startLine,
          endLine,
        });
        part++;
      };
      for (const [i, line] of lines.entries()) {
        const size = chunk.join('\n').length + line.length + 1;
        if (chunk.length && size > opts.max) {
          emit(s.startLine + i - 1);
          chunk = [];
          startLine = s.startLine + i;
        }
        chunk.push(line);
      }
      if (chunk.length) emit(s.endLine);
      continue;
    }
    if (pending && pending.content.length + s.content.length + 1 <= opts.max) {
      // Merge a short section into the previous one; they stay contiguous.
      pending = {
        ...pending,
        content: `${pending.content}\n${s.content}`,
        endLine: s.endLine,
      };
      continue;
    }
    flush();
    pending = { ...s };
    if (pending.content.length >= opts.min) flush();
  }
  flush();
  return out;
}
