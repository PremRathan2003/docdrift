import { describe, expect, it } from 'vitest';
import type { ContextDoc } from './pipeline.js';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompts/v3.js';
import { packSections, splitIntoSections } from './sections.js';
import { parseModelOutput, stripLineNumbers, validateSemantics } from './validate.js';

const rec = (path: string, evidence: string[], extra: Partial<Record<string, unknown>> = {}) => ({
  documentationPath: path,
  reason: 'r',
  evidence: evidence.map((filePath) => ({ filePath, detail: 'd' })),
  scope: 'file' as const,
  suggestedUpdate: 'new text',
  modelConfidence: 0.7,
  uncertainty: '',
  ...extra,
});

/** A document shown to the model in full. */
const whole = (path: string, content = 'old text'): ContextDoc => ({
  path,
  content,
  full: content,
  sections: null,
  matched: [],
});

describe('parseModelOutput', () => {
  it('accepts valid JSON, also inside a ```json fence', () => {
    const json = JSON.stringify({ summary: 's', recommendations: [] });
    expect(parseModelOutput(json).ok).toBe(true);
    expect(parseModelOutput('```json\n' + json + '\n```').ok).toBe(true);
  });

  it('distinguishes invalid JSON from schema mismatches', () => {
    expect(parseModelOutput('{"summary": ')).toMatchObject({ ok: false, reason: 'invalid_json' });
    expect(
      parseModelOutput(
        JSON.stringify({ summary: 's', recommendations: [{ documentationPath: 'README.md' }] }),
      ),
    ).toMatchObject({
      ok: false,
      reason: 'schema_mismatch',
      detail: expect.stringContaining('recommendations.0'),
    });
  });

  it('says what came back instead of JSON, so a failed run can be diagnosed', () => {
    expect(parseModelOutput('  ')).toMatchObject({
      reason: 'invalid_json',
      detail: 'The model returned no answer text',
    });
    expect(parseModelOutput('I cannot help with that.\nSorry.')).toMatchObject({
      reason: 'invalid_json',
      detail: expect.stringContaining('I cannot help with that. Sorry.'),
    });
    // A half-written answer and a mis-escaped one both say "not valid JSON";
    // the text around the offending position is what tells them apart.
    const cutShort = parseModelOutput('{"summary": "The pull request renames a fie');
    expect(cutShort).toMatchObject({ reason: 'invalid_json' });
    expect(cutShort.ok === false && cutShort.detail).toContain('renames a fie');
    const badEscape = parseModelOutput('{"summary": "Use C:\\Users\\app to start", "recommendations": []}');
    expect(badEscape.ok === false && badEscape.detail).toContain('Users');
  });

  it('defaults scope to a whole-file update (answers from prompt v2 stay valid)', () => {
    const parsed = parseModelOutput(
      JSON.stringify({
        summary: 's',
        recommendations: [
          {
            documentationPath: 'README.md',
            reason: 'r',
            evidence: [{ filePath: 'a.js', detail: 'd' }],
            suggestedUpdate: 'x',
            modelConfidence: 0.5,
            uncertainty: '',
          },
        ],
      }),
    );
    expect(parsed.ok && parsed.output.recommendations[0]!.scope).toBe('file');
  });
});

