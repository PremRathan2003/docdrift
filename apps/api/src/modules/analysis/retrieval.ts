/**
 * Which documents get shown to the model.
 *
 * Phase 1 chose them by filename (prefer `docs/`, prefer names like "api"),
 * breaking ties alphabetically. The real pull-request cases in `eval/cases`
 * showed why that fails: in pydantic and execa the documents that actually
 * needed updating were never fetched, so recall could not exceed 27% however
 * good the model was.
 *
 * This module ranks documents by their CONTENT against the identifiers the
 * pull request changed, using BM25 — the standard bag-of-words ranking behind
 * search engines. It is plain TypeScript rather than PostgreSQL's full-text
 * search so that the evaluation measures exactly the code the app runs, and
 * because identifiers need their own tokenizing: `killDescendants` has to
 * match both `killDescendants` and the words "kill descendants".
 */

/**
 * Filler and language keywords only. Words like "done", "type", "value" or
 * "get" stay in: in documentation they are as often field and option names as
 * they are filler, and dropping them lost real matches.
 */
const STOPWORDS = new Set(
  `a an the and or but if of in on at by to for with from into not is be as
   this that these those there here it its they them their you your we our
   are was were has have had can will would should could may might must
   use used using when where which while what how all any each more most other than then
   const let var function return true false null undefined import export require module
   new class async await else case break default self void public private static`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Words to match on. An identifier also yields its parts, so `killDescendants`
 * matches prose about "descendants" and `--log-level` matches "log level".
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.match(/[A-Za-z_$][\w$]*(?:[-.][A-Za-z_$][\w$]*)*|\d+(?:\.\d+)+/g) ?? []) {
    const token = raw.toLowerCase();
    if (token.length >= 2 && !STOPWORDS.has(token)) out.push(token);
    // camelCase / snake_case / dotted / hyphenated parts
    const parts = raw
      .split(/[-._$]|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
      .map((p) => p.toLowerCase())
      .filter((p) => p.length >= 3 && p !== token && !STOPWORDS.has(p));
    out.push(...parts);
  }
  return out;
}

/**
 * The search query: identifiers from the diff's added and removed lines.
 * Removed ones matter most — a document mentioning something the pull request
 * deleted is the clearest kind of drift — and each term is weighted by how
 * often it changed.
 */
export function queryTerms(patches: string[], max = 80): Map<string, number> {
  const weights = new Map<string, number>();
  for (const patch of patches) {
    for (const line of patch.split('\n')) {
      const removed = line.startsWith('-') && !line.startsWith('---');
      const added = line.startsWith('+') && !line.startsWith('+++');
      if (!removed && !added) continue;
      const weight = removed ? 2 : 1;
      for (const term of tokenize(line.slice(1))) {
        weights.set(term, (weights.get(term) ?? 0) + weight);
      }
    }
  }
  return new Map(
    [...weights.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, max)
      .map(([t, w]) => [t, Math.min(w, 5)]),
  );
}

export interface ScoredDoc {
  path: string;
  score: number;
  /** Query terms this document mentions, most frequent first (shown in the UI). */
  matched: string[];
}

const K1 = 1.2; // BM25: how quickly repeated words stop adding score
const B = 0.6; // BM25: how much a document's length is penalised
/**
 * A word in more than this share of the repository's documents says nothing
 * about which document to pick ("click" in click's docs, "command" in a CLI's).
 */
const MAX_DOC_FREQUENCY = 0.5;
/** …but with only a handful of documents, "common" means nothing, so don't filter. */
const MIN_DOCS_FOR_FREQUENCY_FILTER = 10;

/**
 * Documents that record history or process rather than current behaviour. They
 * mention every identifier ever changed, so they outrank real documentation on
 * word matching, and updating them isn't what DocDrift is for.
 */
export function isHistoryDoc(path: string): boolean {
  return /(^|\/)(changelog|changes|history|news|releases?|migration|upgrade[_-]?guide|contributing|code_of_conduct|security|license)/i.test(
    path,
  );
}

/**
 * BM25 over the candidate documents, plus a small bonus for documents whose
 * path suggests they describe behaviour (a README or an `docs/api.md`), which
 * breaks ties sensibly when the text says little.
 */
export function rankByContent(
  docs: { path: string; content: string }[],
  terms: Map<string, number>,
): ScoredDoc[] {
  const tokenized = docs.map((d) => {
    const counts = new Map<string, number>();
    for (const t of tokenize(d.content)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return {
      path: d.path,
      counts,
      length: Math.max(
        1,
        [...counts.values()].reduce((a, b) => a + b, 0),
      ),
    };
  });
  const avgLength = tokenized.reduce((s, d) => s + d.length, 0) / Math.max(1, tokenized.length);
  const docsWith = new Map<string, number>();
  for (const term of terms.keys()) {
    docsWith.set(term, tokenized.filter((d) => d.counts.has(term)).length);
  }
  // Keep only words that actually distinguish documents from each other.
  const useful =
    tokenized.length < MIN_DOCS_FOR_FREQUENCY_FILTER
      ? terms
      : new Map(
          [...terms].filter(
            ([term]) =>
              (docsWith.get(term) ?? 0) <= Math.max(1, tokenized.length * MAX_DOC_FREQUENCY),
          ),
        );

  return tokenized
    .map((d) => {
      let score = 0;
      const matched: [string, number][] = [];
      for (const [term, weight] of useful) {
        const tf = d.counts.get(term) ?? 0;
        if (tf === 0) continue;
        const n = docsWith.get(term) ?? 0;
        // Terms in almost every document (e.g. the project's own name) say little.
        const idf = Math.log(1 + (tokenized.length - n + 0.5) / (n + 0.5));
        score +=
          weight * idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.length) / avgLength)));
        matched.push([term, tf]);
      }
      return {
        path: d.path,
        score: score * pathPrior(d.path),
        matched: matched.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t),
      };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

/** Small multiplier, never a substitute for content: at most a 25% nudge. */
export function pathPrior(path: string): number {
  const p = path.toLowerCase();
  let prior = 1;
  if (/^readme\.[a-z]+$/.test(p)) prior += 0.15;
  if (
    /(^|\/)(api|reference|usage|configuration|config|options)[^/]*\.(md|mdx|rst|txt|adoc)$/.test(p)
  )
    prior += 0.1;
  if (/(^|\/)(changelog|history|migration|upgrade|contributing|code_of_conduct)/.test(p))
    prior -= 0.25; // history and process docs describe the past, not current behaviour
  return prior;
}
