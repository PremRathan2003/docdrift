import { describe, expect, it } from 'vitest';
import { anchorHeadings } from './anchors.js';

const DOC = `# API

Intro.

## Tasks

Each task has a \`done\` field.

## Options

Limit is 20.
`;

describe('anchorHeadings', () => {
  it('names the section a change was made in', () => {
    const after = DOC.replace('`done` field', '`completed` field');
    expect(anchorHeadings(DOC, after)).toEqual(['## Tasks']);
  });

  it('names every section touched', () => {
    const after = DOC.replace('`done` field', '`completed` field').replace('Limit is 20', 'Limit is 50');
    expect(anchorHeadings(DOC, after)).toEqual(['## Tasks', '## Options']);
  });

  it('names the section text was added to, not the one after it', () => {
    // The common real case: a new option documented beside its siblings.
    const after = DOC.replace('Limit is 20.\n', 'Limit is 20.\n\nOffset starts at 0.\n');
    expect(anchorHeadings(DOC, after)).toEqual(['## Options']);
  });

  it('reports a change above the first heading as an empty heading', () => {
    expect(anchorHeadings('Preamble.\n\n# Title\n\nBody.\n', 'Changed.\n\n# Title\n\nBody.\n')).toEqual([
      '',
    ]);
  });

  it('returns nothing when the document did not change', () => {
    expect(anchorHeadings(DOC, DOC)).toEqual([]);
  });
});
