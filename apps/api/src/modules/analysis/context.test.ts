import { describe, expect, it } from 'vitest';
import {
  extractKeywords,
  isSensitivePath,
  MAX_CHARS_PER_FILE,
  pickDocCandidates,
  rankDocs,
  redactSecrets,
  selectChangedFiles,
} from './context.js';

describe('isSensitivePath', () => {
  it.each([
    ['.env', true],
    ['config/.env.production', true],
    ['certs/server.pem', true],
    ['keys/deploy.key', true],
    ['.ssh/id_rsa', true],
    ['.npmrc', true],
    ['config/secrets.yml', true],
    ['.env.example', false],
    ['src/env.ts', false],
    ['docs/keys.md', false],
  ])('%s → %s', (path, expected) => expect(isSensitivePath(path)).toBe(expected));
});

describe('redactSecrets', () => {
  it('removes common token formats and secret assignments', () => {
    const input = [
      '+const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";',
      '+AWS_KEY=AKIAABCDEFGHIJKLMNOP',
      '+DATABASE_URL=postgres://app:SuperSecret123@db:5432/app',
      '+  apiKey: "live_4f9a8b7c6d5e"',
      '+const password = process.env.DB_PASSWORD;',
      '+-----BEGIN RSA PRIVATE KEY-----\n+MIIEow\n+-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const { text, redactions } = redactSecrets(input);
    for (const secret of [
      'ghp_abcdef',
      'AKIAABCDEF',
      'SuperSecret123',
      'live_4f9a8b7c6d5e',
      'MIIEow',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('postgres://app:[REDACTED]@db');
    expect(text).toContain('process.env.DB_PASSWORD'); // references to env vars are not secrets
    expect(redactions).toBeGreaterThanOrEqual(5);
  });

  it('leaves ordinary code alone', () => {
    const code = '+const task = { id: nextId++, title, completed: false };';
    expect(redactSecrets(code)).toEqual({ text: code, redactions: 0 });
  });
});

describe('selectChangedFiles', () => {
  const patch = (n: number) => '@@ -1 +1 @@\n' + '+x'.repeat(n);

  it('skips sensitive, generated, binary and patch-less files, with reasons', () => {
    const { included, skipped } = selectChangedFiles(
      [
        { filename: 'src/a.js', status: 'modified', additions: 1, deletions: 0, patch: patch(10) },
        { filename: '.env', status: 'modified', additions: 1, deletions: 0, patch: patch(10) },
        {
          filename: 'package-lock.json',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: patch(10),
        },
        { filename: 'logo.png', status: 'added', additions: 0, deletions: 0, patch: null },
        { filename: 'src/big.js', status: 'modified', additions: 1, deletions: 0, patch: null },
      ],
      10_000,
    );
    expect(included.map((f) => f.filename)).toEqual(['src/a.js']);
    expect(skipped).toEqual([
      { filename: '.env', reason: 'sensitive' },
      { filename: 'package-lock.json', reason: 'generated' },
      { filename: 'logo.png', reason: 'binary' },
      { filename: 'src/big.js', reason: 'no_patch' },
    ]);
  });

  it('gives source files the budget first and truncates huge patches', () => {
    const { included, skipped } = selectChangedFiles(
      [
        {
          filename: 'test/a.test.js',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: patch(3000),
        },
        {
          filename: 'src/huge.js',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: patch(MAX_CHARS_PER_FILE),
        },
      ],
      MAX_CHARS_PER_FILE + 100,
    );
    expect(included.map((f) => [f.filename, f.truncated])).toEqual([['src/huge.js', true]]);
    expect(skipped).toEqual([{ filename: 'test/a.test.js', reason: 'budget' }]);
  });
});

describe('documentation retrieval', () => {
  it('prefers the root README, docs/ and docs next to changed code; ignores licences', () => {
    const picked = pickDocCandidates(
      [
        'LICENSE.md',
        'CHANGELOG.md',
        'README.md',
        'docs/configuration.md',
        'src/routes/README.md',
        'notes/random.md',
        'src/app.js',
      ],
      ['src/routes/tasks.js'],
    );
    expect(picked[0]).toBe('README.md');
    expect(picked).toContain('docs/configuration.md');
    expect(picked).toContain('src/routes/README.md');
    expect(picked).not.toContain('LICENSE.md');
    expect(picked).not.toContain('src/app.js');
    expect(picked.indexOf('CHANGELOG.md')).toBe(picked.length - 1);
  });

  it('extracts identifiers from changed lines only', () => {
    const kw = extractKeywords([
      '@@ -1 +1 @@\n context_word\n-  done: false\n+  completed: false, priority\n',
    ]);
    expect(kw).toEqual(expect.arrayContaining(['done', 'completed', 'priority']));
    expect(kw).not.toContain('context_word');
    expect(kw).not.toContain('false');
  });

  it('ranks docs by how many changed identifiers they mention', () => {
    const ranked = rankDocs(
      [
        { path: 'docs/deploy.md', content: 'How to deploy with Docker.' },
        { path: 'README.md', content: 'Each task has `done` and `priority` fields.' },
      ],
      ['done', 'priority', 'completed'],
    );
    expect(ranked[0]).toMatchObject({ path: 'README.md', score: 2, matched: ['done', 'priority'] });
    expect(ranked[1]!.score).toBe(0);
  });
});