describe('validateSemantics', () => {
  const ctx = {
    changedFiles: ['src/store.js', 'src/routes/tasks.js'],
    docs: [whole('README.md'), whole('docs/configuration.md')],
  };

  it('keeps grounded recommendations', () => {
    const { recommendations, warnings } = validateSemantics(
      { summary: 's', recommendations: [rec('README.md', ['src/store.js'])] },
      ctx,
    );
    expect(recommendations).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('drops invented documentation paths and evidence that was not changed', () => {
    const { recommendations, warnings } = validateSemantics(
      {
        summary: 's',
        recommendations: [
          rec('docs/invented.md', ['src/store.js']),
          rec('README.md', ['src/store.js', 'src/other.js']),
          rec('docs/configuration.md', ['src/unrelated.js']),
          rec('README.md', ['src/routes/tasks.js']),
        ],
      },
      ctx,
    );
    expect(
      recommendations.map((r) => [r.documentationPath, r.evidence.map((e) => e.filePath)]),
    ).toEqual([['README.md', ['src/store.js']]]);
    expect(warnings).toHaveLength(5);
  });
});

describe('validateSemantics on documents shown as sections', () => {
  const DOC = `# API\n\n## Tasks\n\nEach task has a \`done\` field.\n\n## Options\n\nLimit is 20.\n`;
  const sections = packSections(splitIntoSections(DOC), { min: 1, max: 1000 });
  const doc: ContextDoc = {
    path: 'docs/api.md',
    content: sections[1]!.content,
    full: DOC,
    sections: { chosen: [sections[1]!], total: sections.length, raw: splitIntoSections(DOC) },
    matched: [],
  };
  const ctx = { changedFiles: ['src/store.js'], docs: [doc] };

  it('splices an updated section into the complete document', () => {
    const { recommendations, warnings } = validateSemantics(
      {
        summary: 's',
        recommendations: [
          rec('docs/api.md', ['src/store.js'], {
            scope: 'section',
            sectionHeading: '## Tasks',
            suggestedUpdate: '## Tasks\n\nEach task has a `completed` field.\n',
          }),
        ],
      },
      ctx,
    );
    expect(warnings).toEqual([]);
    // The result is the whole file: only the named section changed.
    expect(recommendations[0]!.suggestedUpdate).toBe(
      '# API\n\n## Tasks\n\nEach task has a `completed` field.\n\n## Options\n\nLimit is 20.\n',
    );
  });

  it('refuses a section that was not shown, instead of guessing where it goes', () => {
    const { recommendations, warnings } = validateSemantics(
      {
        summary: 's',
        recommendations: [
          rec('docs/api.md', ['src/store.js'], {
            scope: 'section',
            sectionHeading: '## Something else',
            suggestedUpdate: 'text',
          }),
        ],
      },
      ctx,
    );
    expect(recommendations).toEqual([]);
    expect(warnings[0]).toContain('was not one of the sections shown');
  });

  it('accepts a heading the model copied with the prompt label attached', () => {
    const { recommendations, warnings } = validateSemantics(
      {
        summary: 's',
        recommendations: [
          rec('docs/api.md', ['src/store.js'], {
            scope: 'section',
            // Models echo the prompt's own labelling; the text of the heading is what counts.
            sectionHeading: '## Tasks — under # API',
            suggestedUpdate: '## Tasks\n\nEach task has a `completed` field.\n',
          }),
        ],
      },
      ctx,
    );
    expect(warnings).toEqual([]);
    expect(recommendations[0]!.suggestedUpdate).toContain('`completed` field');
  });

  it('refuses a whole-file rewrite of a document that was only shown in parts', () => {
    const { recommendations, warnings } = validateSemantics(
      { summary: 's', recommendations: [rec('docs/api.md', ['src/store.js'])] },
      ctx,
    );
    expect(recommendations).toEqual([]);
    expect(warnings[0]).toContain('shown as sections');
  });
});

describe('a section update for a document shown in full', () => {
  const DOC = '# API\n\n## Tasks\n\nEach task has a `done` field.\n\n## Options\n\nLimit is 20.\n';
  const ctx = { changedFiles: ['src/store.js'], docs: [whole('docs/api.md', DOC)] };

  it('splices it in rather than refusing on a formality', () => {
    const { recommendations, warnings } = validateSemantics(
      {
        summary: 's',
        recommendations: [
          rec('docs/api.md', ['src/store.js'], {
            scope: 'section',
            sectionHeading: '## Tasks',
            suggestedUpdate: '## Tasks\n\nEach task has a `completed` field.\n',
          }),
        ],
      },
      ctx,
    );
    expect(warnings).toEqual([]);
    expect(recommendations[0]!.suggestedUpdate).toBe(
      '# API\n\n## Tasks\n\nEach task has a `completed` field.\n\n## Options\n\nLimit is 20.\n',
    );
  });

  it('still refuses a heading the document does not have', () => {
    const { warnings, recommendations } = validateSemantics(
      {
        summary: 's',
        recommendations: [
          rec('docs/api.md', ['src/store.js'], {
            scope: 'section',
            sectionHeading: '## Invented',
            suggestedUpdate: 'text',
          }),
        ],
      },
      ctx,
    );
    expect(recommendations).toEqual([]);
    expect(warnings[0]).toContain('is not a heading of this document');
  });
});

describe('SYSTEM_PROMPT', () => {
  it('asks for every affected document, not just the clearest one', () => {
    // Five of ten reachable misses were the same drift reported for one
    // document while another saying the same thing was left alone.
    expect(SYSTEM_PROMPT).toContain('Check EVERY candidate document');
  });

  it('treats an accurate but incomplete document as out of date', () => {
    expect(SYSTEM_PROMPT).toMatch(/every sentence is still true can still be out of date/);
    // …while still refusing to blame this change for an older gap.
    expect(SYSTEM_PROMPT).toContain('already incomplete before it is not this change');
  });
});

describe('buildUserPrompt', () => {
  it('labels complete documents and sectioned ones differently', () => {
    const prompt = buildUserPrompt({
      repository: 'o/r',
      pullRequest: { number: 1, title: 't', body: null, baseRef: 'main', headRef: 'f' },
      files: [],
      skippedFiles: [],
      docs: [
        { path: 'README.md', content: '# R\n' },
        {
          path: 'docs/api.md',
          sections: [{ heading: '## Tasks', breadcrumb: ['# API'], content: '## Tasks\n\nText.' }],
          totalSections: 12,
        },
      ],
    });
    expect(prompt).toContain('=== README.md (complete)');
    expect(prompt).toContain('=== docs/api.md (1 of 12 sections');
    expect(prompt).toContain('--- (this section sits under # API)');
    expect(prompt).toContain('--- section heading: ## Tasks');
  });
});

describe('stripLineNumbers', () => {
  it('removes a gutter the model copied from the prompt', () => {
    const answer = '   1| # Title\n   2| \n   3| Body text.';
    expect(stripLineNumbers(answer)).toEqual({
      text: '# Title\n\nBody text.',
      stripped: true,
    });
  });

  it('leaves a document that merely contains such a line alone', () => {
    // A real table row, not a gutter: the numbering neither starts at 1 nor runs on.
    const doc = '# Sizes\n\n| n | meaning |\n| 12| twelve |\n';
    expect(stripLineNumbers(doc)).toEqual({ text: doc, stripped: false });
    expect(stripLineNumbers('   7| seventh\n   8| eighth')).toMatchObject({ stripped: false });
  });
});

describe('a suggestion that arrives with line numbers', () => {
  const DOC = '# API\n\nUse the `done` field.\n';
  const ctx = { changedFiles: ['src/store.js'], docs: [whole('README.md', DOC)] };

  it('is cleaned up and reported, rather than written to the file as-is', () => {
    const { recommendations, warnings } = validateSemantics(
      {
        summary: 's',
        recommendations: [
          rec('README.md', ['src/store.js'], {
            suggestedUpdate: '   1| # API\n   2| \n   3| Use the `completed` field.\n   4| ',
          }),
        ],
      },
      ctx,
    );
    expect(recommendations[0]!.suggestedUpdate).toBe('# API\n\nUse the `completed` field.\n');
    expect(warnings[0]).toContain('Removed the line numbers');
  });
});
