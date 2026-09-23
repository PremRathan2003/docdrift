/**
 * Evaluation cases on disk. Each case is a folder:
 *
 *   case.json   metadata and the expected answer (the "label")
 *   head/       the repository at the pull request's head commit
 *   base/       the files this PR changes, as they were before it
 *   tree.txt    optional: every path in the repository (real cases), so document
 *               selection runs over the whole repository as it would on GitHub
 *
 * The diff is computed from base/ and head/, in the same format GitHub
 * returns, so cases are easy to write and the diffs are always valid.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { structuredPatch } from 'diff';
import { z } from 'zod';
import type { ChangedFile } from '../src/modules/analysis/context.js';
import type { RepoSource } from '../src/modules/analysis/pipeline.js';

const expectedDocSchema = z.object({
  path: z.string().min(1),
  /** The suggested update must contain each of these (e.g. the new name). */
  mustContain: z.array(z.string().min(1)).default([]),
  /** …and none of these (e.g. the stale value). */
  mustNotContain: z.array(z.string().min(1)).default([]),
});

export const caseSchema = z.object({
  id: z.string().regex(/^\d{3}-[a-z0-9-]+$/),
  title: z.string().min(1),
  body: z.string(),
  /** drift: docs must change · no-drift: nothing should be flagged · tricky: edge cases */
  group: z.enum(['drift', 'no-drift', 'tricky']),
  category: z.string().min(1),
  /** Documents that should be flagged. Empty = the correct answer is "nothing to update". */
  expected: z.array(expectedDocSchema),
  /** Documents where flagging or not flagging are both reasonable; never counted either way. */
  acceptable: z.array(z.string()).default([]),
  /** Files that exist in head/ but not at the base commit. */
  added: z.array(z.string()).default([]),
  /** Large changed files stored as their changed regions only (real cases). */
  trimmedFiles: z.array(z.string()).default([]),
  /** Why the label is what it is. */
  notes: z.string().min(1),
  /** synthetic = written for this dataset; real = taken from a public pull request. */
  source: z.enum(['synthetic', 'real']),
  /** Where a real case came from (npm run eval:import). */
  origin: z
    .object({
      url: z.string().url(),
      repository: z.string(),
      license: z.string().nullable(),
      baseSha: z.string(),
      headSha: z.string(),
      importedAt: z.string(),
    })
    .optional(),
});

export type EvalCaseMeta = z.infer<typeof caseSchema>;
export type ExpectedDoc = z.infer<typeof expectedDocSchema>;

export interface EvalCase extends EvalCaseMeta {
  /** Repository at head: path → content. */
  head: Map<string, string>;
  /** Changed files at base: path → content. */
  base: Map<string, string>;
  changedFiles: ChangedFile[];
  /** Every repository path (tree.txt); defaults to the files in head/. */
  tree: string[] | null;
}

async function readTree(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const exists = await stat(dir).then(
    (s) => s.isDirectory(),
    () => false,
  );
  if (!exists) return files;
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    files.set(relative(dir, full).split('\\').join('/'), await readFile(full, 'utf8'));
  }
  return files;
}

/** One file's diff as GitHub's `patch` field: hunks only, no ---/+++ headers. */
export function githubPatch(path: string, before: string, after: string): string {
  const patch = structuredPatch(path, path, before, after, '', '', { context: 3 });
  // git writes an empty range as "start before it" (e.g. -0,0 for a new file).
  const range = (start: number, lines: number) => `${lines === 0 ? start - 1 : start},${lines}`;
  return patch.hunks
    .map((h) =>
      [
        `@@ -${range(h.oldStart, h.oldLines)} +${range(h.newStart, h.newLines)} @@`,
        ...h.lines,
      ].join('\n'),
    )
    .join('\n');
}

