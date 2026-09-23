import { describe, expect, it } from 'vitest';
import {
  AIProviderError,
  type AIProvider,
  type JsonGenerationRequest,
} from '../src/modules/ai/provider.js';
import { changedFilesOf, type EvalCase } from './dataset.js';
import { aiDetector, keywordBaseline, removedTokens } from './detectors.js';

const README = '# App\n\nSet `DB_URL` before starting.\n';

function evalCase(): EvalCase {
  const head = new Map([
    ['README.md', README],
    ['src/config.js', 'export const url = process.env.DATABASE_URL;\n'],
  ]);
  const base = new Map([['src/config.js', 'export const url = process.env.DB_URL;\n']]);
  return {
    id: '001-rename',
    title: 'Rename DB_URL',
    body: '',
    group: 'drift',
    category: 'c',
    expected: [{ path: 'README.md', mustContain: ['DATABASE_URL'], mustNotContain: ['DB_URL'] }],
    acceptable: [],
    added: [],
    trimmedFiles: [],
    notes: 'n',
    source: 'synthetic',
    head,
    base,
    changedFiles: changedFilesOf(head, base, []),
    tree: null,
  };
}

const config = { timeoutMs: 1000, maxInputTokens: 30_000, sleep: async () => {} };

function scripted(answers: (string | Error)[]) {
  const seen: JsonGenerationRequest[] = [];
  const ai: AIProvider = {
    name: 'fake',
    model: 'm',
    async generateJson(req) {
      seen.push(req);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return { text: next!, usage: { inputTokens: 10, outputTokens: 5 }, finishReason: 'STOP' };
    },
  };
  return { ai, seen };
}

describe('removedTokens', () => {
  it('keeps identifiers and numbers that were removed and not re-added', () => {
    expect(
      removedTokens(['@@ -1 +1 @@\n-const port = 3000; // DB_URL\n+const port = 8080;']),
    ).toEqual(['3000', 'DB_URL']);
  });
});

describe('keywordBaseline', () => {
  it('flags documents that mention a removed identifier', async () => {
    const d = await keywordBaseline(config).detect(evalCase());
    expect(d.recommendations.map((r) => r.documentationPath)).toEqual(['README.md']);
  });
});

describe('aiDetector', () => {
  const answer = JSON.stringify({
    summary: 'Renamed variable.',
    recommendations: [
      {
        documentationPath: 'README.md',
        reason: 'Old name.',
        evidence: [{ filePath: 'src/config.js', detail: 'DB_URL → DATABASE_URL' }],
        suggestedUpdate: README.replace('DB_URL', 'DATABASE_URL'),
        modelConfidence: 0.9,
        uncertainty: '',
      },
      {
        documentationPath: 'docs/invented.md',
        reason: 'Made up.',
        evidence: [{ filePath: 'src/config.js', detail: 'x' }],
        suggestedUpdate: 'x',
        modelConfidence: 0.4,
        uncertainty: '',
      },
    ],
  });

  it('runs the real pipeline, including validation', async () => {
    const { ai, seen } = scripted([answer]);
    const d = await aiDetector(ai, config).detect(evalCase());
    expect(seen[0]!.user).toContain('Title: Rename DB_URL');
    expect(seen[0]!.user).toContain('=== README.md');
    expect(d.recommendations.map((r) => r.documentationPath)).toEqual(['README.md']);
    expect(d.warnings).toHaveLength(1); // the invented path was dropped
    expect(d).toMatchObject({ attempts: 1, inputTokens: 10, outputTokens: 5, skipped: false });
  });

  it('turns provider failures into an error result instead of throwing', async () => {
    const { ai } = scripted([new AIProviderError('AI_AUTH', 'bad key')]);
    const d = await aiDetector(ai, config).detect(evalCase());
    expect(d.error).toEqual({ code: 'AI_AUTH', message: 'bad key' });
    expect(d.recommendations).toEqual([]);
  });

  it('retries malformed output like the app does', async () => {
    const { ai, seen } = scripted(['not json', answer]);
    const d = await aiDetector(ai, config).detect(evalCase());
    expect(seen).toHaveLength(2);
    expect(d.attempts).toBe(2);
  });

  it('still reports the documents it retrieved when the model never answers', async () => {
    // Otherwise a model failure is scored as a retrieval miss, which sends the
    // next piece of work to the wrong part of the system.
    const { ai } = scripted(['not json', 'still not json', 'nope']);
    const d = await aiDetector(ai, config).detect(evalCase());
    expect(d.error?.code).toBe('AI_INVALID_OUTPUT');
    expect(d.docsSent).toEqual(['README.md']);
    // And the message says what came back, not just that it was wrong.
    expect(d.error?.message).toContain('"nope"');
  });
});
