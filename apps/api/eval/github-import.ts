/**
 * Turns a real, merged pull request into an evaluation case.
 *
 * The idea: when a developer changed code AND updated a document in the same
 * PR, that document needed updating: the developer said so. The importer
 * keeps the code change but puts every document back to its state before the
 * PR, so DocDrift sees exactly the situation where the docs had drifted. The
 * expected answer comes from the developer's own edit, not from us:
 *   - expected documents = documents the PR modified (changelogs: acceptable),
 *   - mustContain = distinctive words the developer added to the document,
 *   - mustNotContain = distinctive words the developer removed from it.
 * PRs that changed code but no documentation become "no-drift" cases, a
 * weaker label (the docs may have been stale anyway), so pick clear ones.
 *
 * Only public repositories, read with GitHub's public API (60 requests/hour
 * without a token; GITHUB_TOKEN raises it). About 3 API requests per PR; file
 * contents come from raw.githubusercontent.com, which doesn't count.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { structuredPatch } from 'diff';
import { classifyFile } from '@docdrift/shared';
import { isSensitivePath } from '../src/modules/analysis/context.js';
import type { EvalCaseMeta, ExpectedDoc } from './dataset.js';

export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

export function parsePullRequestUrl(url: string): PullRequestRef {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\/?$/.exec(url.trim());
  if (!m) throw new Error(`Not a GitHub pull request URL: ${url}`);
  return { owner: m[1]!, repo: m[2]!, number: Number(m[3]) };
}

export interface GitHubReader {
  api<T>(path: string): Promise<T>;
  /** A file at a commit, or null if it doesn't exist there. */
  raw(owner: string, repo: string, sha: string, path: string): Promise<string | null>;
}

export class GitHubReadError extends Error {}

