import { classifyFile, type FileKind } from '@docdrift/shared';

/**
 * Pure functions that decide WHAT is sent to the LLM. Kept free of I/O so each
 * rule is unit-tested. Principles:
 *  - send the least code that answers the question (privacy + cost),
 *  - never send secrets or files that typically contain them,
 *  - record every skipped file and why, so the result is explainable.
 */

// ------------------------------------------------------------------ secrets

const SENSITIVE_PATH =
  /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|id_rsa.*|id_ed25519.*|\.npmrc|\.pypirc|credentials(\.json)?|secrets?\.(json|ya?ml|toml))$/i;

/** Files we never send, even if the user's repository contains them. `.env.example` is fine. */
export function isSensitivePath(path: string): boolean {
  if (/(^|\/)\.env\.(example|sample|template)$/i.test(path)) return false;
  return SENSITIVE_PATH.test(path);
}

const SECRET_PATTERNS: [string, RegExp][] = [
  [
    'private key',
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  ],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ['OpenAI/Anthropic key', /\bsk-(ant-)?[A-Za-z0-9_-]{20,}\b/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ['connection string password', /\b([a-z]+:\/\/[^:\s/]+:)([^@\s]{4,})(@)/gi],
];
// key = "value" / key: value, where the key name suggests a secret
const ASSIGNMENT =
  /\b([A-Za-z0-9_]*(?:secret|password|passwd|token|api[_-]?key|private[_-]?key)[A-Za-z0-9_]*)(\s*[:=]\s*)(['"]?)([^'"\s,;]{8,})\3/gi;

/**
 * Best-effort secret redaction. Regexes can't catch everything, which is why
 * the README tells users to only connect repositories they may share with the
 * AI provider. Returns the redacted text and how many values were replaced.
 */
export function redactSecrets(text: string): { text: string; redactions: number } {
  let redactions = 0;
  let out = text;
  for (const [, pattern] of SECRET_PATTERNS) {
    out = out.replace(pattern, (...m: string[]) => {
      redactions++;
      // Keep the "scheme://user:" and "@" of connection strings for readability.
      return m[3] === '@' ? `${m[1]}[REDACTED]@` : '[REDACTED]';
    });
  }
  out = out.replace(ASSIGNMENT, (_m, key: string, sep: string, quote: string, value: string) => {
    if (value === '[REDACTED]' || /^process\.env|^env\(|^\$\{/.test(value))
      return `${key}${sep}${quote}${value}${quote}`;
    redactions++;
    return `${key}${sep}${quote}[REDACTED]${quote}`;
  });
  return { text: out, redactions };
}

// ------------------------------------------------------------------ changed files

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface IncludedFile {
  filename: string;
  kind: FileKind;
  status: string;
  patch: string;
  truncated: boolean;
}

export interface SkippedFile {
  filename: string;
  reason: 'sensitive' | 'generated' | 'binary' | 'no_patch' | 'budget';
}

/** Order in which files get the budget: behaviour first, docs last (docs are also sent separately). */
const PRIORITY: FileKind[] = ['source', 'config', 'documentation', 'test', 'other'];
export const MAX_CHARS_PER_FILE = 8_000;

export function selectChangedFiles(files: ChangedFile[], budgetChars: number) {
  const included: IncludedFile[] = [];
  const skipped: SkippedFile[] = [];
  let used = 0;
  let redactions = 0;

  const candidates: (ChangedFile & { kind: FileKind })[] = [];
  for (const f of files) {
    const kind = classifyFile(f.filename);
    if (isSensitivePath(f.filename)) skipped.push({ filename: f.filename, reason: 'sensitive' });
    else if (kind === 'generated') skipped.push({ filename: f.filename, reason: 'generated' });
    else if (kind === 'binary') skipped.push({ filename: f.filename, reason: 'binary' });
    else if (!f.patch) skipped.push({ filename: f.filename, reason: 'no_patch' });
    else candidates.push({ ...f, kind });
  }
  candidates.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));

  for (const f of candidates) {
    const redacted = redactSecrets(f.patch!);
    redactions += redacted.redactions;
    const truncated = redacted.text.length > MAX_CHARS_PER_FILE;
    const patch = truncated ? redacted.text.slice(0, MAX_CHARS_PER_FILE) : redacted.text;
    if (used + patch.length > budgetChars) {
      skipped.push({ filename: f.filename, reason: 'budget' });
      continue;
    }
    used += patch.length;
    included.push({ filename: f.filename, kind: f.kind, status: f.status, patch, truncated });
  }
  return { included, skipped, usedChars: used, redactions };
}

// ------------------------------------------------------------------ documentation candidates

const DOC_CANDIDATE =
  /(^|\/)(readme|contributing|changelog|api|usage|configuration|config|setup|install(ation)?)[^/]*\.(md|mdx|rst|txt|adoc)$/i;
const OPENAPI = /(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$/i;

/**
 * Which repository files might document the changed code. Phase 1 uses path
 * rules; Phase 2 replaces the ranking with full-text/vector search.
 */
export function pickDocCandidates(
  treePaths: string[],
  changedPaths: string[],
  limit = 15,
): string[] {
  const changedDirs = new Set(changedPaths.map((p) => p.split('/').slice(0, -1).join('/')));
  const scored = treePaths
    .filter(
      (p) =>
        classifyFile(p) === 'documentation' && !/(^|\/)(license|authors|code_of_conduct)/i.test(p),
    )
    .map((p) => {
      const dir = p.split('/').slice(0, -1).join('/');
      let score = 0;
      if (/^readme\.[a-z]+$/i.test(p)) score += 100; // root README
      if (p.toLowerCase().startsWith('docs/')) score += 30;
      if (OPENAPI.test(p)) score += 40;
      if (DOC_CANDIDATE.test(p)) score += 20;
      if (changedDirs.has(dir)) score += 25; // docs next to the changed code
      if (/changelog/i.test(p)) score -= 50; // changelogs describe history, rarely "drift"
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || a.p.localeCompare(b.p));
  return scored.slice(0, limit).map((s) => s.p);
}

const STOPWORDS = new Set(
  'the and for with this that from const let var function return true false null undefined import export require module new class async await else case break default this self string number boolean object void type interface public private static'.split(
    ' ',
  ),
);

/** Identifiers from added/removed lines — the words most likely to appear in stale docs. */
export function extractKeywords(patches: string[], max = 60): string[] {
  const counts = new Map<string, number>();
  for (const patch of patches) {
    for (const line of patch.split('\n')) {
      if (!/^[+-]/.test(line) || /^(\+\+\+|---)/.test(line)) continue;
      for (const word of line.slice(1).match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? []) {
        const w = word.toLowerCase();
        if (!STOPWORDS.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([w]) => w);
}

/** Scores docs by how many distinct keywords they mention (simple keyword retrieval). */
export function rankDocs<T extends { path: string; content: string }>(
  docs: T[],
  keywords: string[],
) {
  return docs
    .map((d) => {
      const text = d.content.toLowerCase();
      const hits = keywords.filter((k) => new RegExp(`\\b${k}\\b`).test(text));
      return { ...d, score: hits.length, matched: hits };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}
