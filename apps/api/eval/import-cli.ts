/**
 * Adds real pull requests to the evaluation dataset.
 *
 *   npm run eval:import -- find tj/commander.js           pull requests that touched docs/ and what else they changed
 *   npm run eval:import -- find encode/httpx docs/advanced  the same, for another documentation folder
 *   npm run eval:import -- https://github.com/o/r/pull/12  import one or more PRs as cases
 *
 * Public repositories only. Without GITHUB_TOKEN, GitHub allows 60 API
 * requests per hour (about 3 per imported PR, 1 per PR listed by `find`).
 * Always review a new case (case.json) before committing it.
 */
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  findCandidates,
  gitHubReader,
  importPullRequest,
  parsePullRequestUrl,
} from './github-import.js';

// DOCDRIFT_CASES_DIR lets the bundled tool run from anywhere (see eval/README.md).
const CASES = process.env.DOCDRIFT_CASES_DIR ?? join(import.meta.dirname, '../../../eval/cases');

// GITHUB_TOKEN lifts GitHub's 60 requests/hour to 5 000; it lives in apps/api/.env.
if (existsSync('.env')) process.loadEnvFile('.env');

async function nextId(slug: string) {
  const used = (await readdir(CASES)).map((d) => Number(d.slice(0, 3))).filter((n) => n >= 101);
  const n = Math.max(100, ...used) + 1;
  return `${String(n).padStart(3, '0')}-${slug}`;
}

async function main() {
  const args = process.argv.slice(2);
  const gh = gitHubReader({ token: process.env.GITHUB_TOKEN || undefined });

  if (args[0] === 'find') {
    const [owner, repo] = (args[1] ?? '').split('/');
    if (!owner || !repo) throw new Error('Usage: find owner/repo [docs path] [limit]');
    const docPath = args[2] && !/^\d+$/.test(args[2]) ? args[2] : 'docs';
    const limit = Number(args.find((a, i) => i > 1 && /^\d+$/.test(a)) ?? 20);
    const rows = await findCandidates(gh, owner, repo, limit, docPath);
    for (const r of rows) {
      const kind = r.code && r.docs.length ? 'CODE+DOCS' : r.code ? 'code only' : 'no code';
      console.warn(`${kind.padEnd(10)} ${r.url}  ${r.title}`);
      if (r.docs.length) console.warn(`           docs: ${r.docs.join(', ')}`);
    }
    console.warn(
      '\nCODE+DOCS PRs make "drift" cases; clear, internal "code only" PRs make "no-drift" cases.',
    );
    return;
  }

  if (args.length === 0) throw new Error('Give one or more pull request URLs, or: find owner/repo');
  for (const url of args) {
    const ref = parsePullRequestUrl(url);
    const slug = `${ref.repo}-${ref.number}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const id = await nextId(slug);
    try {
      const r = await importPullRequest(gh, ref, { id, casesDir: CASES });
      console.warn(
        `✓ ${id}: ${r.meta.group}, expects ${r.meta.expected.map((e) => e.path).join(', ') || 'nothing'}`,
      );
      for (const e of r.meta.expected)
        console.warn(
          `    ${e.path}: must contain ${JSON.stringify(e.mustContain)}, not ${JSON.stringify(e.mustNotContain)}`,
        );
      for (const w of r.warnings) console.warn(`  ! ${w}`);
    } catch (err) {
      console.error(`✗ ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.warn('\nReview each new eval/cases/1xx-*/case.json (labels, notes) before committing.');
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
