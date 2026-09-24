import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCase, problemsWith } from './dataset.js';
import {
  deriveContentChecks,
  findCandidates,
  TRIM_ABOVE_BYTES,
  trimToChanges,
  importPullRequest,
  parsePullRequestUrl,
  type GitHubReader,
} from './github-import.js';

const README_BEFORE = '# cli\n\nUse `--verbose` to print more.\n\n## License\n\nMIT\n';
const README_AFTER = '# cli\n\nUse `--log-level debug` to print more.\n\n## License\n\nMIT\n';
const CLI_BEFORE = "program.option('--verbose');\n";
const CLI_AFTER = "program.option('--log-level <level>');\n";

/** A tiny public repository: the PR changes cli.js, README.md, CHANGELOG.md and adds docs/new.md. */
function fakeGitHub(): { gh: GitHubReader; apiCalls: string[] } {
  const apiCalls: string[] = [];
  const files: Record<string, Record<string, string>> = {
    base1: {
      'src/cli.js': CLI_BEFORE,
      'README.md': README_BEFORE,
      'CHANGELOG.md': '# Changes\n',
      'docs/guide.md': '# Guide\n\nRun it.\n',
      'docs/build.py': 'FLAGS = ["--verbose"]\n',
    },
    head1: {
      'src/cli.js': CLI_AFTER,
      'README.md': README_AFTER,
      'CHANGELOG.md': '# Changes\n\n- --log-level\n',
      'docs/guide.md': '# Guide\n\nRun it.\n',
      'docs/new.md': '# New\n',
      'docs/build.py': 'FLAGS = ["--log-level"]\n',
    },
  };
  const responses: Record<string, unknown> = {
    '/repos/acme/cli/pulls/7': {
      html_url: 'https://github.com/acme/cli/pull/7',
      title: 'Replace --verbose with --log-level',
      body: 'Closes #3',
      merged_at: '2026-01-01T00:00:00Z',
      base: { sha: 'tip', repo: { full_name: 'acme/cli', license: { spdx_id: 'MIT' } } },
      head: { sha: 'head1' },
    },
    '/repos/acme/cli/compare/tip...head1': {
      merge_base_commit: { sha: 'base1' },
      files: [
        { filename: 'src/cli.js', status: 'modified' },
        { filename: 'README.md', status: 'modified' },
        { filename: 'CHANGELOG.md', status: 'modified' },
        { filename: 'docs/new.md', status: 'added' },
        { filename: 'docs/build.py', status: 'modified' },
      ],
    },
    '/repos/acme/cli/git/trees/head1?recursive=1': {
      truncated: false,
      tree: Object.keys(files.head1!).map((path) => ({ path, type: 'blob' })),
    },
  };
  return {
    apiCalls,
    gh: {
      async api<T>(path: string) {
        apiCalls.push(path);
        if (!(path in responses)) throw new Error(`unexpected ${path}`);
        return responses[path] as T;
      },
      async raw(_o, _r, sha, path) {
        return files[sha]?.[path] ?? null;
      },
    },
  };
}

describe('parsePullRequestUrl', () => {
  it('accepts PR URLs only', () => {
    expect(parsePullRequestUrl('https://github.com/tj/commander.js/pull/2105')).toEqual({
      owner: 'tj',
      repo: 'commander.js',
      number: 2105,
    });
    expect(() => parsePullRequestUrl('https://github.com/tj/commander.js/issues/1')).toThrow();
  });
});

describe('deriveContentChecks', () => {
  it('prefers code-like words the developer added or removed', () => {
    expect(
      deriveContentChecks(README_BEFORE, README_AFTER, {
        added: [CLI_AFTER],
        removed: [CLI_BEFORE],
      }),
    ).toEqual({ mustContain: ['--log-level'], mustNotContain: ['--verbose'] });
  });
});

describe('trimToChanges', () => {
  it('keeps the changed lines with context and drops the rest', () => {
    const before = [...Array(200).keys()].map((i) => `line ${i}`).join('\n') + '\n';
    const after = before.replace('line 100', 'line one hundred');
    const t = trimToChanges(before, after, 'big.txt');
    expect(t.before.length).toBeLessThan(before.length / 2);
    expect(t.before).toContain('line 100');
    expect(t.after).toContain('line one hundred');
    expect(t.before).toContain('line 60'); // context kept
    expect(t.before).not.toContain('line 10\n'); // far away: dropped
    // The same marker is in both versions, so the diff still shows only the real change.
    const changed = t.after.split('\n').filter((l) => !new Set(t.before.split('\n')).has(l));
    expect(changed).toEqual(['line one hundred']);
    expect(TRIM_ABOVE_BYTES).toBeGreaterThan(1000);
  });
});