export function changedFilesOf(
  head: Map<string, string>,
  base: Map<string, string>,
  added: string[],
): ChangedFile[] {
  const paths = [...new Set([...base.keys(), ...added])].sort();
  return paths.map((filename) => {
    const before = base.get(filename) ?? '';
    const after = head.get(filename) ?? '';
    const status = !base.has(filename) ? 'added' : !head.has(filename) ? 'removed' : 'modified';
    const patch = githubPatch(filename, before, after);
    const lines = patch.split('\n');
    return {
      filename,
      status,
      additions: lines.filter((l) => l.startsWith('+')).length,
      deletions: lines.filter((l) => l.startsWith('-')).length,
      patch: patch || null,
    };
  });
}

/** Problems that would make a case meaningless; the dataset test fails on any of them. */
export function problemsWith(c: EvalCase): string[] {
  const problems: string[] = [];
  for (const [path, content] of c.base) {
    if (c.head.get(path) === content) problems.push(`${path}: identical in base/ and head/`);
  }
  for (const path of c.added) {
    if (!c.head.has(path)) problems.push(`${path}: listed in "added" but missing from head/`);
    if (c.base.has(path)) problems.push(`${path}: listed in "added" but present in base/`);
  }
  if (c.changedFiles.length === 0) problems.push('the PR changes nothing');
  for (const e of c.expected) {
    const doc = c.head.get(e.path);
    if (doc === undefined) {
      // Real cases store only the documents DocDrift would fetch, so a missing
      // expected document is a genuine retrieval miss, not a broken case.
      if (c.source === 'real' && c.tree?.includes(e.path)) continue;
      problems.push(`${e.path}: expected document missing from head/`);
      continue;
    }
    // Otherwise the content checks would pass or fail for free.
    for (const s of e.mustContain)
      if (doc.includes(s)) problems.push(`${e.path}: already contains "${s}"`);
    for (const s of e.mustNotContain)
      if (!doc.includes(s)) problems.push(`${e.path}: never contained "${s}"`);
    if (c.acceptable.includes(e.path)) problems.push(`${e.path}: both expected and acceptable`);
  }
  if (c.group === 'drift' && c.expected.length === 0) problems.push('drift case expects nothing');
  if (c.group === 'no-drift' && c.expected.length > 0) problems.push('no-drift case expects docs');
  return problems;
}

export async function loadCase(dir: string): Promise<EvalCase> {
  const meta = caseSchema.parse(JSON.parse(await readFile(join(dir, 'case.json'), 'utf8')));
  const head = await readTree(join(dir, 'head'));
  const base = await readTree(join(dir, 'base'));
  const tree = await readFile(join(dir, 'tree.txt'), 'utf8').then(
    (t) => t.split('\n').filter(Boolean),
    () => null,
  );
  return { ...meta, head, base, tree, changedFiles: changedFilesOf(head, base, meta.added) };
}

/** All cases in a folder, in id order. `only` keeps ids starting with any of the prefixes. */
export async function loadCases(root: string, only: string[] = []): Promise<EvalCase[]> {
  const dirs = (await readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => only.length === 0 || only.some((p) => name.startsWith(p)))
    .sort();
  return Promise.all(dirs.map((d) => loadCase(join(root, d))));
}

/** The pipeline's view of a case, read from memory instead of GitHub. */
export function caseSource(c: EvalCase): RepoSource {
  return {
    fullName: `eval/${c.id}`,
    changedFiles: async () => c.changedFiles,
    treePaths: async () => c.tree ?? [...c.head.keys()].sort(),
    textFile: async (path) => c.head.get(path) ?? null,
  };
}

/** A stable fingerprint of the dataset, so reports say exactly which version they measured. */
export async function datasetHash(cases: EvalCase[]): Promise<string> {
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256');
  for (const c of cases) {
    // The diff is derived from head and base, so it isn't hashed separately.
    const { head, base } = c;
    hash.update(JSON.stringify(caseSchema.parse(c)));
    if (c.tree) hash.update(c.tree.join('\n'));
    for (const m of [head, base])
      for (const [k, v] of [...m.entries()].sort()) hash.update(`${k}\0${v}\0`);
  }
  return hash.digest('hex').slice(0, 12);
}
