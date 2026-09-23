import { describe, expect, it } from 'vitest';
import { packSections, replaceSection, splitIntoSections } from './sections.js';

const DOC = `# API

Intro text.

## Tasks

Tasks are things.

### GET /tasks

Returns tasks, oldest first.

## Options

\`\`\`bash
# not a heading: it is inside a code fence
docdrift --help
\`\`\`

Done.
`;

describe('splitIntoSections', () => {
  const sections = splitIntoSections(DOC);

  it('splits at headings and keeps the text byte for byte', () => {
    expect(sections.map((s) => s.heading)).toEqual([
      '# API',
      '## Tasks',
      '### GET /tasks',
      '## Options',
    ]);
    // Sections are consecutive line ranges: joined, they are the file again.
    expect(sections.map((s) => s.content).join('\n')).toBe(DOC);
  });

  it('records where each section is and what it sits under', () => {
    const endpoint = sections[2]!;
    expect(endpoint).toMatchObject({ breadcrumb: ['# API', '## Tasks'], startLine: 9 });
    expect(endpoint.content).toContain('oldest first');
    expect(
      DOC.split('\n')
        .slice(endpoint.startLine - 1, endpoint.endLine)
        .join('\n'),
    ).toBe(endpoint.content);
  });

  it('ignores "#" inside code fences', () => {
    expect(sections[3]!.content).toContain('# not a heading');
    expect(sections).toHaveLength(4);
  });

  it('handles underlined headings and a preamble before the first one', () => {
    const s = splitIntoSections('Preamble line.\n\nTitle\n=====\n\nBody.\n');
    expect(s.map((x) => x.heading)).toEqual(['', 'Title']);
    expect(s[0]!.content).toContain('Preamble line.');
  });

  it('gives one section for a document without headings', () => {
    const s = splitIntoSections('Just text.\nMore text.\n');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ heading: '', startLine: 1, endLine: 3 });
  });
});

describe('replaceSection', () => {
  const sections = splitIntoSections(DOC);

  it('splices the new text in and leaves the rest untouched', () => {
    const updated = replaceSection(
      DOC,
      sections[2]!,
      '### GET /tasks\n\nReturns tasks ordered by priority.\n',
    );
    expect(updated).toContain('Returns tasks ordered by priority.');
    expect(updated).not.toContain('oldest first');
    expect(updated).toContain('## Options'); // everything else is still there
    expect(updated!.endsWith('Done.\n')).toBe(true);
  });

  it('refuses when the document no longer matches the section', () => {
    const edited = DOC.replace('Returns tasks, oldest first.', 'Something else entirely.');
    expect(replaceSection(edited, sections[2]!, '### GET /tasks\n\nNew text.\n')).toBeNull();
  });
});

describe('packSections', () => {
  it('merges short sections and splits long ones without losing text', () => {
    const doc = [
      '# One',
      'short',
      '## Two',
      'also short',
      '## Big',
      ...Array.from({ length: 40 }, (_, i) => `line ${i} of a long section`),
    ].join('\n');
    const packed = packSections(splitIntoSections(doc), { min: 80, max: 300 });

    expect(packed.length).toBeGreaterThan(1);
    expect(packed.map((s) => s.content).join('\n')).toBe(doc);
    expect(packed.every((s) => s.content.length <= 300)).toBe(true);
    expect(packed.map((s) => s.index)).toEqual(packed.map((_, i) => i));
    // A split section says so, so the model is never told a part is the whole.
    expect(packed.filter((s) => s.heading.endsWith('(continued)')).length).toBeGreaterThan(0);
  });

  it('keeps each piece replaceable in the original document', () => {
    const doc = `# A\n\n${'x'.repeat(50)}\n\n## B\n\n${'y'.repeat(400)}\n`;
    const packed = packSections(splitIntoSections(doc), { min: 40, max: 200 });
    for (const s of packed) {
      expect(replaceSection(doc, s, s.content)).toBe(doc);
    }
  });
});