describe('importPullRequest', () => {
  it('writes a valid case: code as changed, docs as before the PR, labels from the edit', async () => {
    const casesDir = await mkdtemp(join(tmpdir(), 'cases-'));
    const { gh, apiCalls } = fakeGitHub();
    const r = await importPullRequest(
      gh,
      { owner: 'acme', repo: 'cli', number: 7 },
      { id: '101-cli-7', casesDir, now: () => new Date('2026-09-22T00:00:00Z') },
    );
    expect(apiCalls).toHaveLength(3);
    expect(r.meta).toMatchObject({
      group: 'drift',
      source: 'real',
      expected: [
        { path: 'README.md', mustContain: ['--log-level'], mustNotContain: ['--verbose'] },
      ],
      // A script under docs/ counts as documentation for the app, but makes a poor label.
      acceptable: ['CHANGELOG.md', 'docs/build.py'],
      origin: { repository: 'acme/cli', license: 'MIT', baseSha: 'base1', headSha: 'head1' },
    });

    const c = await loadCase(r.written);
    expect(problemsWith(c)).toEqual([]);
    // DocDrift sees the stale README, not the developer's fix.
    expect(c.head.get('README.md')).toBe(README_BEFORE);
    // Only the code change is in the diff.
    expect(c.changedFiles.map((f) => f.filename)).toEqual(['src/cli.js']);
    // A document the PR added didn't exist yet.
    expect(c.tree).not.toContain('docs/new.md');
    expect(c.tree).toContain('src/cli.js');
  });

  it('refuses PRs that were not merged', async () => {
    const { gh } = fakeGitHub();
    const unmerged: GitHubReader = {
      ...gh,
      api: async <T>(p: string) => ({ ...(await gh.api<object>(p)), merged_at: null }) as T,
    };
    await expect(
      importPullRequest(
        unmerged,
        { owner: 'acme', repo: 'cli', number: 7 },
        { id: '101-x', casesDir: '/tmp' },
      ),
    ).rejects.toThrow(/not merged/);
  });
});

describe('findCandidates', () => {
  /** Answers only the calls a run should make, so a wrong call shows up as a failure. */
  const reader = (responses: Record<string, unknown>): GitHubReader => ({
    async api(path: string) {
      const key = Object.keys(responses).find((k) => path.startsWith(k));
      if (!key) throw new Error(`unexpected call: ${path}`);
      return responses[key] as never;
    },
    async raw() {
      return null;
    },
  });

  const files = [
    { filename: 'src/cli.js', status: 'modified' },
    { filename: 'docs/guide.md', status: 'modified' },
    { filename: 'test/cli.test.js', status: 'modified' },
  ];

  it('follows the commits that touched the documentation', async () => {
    // Listing recent pull requests instead would spend the hourly budget on
    // pull requests that changed no documentation at all.
    const found = await findCandidates(
      reader({
        '/repos/o/r/commits': [
          { commit: { message: 'feat: add --log-level (#12)\n\nbody' } },
          { commit: { message: 'docs: fix a typo (#11)' } },
          { commit: { message: 'chore: no pull request number here' } },
        ],
        '/repos/o/r/pulls/12/files': files,
        '/repos/o/r/pulls/11/files': files,
      }),
      'o',
      'r',
      5,
    );
    expect(found.map((f) => f.url)).toEqual([
      'https://github.com/o/r/pull/12',
      'https://github.com/o/r/pull/11',
    ]);
    expect(found[0]).toMatchObject({ code: 1, tests: 1, docs: ['docs/guide.md'] });
  });

  it('falls back to recent merged pull requests when merges are not squashed', async () => {
    const found = await findCandidates(
      reader({
        '/repos/o/r/commits': [{ commit: { message: 'Merge pull request from a branch' } }],
        '/repos/o/r/pulls?': [
          { number: 7, title: 'Add a flag', merged_at: '2026-01-01T00:00:00Z', html_url: 'u7' },
          { number: 8, title: 'Never merged', merged_at: null, html_url: 'u8' },
        ],
        '/repos/o/r/pulls/7/files': files,
      }),
      'o',
      'r',
      5,
    );
    expect(found.map((f) => f.url)).toEqual(['u7']);
  });
});