export function gitHubReader(
  opts: { token?: string; fetchImpl?: typeof fetch } = {},
): GitHubReader {
  const f = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'docdrift-eval-import',
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  return {
    async api<T>(path: string) {
      const res = await f(`https://api.github.com${path}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 403 || res.status === 429) {
        const reset = Number(res.headers.get('x-ratelimit-reset'));
        const when = reset ? ` (resets ${new Date(reset * 1000).toLocaleTimeString()})` : '';
        throw new GitHubReadError(
          `GitHub API limit reached${when}. Without a token the limit is 60 requests/hour; set GITHUB_TOKEN for more.`,
        );
      }
      if (!res.ok) throw new GitHubReadError(`GitHub API ${path} answered HTTP ${res.status}`);
      return (await res.json()) as T;
    },
    async raw(owner, repo, sha, path) {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`;
      const res = await f(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new GitHubReadError(`Could not download ${path} (HTTP ${res.status})`);
      return res.text();
    },
  };
}

// ------------------------------------------------------------------ labels from the developer's edit

/**
 * Words a document can state literally: flags (--log-level), hyphenated names
 * (cross-spawn), dotted or plain identifiers, and versions. A flag only counts
 * at the start of a word, so "best-effort" isn't read as the flag "-effort".
 */
const TOKEN =
  /(?<![\w-])--?[A-Za-z][\w-]*|[A-Za-z][\w$]*(?:-[A-Za-z][\w$]*)+|[A-Za-z_$][\w$.]*[\w$]|\d{2,}(?:\.\d+)*/g;

/** Links change for reasons unrelated to drift (badges, moved pages): poor checks. */
const URL_LIKE = /\.(com|org|net|io|dev|html?)$|^https?:/i;

function tokensOf(lines: string[]) {
  return new Set(lines.flatMap((l) => l.match(TOKEN) ?? []));
}

/** Flags, dotted or snake/camel identifiers, versions: things a document states literally. */
const CODE_LIKE = /^--?[A-Za-z]|[-_$.]|[a-z][A-Z]|\d/;

/**
 * How good a content check this word would make. Plain English words make
 * useless checks ("list", "every"), so a word must either look like code, or
 * be long and also appear in the code change.
 */
function specificity(t: string, codeTokens: Set<string>) {
  if (URL_LIKE.test(t)) return 0;
  const inCode = codeTokens.has(t);
  if (CODE_LIKE.test(t)) return 3 + (inCode ? 3 : 0) + (t.length > 6 ? 1 : 0);
  if (inCode && t.length >= 8) return 2;
  return 0;
}

/**
 * Picks words the developer added to (or removed from) a document that a
 * correct update should also add (or remove). Line-based: a word counts as
 * added if it's on an added line and nowhere in the old document.
 */
export function deriveContentChecks(
  before: string,
  after: string,
  codeDiff: { added: string[]; removed: string[] },
  max = { contain: 3, notContain: 2 },
): Pick<ExpectedDoc, 'mustContain' | 'mustNotContain'> {
  const beforeLines = new Set(before.split('\n'));
  const afterLines = new Set(after.split('\n'));
  const addedLines = after.split('\n').filter((l) => !beforeLines.has(l));
  const removedLines = before.split('\n').filter((l) => !afterLines.has(l));
  const code = tokensOf([...codeDiff.added, ...codeDiff.removed]);
  const rank = (ts: string[]) =>
    ts
      .filter((t) => t.length >= 3)
      .map((t) => ({ t, s: specificity(t, code) }))
      .filter((x) => x.s >= 2) // ordinary English words make weak checks
      .sort((a, b) => b.s - a.s || a.t.localeCompare(b.t))
      .map((x) => x.t);

  const mustContain = rank([...tokensOf(addedLines)].filter((t) => !before.includes(t))).slice(
    0,
    max.contain,
  );
  const mustNotContain = rank([...tokensOf(removedLines)].filter((t) => !after.includes(t))).slice(
    0,
    max.notContain,
  );
  return { mustContain, mustNotContain };
}

function diffLines(before: string | null, after: string | null) {
  const b = new Set((before ?? '').split('\n'));
  const a = new Set((after ?? '').split('\n'));
  return {
    added: (after ?? '').split('\n').filter((l) => !b.has(l)),
    removed: (before ?? '').split('\n').filter((l) => !a.has(l)),
  };
}

// ------------------------------------------------------------------ import

interface PullResponse {
  html_url: string;
  title: string;
  body: string | null;
  merged_at: string | null;
  base: { sha: string; repo: { full_name: string; license: { spdx_id: string } | null } };
  head: { sha: string };
}
interface CompareResponse {
  merge_base_commit: { sha: string };
  files: { filename: string; status: string; previous_filename?: string }[];
}
interface TreeResponse {
  tree: { path: string; type: string; size?: number }[];
  truncated: boolean;
}

const MAX_FILE_BYTES = 400_000;
/** Above this, a changed file is stored as its changed regions only (see trimToChanges). */
export const TRIM_ABOVE_BYTES = 12_000;
const TRIM_CONTEXT_LINES = 40;
const TRIM_MARKER = '… trimmed for the evaluation dataset …';

/**
 * Real pull requests touch source files of 100 kB and more, but DocDrift only
 * ever sees a file's *diff*. Storing whole files would bloat the repository,
 * so large ones are stored as their changed regions plus 40 lines of context.
 * The same marker line goes into both versions, so the diff is unchanged.
 */
export function trimToChanges(before: string, after: string, path: string) {
  const hunks = structuredPatch(path, path, before, after, '', '', {
    context: TRIM_CONTEXT_LINES,
  }).hunks;
  const pick = (sign: '-' | '+') =>
    hunks
      .map((h) =>
        h.lines
          .filter((l) => l.startsWith(' ') || l.startsWith(sign))
          .map((l) => l.slice(1))
          .join('\n'),
      )
      .join(`\n${TRIM_MARKER}\n`) + '\n';
  return { before: pick('-'), after: pick('+') };
}

/** Documents whose text a person reads; a script under docs/ makes a poor label. */
const PROSE_DOC = /\.(md|mdx|rst|txt|adoc|ya?ml|json)$/i;
const MAX_CHANGED_FILES = 60;
/**
 * Every documentation file in the repository is stored, not just the ones the
 * app would fetch: document selection is itself under test, so a case must
 * contain the documents a better retriever could find.
 */
const MAX_DOCS = 250;
const MAX_DOC_BYTES = 100_000;
const isChangelog = (p: string) => /(^|\/)(changelog|history|changes|news|release)/i.test(p);

export interface ImportResult {
  meta: EvalCaseMeta;
  written: string;
  warnings: string[];
}

export async function importPullRequest(
  gh: GitHubReader,
  ref: PullRequestRef,
  opts: { id: string; casesDir: string; now?: () => Date },
): Promise<ImportResult> {
  const { owner, repo, number } = ref;
  const warnings: string[] = [];
  const pr = await gh.api<PullResponse>(`/repos/${owner}/${repo}/pulls/${number}`);
  if (!pr.merged_at) throw new Error(`#${number} was not merged; only merged PRs are imported`);
  // The diff GitHub shows is against the merge base, not the base branch's tip.
  const cmp = await gh.api<CompareResponse>(
    `/repos/${owner}/${repo}/compare/${pr.base.sha}...${pr.head.sha}`,
  );
  const baseSha = cmp.merge_base_commit.sha;
  const headSha = pr.head.sha;
  if (cmp.files.length > MAX_CHANGED_FILES)
    throw new Error(`#${number} changes ${cmp.files.length} files; too large for a case`);

  const docChanges = cmp.files.filter((f) => classifyFile(f.filename) === 'documentation');
  const codeChanges = cmp.files.filter(
    (f) => classifyFile(f.filename) !== 'documentation' && !isSensitivePath(f.filename),
  );
  if (codeChanges.length === 0) throw new Error(`#${number} changes no code; nothing to analyse`);

  // ---- code: before and after
  const base = new Map<string, string>();
  const head = new Map<string, string>();
  const added: string[] = [];
  const trimmedFiles: string[] = [];
  const codeAdded: string[] = [];
  const codeRemoved: string[] = [];
  for (const f of codeChanges) {
    const oldPath = f.previous_filename ?? f.filename;
    const before = f.status === 'added' ? null : await gh.raw(owner, repo, baseSha, oldPath);
    const after = f.status === 'removed' ? null : await gh.raw(owner, repo, headSha, f.filename);
    const tooBig = [before, after].some(
      (t) => t && (t.length > MAX_FILE_BYTES || t.includes('\0')),
    );
    if (tooBig) {
      warnings.push(`skipped ${f.filename}: binary or larger than ${MAX_FILE_BYTES / 1000} kB`);
      continue;
    }
    let storedBefore = before;
    let storedAfter = after;
    if (
      before !== null &&
      after !== null &&
      Math.max(before.length, after.length) > TRIM_ABOVE_BYTES
    ) {
      const t = trimToChanges(before, after, f.filename);
      storedBefore = t.before;
      storedAfter = t.after;
      trimmedFiles.push(f.filename);
    }
    if (storedBefore !== null) base.set(oldPath, storedBefore);
    if (storedAfter !== null) head.set(f.filename, storedAfter);
    if (before === null && after !== null) added.push(f.filename);
    if (f.previous_filename && after !== null && before !== null) added.push(f.filename);
    const d = diffLines(before, after);
    codeAdded.push(...d.added);
    codeRemoved.push(...d.removed);
  }

  // ---- the repository as DocDrift would see it: code at head, docs as before the PR
  const tree = await gh.api<TreeResponse>(
    `/repos/${owner}/${repo}/git/trees/${headSha}?recursive=1`,
  );
  if (tree.truncated) warnings.push('GitHub truncated the file list (very large repository)');
  const docAddedByPr = new Set(
    docChanges.filter((f) => f.status === 'added').map((f) => f.filename),
  );
  const renamedDocs = new Map(
    docChanges.filter((f) => f.previous_filename).map((f) => [f.filename, f.previous_filename!]),
  );
  const docRemovedByPr = docChanges.filter((f) => f.status === 'removed').map((f) => f.filename);
  const paths = [
    ...new Set([
      ...tree.tree
        .filter((t) => t.type === 'blob')
        .map((t) => renamedDocs.get(t.path) ?? t.path)
        .filter((p) => !docAddedByPr.has(p)),
      ...docRemovedByPr,
    ]),
  ].sort();

  // Every documentation file, at its pre-PR version.
  const docPaths = paths
    .filter((p) => !isSensitivePath(p) && classifyFile(p) === 'documentation')
    .slice(0, MAX_DOCS);
  if (docPaths.length === MAX_DOCS)
    warnings.push(`more than ${MAX_DOCS} documents: the rest are not stored`);
  let skippedDocs = 0;
  for (const path of docPaths) {
    const text = await gh.raw(owner, repo, baseSha, path);
    if (text === null || text.includes('\0')) continue;
    if (text.length > MAX_DOC_BYTES) {
      skippedDocs++;
      continue;
    }
    head.set(path, text);
  }
  if (skippedDocs)
    warnings.push(`${skippedDocs} document(s) over ${MAX_DOC_BYTES / 1000} kB not stored`);

  // ---- labels from the developer's own documentation edit
  const expected: ExpectedDoc[] = [];
  const acceptable: string[] = [];
  for (const f of docChanges) {
    if (f.status === 'added') continue; // a new document isn't an update of a stale one
    const path = f.previous_filename ?? f.filename;
    // Changelogs, and "documents" that are really code (a script under docs/):
    // updating them is reasonable, but not what the content checks can measure.
    if (isChangelog(path) || !PROSE_DOC.test(path)) {
      acceptable.push(path);
      continue;
    }
    const before = await gh.raw(owner, repo, baseSha, path);
    const after = f.status === 'removed' ? '' : await gh.raw(owner, repo, headSha, f.filename);
    if (before === null || after === null) continue;
    expected.push({
      path,
      ...deriveContentChecks(before, after, { added: codeAdded, removed: codeRemoved }),
    });
    if (!head.has(path))
      warnings.push(
        `${path} needed updating but was not stored (too large, or removed): expect a miss`,
      );
  }

  const meta: EvalCaseMeta = {
    id: opts.id,
    title: pr.title,
    body: (pr.body ?? '').slice(0, 4000),
    group: expected.length ? 'drift' : 'no-drift',
    category: expected.length ? 'real: docs updated with code' : 'real: code-only change',
    expected,
    acceptable,
    added,
    trimmedFiles,
    notes: expected.length
      ? 'The PR author updated these documents in the same PR; the case removes those edits. Content checks are words the author added/removed. Review them before relying on the case.'
      : 'The PR author changed no documentation. Weaker label: the docs may have been stale already. Only keep clearly internal changes.',
    source: 'real',
    origin: {
      url: pr.html_url,
      repository: pr.base.repo.full_name,
      license: pr.base.repo.license?.spdx_id ?? null,
      baseSha,
      headSha,
      importedAt: (opts.now?.() ?? new Date()).toISOString(),
    },
  };

  const dir = join(opts.casesDir, opts.id);
  const write = async (path: string, text: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  };
  for (const [p, t] of head) await write(join(dir, 'head', p), t);
  for (const [p, t] of base) await write(join(dir, 'base', p), t);
  await write(join(dir, 'tree.txt'), paths.join('\n') + '\n');
  await write(join(dir, 'case.json'), JSON.stringify(meta, null, 2) + '\n');
  if (!meta.origin!.license)
    warnings.push('No licence detected: check the repository allows copying before committing');
  return { meta, written: dir, warnings };
}

// ------------------------------------------------------------------ finding candidates

interface PullListItem {
  number: number;
  title: string;
  merged_at: string | null;
  html_url: string;
}
interface PullFile {
  filename: string;
  status: string;
}

/** Recent merged PRs of a repository, with which kinds of files each one touched. */
export async function findCandidates(gh: GitHubReader, owner: string, repo: string, limit: number) {
  const pulls = await gh.api<PullListItem[]>(
    `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${Math.min(limit * 2, 100)}`,
  );
  const merged = pulls.filter((p) => p.merged_at).slice(0, limit);
  const out = [];
  for (const p of merged) {
    const files = await gh.api<PullFile[]>(
      `/repos/${owner}/${repo}/pulls/${p.number}/files?per_page=100`,
    );
    const kinds = files.map((f) => classifyFile(f.filename));
    out.push({
      url: p.html_url,
      title: p.title,
      files: files.length,
      code: kinds.filter((k) => k === 'source' || k === 'config').length,
      docs: files
        .filter((f) => classifyFile(f.filename) === 'documentation')
        .map((f) => f.filename),
      tests: kinds.filter((k) => k === 'test').length,
    });
  }
  return out;
}
