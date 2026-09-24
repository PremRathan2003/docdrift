/**
 * Fills in `expected[].anchors` for the real cases, by diffing each expected
 * document as it was before and after the pull request that the case came
 * from. Reads GitHub only (no model, no API key) and touches nothing else in
 * case.json, so hand-reviewed labels survive.
 *
 *   npm run eval:anchors            every real case
 *   npm run eval:anchors -- 103     just this one
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { anchorHeadings } from './anchors.js';
import { caseSchema } from './dataset.js';
import { gitHubReader, parsePullRequestUrl } from './github-import.js';

// GITHUB_TOKEN lifts GitHub's 60 requests/hour to 5 000; it lives in apps/api/.env.
if (existsSync('.env')) process.loadEnvFile('.env');

const CASES = new URL('../../../eval/cases', import.meta.url).pathname;
const only = process.argv.slice(2);
const reader = gitHubReader({ token: process.env.GITHUB_TOKEN });

const dirs = (await readdir(CASES, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((n) => only.length === 0 || only.some((p) => n.startsWith(p)))
  .sort();

let changed = 0;
for (const dir of dirs) {
  const file = join(CASES, dir, 'case.json');
  const meta = caseSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  if (meta.source !== 'real' || !meta.origin) continue;

  const { owner, repo } = parsePullRequestUrl(meta.origin.url);
  const expected = [];
  for (const e of meta.expected) {
    const before = await reader.raw(owner, repo, meta.origin.baseSha, e.path);
    const after = await reader.raw(owner, repo, meta.origin.headSha, e.path);
    if (before === null || after === null) {
      console.warn(`  ! ${dir} ${e.path}: not found at one of the commits, left as it was`);
      expected.push(e);
      continue;
    }
    const anchors = anchorHeadings(before, after).filter(Boolean);
    console.warn(`  ${dir} ${e.path}: ${anchors.length ? anchors.join(' | ') : '(no headings)'}`);
    expected.push({ ...e, anchors });
  }

  const updated = { ...meta, expected };
  if (JSON.stringify(updated) !== JSON.stringify(meta)) {
    await writeFile(file, `${JSON.stringify(updated, null, 2)}\n`);
    changed++;
  }
}
console.warn(`\n${changed} case file(s) updated.`);
