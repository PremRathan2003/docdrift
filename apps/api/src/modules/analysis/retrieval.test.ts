import { describe, expect, it } from 'vitest';
import { pathPrior, queryTerms, rankByContent, tokenize } from './retrieval.js';

describe('tokenize', () => {
  it('keeps the identifier and adds its parts', () => {
    expect(tokenize('killDescendants')).toEqual(['killdescendants', 'kill', 'descendants']);
    expect(tokenize('--log-level')).toEqual(['log-level', 'log', 'level']);
    expect(tokenize('subprocess.readableStream')).toEqual([
      'subprocess.readablestream',
      'subprocess',
      'readable',
      'stream',
    ]);
    expect(tokenize('DB_URL')).toEqual(['db_url', 'url']);
  });

  it('drops filler words and punctuation', () => {
    expect(tokenize('the value is returned from this function')).toEqual(['value', 'returned']);
  });
});

describe('queryTerms', () => {
  it('uses only changed lines and weighs removals higher', () => {
    const terms = queryTerms([
      '@@ -1,2 +1,2 @@\n context mentions ignored\n-const timeout = 30\n+const timeoutSeconds = 30',
    ]);
    expect(terms.get('timeout')).toBe(3); // removed (2) + part of the added identifier (1)
    expect(terms.get('timeoutseconds')).toBe(1);
    expect(terms.has('ignored')).toBe(false); // context lines are not part of the query
  });

  it('ignores the diff headers', () => {
    expect(queryTerms(['--- a/file.ts\n+++ b/file.ts\n-alpha\n+beta']).has('file.ts')).toBe(false);
  });
});

describe('rankByContent', () => {
  const docs = [
    { path: 'docs/api.md', content: 'The API returns tasks. Options: limit, offset.' },
    {
      path: 'docs/termination.md',
      content: 'Terminating a subprocess kills it. Use killDescendants to kill descendants too.',
    },
    { path: 'docs/install.md', content: 'Install with npm install. Requires Node 20.' },
    { path: 'CHANGELOG.md', content: 'killDescendants was added in version 9.2.0.' },
  ];

  it('puts the document that talks about the change first, whatever its filename', () => {
    const ranked = rankByContent(docs, queryTerms(['@@\n+  const { killDescendants } = options;']));
    expect(ranked[0]!.path).toBe('docs/termination.md');
    expect(ranked[0]!.matched).toContain('killdescendants');
    // Unrelated documents score zero and are dropped by the caller.
    expect(ranked.filter((d) => d.score > 0).map((d) => d.path)).not.toContain('docs/install.md');
  });

  it('ranks a changelog below a document describing current behaviour', () => {
    const ranked = rankByContent(docs, queryTerms(['@@\n+killDescendants']));
    const paths = ranked.map((d) => d.path);
    expect(paths.indexOf('docs/termination.md')).toBeLessThan(paths.indexOf('CHANGELOG.md'));
  });

  it('gives every document zero when nothing matches', () => {
    const ranked = rankByContent(docs, queryTerms(['@@\n+const unrelatedThing = 1;']));
    expect(ranked.every((d) => d.score === 0)).toBe(true);
  });

  it('does not let the filename bonus outweigh content (at most ±25%)', () => {
    expect(pathPrior('README.md')).toBeCloseTo(1.15);
    expect(pathPrior('docs/api.md')).toBeCloseTo(1.1);
    expect(pathPrior('CHANGELOG.md')).toBeCloseTo(0.75);
    expect(pathPrior('docs/termination.md')).toBe(1);
  });
});
