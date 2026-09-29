import { describe, expect, it } from 'vitest';
import { buildContext, type PipelineConfig, type RepoSource } from './pipeline.js';

/** One long reference document, the shape that forces sectioning. */
const SECTIONS = Array.from(
  { length: 12 },
  // Many short lines: packSections never cuts mid-line, so a section made of
  // one enormous line could not be split however small the limit.
  (_, i) =>
    `## options.setting${i}\n\n${Array.from({ length: 60 }, () => `Text about what setting${i} does and when to use it.`).join('\n')}`,
).join('\n\n');
const DOC = `# API\n\n${SECTIONS}\n`;

const source: RepoSource = {
  fullName: 'o/r',
  changedFiles: async () => [
    {
      filename: 'src/options.js',
      status: 'modified',
      additions: 1,
      deletions: 1,
      // Three sections match: with one match, the budget would change nothing,
      // because only sections that score above zero are shown at all.
      patch:
        '@@ -1,3 +1,3 @@\n-const setting7 = 1;\n-const setting3 = 1;\n-const setting9 = 1;\n+const setting7 = 2;\n+const setting3 = 2;\n+const setting9 = 2;\n',
    },
  ],
  treePaths: async () => ['docs/api.md', 'src/options.js'],
  textFile: async (p) => (p === 'docs/api.md' ? DOC : null),
};

const pr = { number: 1, title: 'Change a setting', body: null, baseRef: 'main', headRef: 'f' };
const base: PipelineConfig = { timeoutMs: 1_000, maxInputTokens: 30_000 };

describe('buildContext section settings', () => {
  it('shows a long document in parts, and more parts when given more room', async () => {
    const size = { min: 400, max: 3_000 };
    const tight = await buildContext(source, pr, {
      ...base,
      sectionSize: size,
      sectionBudget: 3_000,
    });
    const roomy = await buildContext(source, pr, {
      ...base,
      sectionSize: size,
      sectionBudget: 20_000,
    });

    expect(tight.sectionedDocs).toEqual(['docs/api.md']);
    const fewer = tight.docs[0]!.sections!.chosen.length;
    const more = roomy.docs[0]!.sections!.chosen.length;
    expect(more).toBeGreaterThan(fewer);
    // Whatever is shown, the whole document stays available for splicing.
    expect(roomy.docs[0]!.full).toBe(DOC);
  });

  it('cuts the document at the size it is given', async () => {
    const small = await buildContext(source, pr, {
      ...base,
      sectionSize: { min: 200, max: 1_000 },
      sectionBudget: 20_000,
    });
    expect(small.docs[0]!.sections!.chosen.every((s) => s.content.length <= 1_000)).toBe(true);
  });
});
