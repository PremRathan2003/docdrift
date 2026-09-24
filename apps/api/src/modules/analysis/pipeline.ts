/**
 * The analysis pipeline without storage: gather context → ask the model →
 * validate. The web app (analysis.service.ts) and the evaluation harness
 * (apps/api/eval) both call runPipeline, so the evaluation measures exactly
 * what users get, not a lookalike.
 *
 * Where the repository data comes from is abstracted as a RepoSource: GitHub
 * for real analyses, files on disk for evaluation cases.
 */
import {
  analysisOutputSchema,
  type AnalysisOutput,
  type InputManifest,
  type Recommendation,
} from '@docdrift/shared';
import { z } from 'zod';
import type { Logger } from '../../lib/logger.js';
import { AIProviderError, type AIProvider } from '../ai/provider.js';
import { classifyFile } from '@docdrift/shared';
import {
  extractKeywords,
  isSensitivePath,
  pickDocCandidates,
  rankDocs,
  redactSecrets,
  selectChangedFiles,
  type ChangedFile,
} from './context.js';
import { isHistoryDoc, queryTerms, rankByContent } from './retrieval.js';
import { buildUserPrompt, SYSTEM_PROMPT, type PromptDoc } from './prompts/v3.js';
import { packSections, replaceSection, splitIntoSections, type Section } from './sections.js';
import { parseModelOutput, validateSemantics } from './validate.js';

export { PROMPT_VERSION } from './prompts/v3.js';

export interface RepoSource {
  /** "owner/name", shown to the model. */
  fullName: string;
  changedFiles(): Promise<ChangedFile[]>;
  /** Every file path in the repository at the PR's head commit. */
  treePaths(): Promise<string[]>;
  /** A text file at the head commit, or null if missing/binary/too large. */
  textFile(path: string): Promise<string | null>;
  /**
   * Several files at once. Content ranking needs every document's text, so
   * implementations fetch in parallel and cache (see the GitHub source).
   */
  textFiles?(paths: string[]): Promise<Map<string, string>>;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  body: string | null;
  baseRef: string;
  headRef: string;
}

export interface PipelineConfig {
  /**
   * 'content' (default): rank every documentation file by how well its text
   * matches the identifiers the PR changed (BM25).
   * 'path-rules': the Phase 1 behaviour, kept so the evaluation can show the
   * difference.
   */
  retrieval?: 'content' | 'path-rules';
  timeoutMs: number;
  maxInputTokens: number;
  /** Defaults to 16 384: thinking models need room. */
  maxOutputTokens?: number;
  /**
   * How a long document is cut up before the matching parts are chosen, and how
   * much of one document may be sent. Overridable so the evaluation can sweep
   * these without a model in the loop (npm run eval:sections); production uses
   * the defaults below.
   */
  sectionSize?: { min: number; max: number };
  sectionBudget?: number;
  /** Test hook: replaces real waiting between retries. */
  sleep?: (ms: number) => Promise<void>;
}

export const MAX_ATTEMPTS = 3;
// Thinking models count their reasoning tokens against this limit, so leave generous room.
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const MAX_DOCS_FETCHED = 15; // path-rules mode only
/** Content ranking reads every documentation file, up to this many per repository. */
const MAX_DOCS_CONSIDERED = 250;
/** How many of the best-matching documents can go into one prompt. */
const MAX_DOCS_SENT = 12;
/** A document longer than this is shown as sections instead of in full. */
const MAX_CHARS_PER_DOC = 12_000;
/** Sizes for one section: small ones are merged, huge ones split. */
const SECTION_SIZE = { min: 400, max: 6_000 };
/** At most this much of one long document goes into the prompt. */
const MAX_CHARS_PER_SECTIONED_DOC = 9_000;
const CHARS_PER_TOKEN = 4; // rough rule of thumb for English text and code

const JSON_SCHEMA = z.toJSONSchema(analysisOutputSchema) as Record<string, unknown>;

/** An analysis that could not produce a result. Carries what was spent before failing. */
export class RunFailure extends Error {
  attempts = 0;
  inputTokens: number | null = null;
  outputTokens: number | null = null;
  /**
   * The context that was built before the failure, when there was one. A run
   * that fails at the model still retrieved documents, and saying otherwise
   * would understate retrieval in the evaluation and hide the prompt from the
   * user's run detail page.
   */
  context?: AnalysisContext;
  constructor(
    readonly code: string,
    message: string,
    spent?: { attempts: number; inputTokens: number | null; outputTokens: number | null },
  ) {
    super(message);
    if (spent) Object.assign(this, spent);
  }
}

// ---------------------------------------------------------------- context building

export async function buildContext(
  source: RepoSource,
  pr: PullRequestInfo,
  config: PipelineConfig,
) {
  const budget = config.maxInputTokens * CHARS_PER_TOKEN;
  const files = await source.changedFiles();
  const selection = selectChangedFiles(files, Math.floor(budget * 0.55));

  const paths = (await source.treePaths()).filter((p) => !isSensitivePath(p));
  const byContent = (config.retrieval ?? 'content') === 'content';

  const candidates = byContent
    ? paths
        .filter((p) => classifyFile(p) === 'documentation' && !isHistoryDoc(p))
        .slice(0, MAX_DOCS_CONSIDERED)
    : pickDocCandidates(
        paths,
        files.map((f) => f.filename),
        MAX_DOCS_FETCHED,
      );

  const fetched: { path: string; content: string }[] = [];
  if (source.textFiles) {
    for (const [path, content] of await source.textFiles(candidates))
      fetched.push({ path, content });
  } else {
    for (const path of candidates) {
      const content = await source.textFile(path);
      if (content !== null) fetched.push({ path, content });
    }
  }

  // Rank by what the documents say about what this PR changed.
  const ranked = byContent
    ? rankByContent(fetched, queryTerms(selection.included.map((f) => f.patch)))
        .filter((d) => d.score > 0)
        .slice(0, MAX_DOCS_SENT)
        .map((d) => ({ ...d, content: fetched.find((f) => f.path === d.path)!.content }))
    : rankDocs(fetched, extractKeywords(selection.included.map((f) => f.patch)));
  const docBudget = Math.floor(budget * 0.35);
  let used = 0;
  let secretsRedacted = selection.redactions;
  const terms = queryTerms(selection.included.map((f) => f.patch));
  const docs: ContextDoc[] = [];
  for (const d of ranked) {
    const { text, redactions } = redactSecrets(d.content);
    secretsRedacted += redactions;

    if (text.length <= MAX_CHARS_PER_DOC) {
      if (used + text.length > docBudget) continue;
      used += text.length;
      docs.push({ path: d.path, content: text, full: text, sections: null, matched: d.matched });
      continue;
    }

    // Too long to send whole: show the sections that match this pull request.
    const all = packSections(splitIntoSections(text), config.sectionSize ?? SECTION_SIZE);
    const best = rankByContent(
      all.map((s) => ({ path: String(s.index), content: s.content })),
      terms,
    )
      .filter((s) => s.score > 0)
      .map((s) => all[Number(s.path)]!);
    const chosen: Section[] = [];
    let size = 0;
    for (const s of best) {
      const perDoc = config.sectionBudget ?? MAX_CHARS_PER_SECTIONED_DOC;
      if (size + s.content.length > Math.min(perDoc, docBudget - used)) break;
      size += s.content.length;
      chosen.push(s);
    }
    if (chosen.length === 0) continue;
    used += size;
    // Sections go in document order, so the model reads them as it would the file.
    chosen.sort((a, b) => a.startLine - b.startLine);
    docs.push({
      path: d.path,
      content: chosen.map((s) => s.content).join('\n\n'),
      full: text,
      sections: { chosen, total: all.length, raw: splitIntoSections(text) },
      matched: d.matched,
    });
  }

  const promptDocs: PromptDoc[] = docs.map((d) =>
    d.sections
      ? {
          path: d.path,
          sections: d.sections.chosen.map((s) => ({
            heading: s.heading,
            breadcrumb: s.breadcrumb,
            content: s.content,
          })),
          totalSections: d.sections.total,
        }
      : { path: d.path, content: d.content },
  );
  const prompt = buildUserPrompt({
    repository: source.fullName,
    pullRequest: pr,
    files: selection.included,
    skippedFiles: selection.skipped,
    docs: promptDocs,
  });
  const manifest: InputManifest = {
    filesSent: selection.included.map((f) => ({
      filename: f.filename,
      kind: f.kind,
      truncated: f.truncated,
    })),
    filesSkipped: selection.skipped,
    docsSent: docs.map((d) => ({
      path: d.path,
      matchedKeywords: d.matched.slice(0, 15),
      /** "Truncated" now means "shown as selected sections", never cut mid-file. */
      truncated: d.sections !== null,
      sectionsSent: d.sections ? d.sections.chosen.length : undefined,
      sectionsTotal: d.sections ? d.sections.total : undefined,
    })),
    docsConsidered: fetched.length,
    secretsRedacted,
    promptChars: prompt.length + SYSTEM_PROMPT.length,
  };
  return {
    prompt,
    manifest,
    /** Exactly what the model saw, for detectors that don't use a model (the eval baseline). */
    included: selection.included,
    docs,
    /** Documents shown as sections rather than in full. */
    sectionedDocs: docs.filter((d) => d.sections !== null).map((d) => d.path),
    changedFiles: files.map((f) => f.filename),
  };
}

/**
 * Models sometimes echo the prompt's own labelling, e.g.
 * "### Ordered dictionaries — under ## Generic collection types". Compare
 * headings by their own text only.
 */
function normaliseHeading(heading: string): string {
  return heading.split(' — under ')[0]!.trim();
}

export interface ContextDoc {
  path: string;
  /** What the model was shown: the whole file, or the chosen sections joined. */
  content: string;
  /** The complete document, for splicing a section update back in. */
  full: string;
  sections: {
    /** The chunks that were shown, in document order. */
    chosen: Section[];
    total: number;
    /** Every heading-delimited section of the document, for locating the one the model names. */
    raw: Section[];
  } | null;
  matched: string[];
}

export type AnalysisContext = Awaited<ReturnType<typeof buildContext>>;

/**
 * Turns a section-scoped recommendation into a complete updated document, so
 * everything downstream (diff, review, patch) keeps working with whole files.
 * Returns null when the section can't be matched, which is a reason to drop
 * the recommendation rather than write a guess.
 */
export function spliceRecommendation(
  doc: ContextDoc,
  rec: { scope?: 'file' | 'section'; sectionHeading?: string; suggestedUpdate: string },
): { content: string } | { error: string } {
  const scope = rec.scope ?? 'file';
  // A section-scoped answer for a document shown in full is still usable: find
  // that section in the document and replace just it. Refusing would throw away
  // a correct answer over a formality.
  if (scope === 'section' && !doc.sections && rec.sectionHeading) {
    const wanted = normaliseHeading(rec.sectionHeading);
    const matches = splitIntoSections(doc.full).filter(
      (s) => normaliseHeading(s.heading) === wanted,
    );
    if (matches.length === 1) {
      const spliced = replaceSection(doc.full, matches[0]!, rec.suggestedUpdate);
      if (spliced !== null) return { content: spliced };
    }
    return {
      error: `section "${rec.sectionHeading}" is not a heading of this document (which was shown in full)`,
    };
  }
  if (scope === 'file') {
    if (doc.sections)
      return {
        error: 'the document was shown as sections, so a whole-file rewrite would drop the rest',
      };
    return { content: rec.suggestedUpdate };
  }
  if (!doc.sections) return { error: 'the whole document was shown, so name no section' };
  const heading = normaliseHeading(rec.sectionHeading ?? '');
  const shown = (s: Section) =>
    doc.sections!.chosen.some((c) => s.startLine >= c.startLine && s.endLine <= c.endLine);

  // The model may name the chunk it was shown, or a heading inside it (chunks
  // merge short sections). Both are fine; anything else is not.
  const candidates = [
    ...doc.sections.chosen.filter((s) => normaliseHeading(s.heading) === heading),
    ...doc.sections.raw.filter((s) => normaliseHeading(s.heading) === heading && shown(s)),
  ];
  const matches = candidates.filter(
    (s, i) => candidates.findIndex((o) => o.startLine === s.startLine) === i,
  );
  if (matches.length !== 1)
    return {
      error: matches.length
        ? `section "${heading}" appears more than once in what was shown`
        : `section "${heading}" was not one of the sections shown`,
    };
  const spliced = replaceSection(doc.full, matches[0]!, rec.suggestedUpdate);
  return spliced === null
    ? { error: 'the section no longer matches the document' }
    : { content: spliced };
}

// ---------------------------------------------------------------- one LLM call with retries

/**
 * What to add to the prompt after an unusable answer. It quotes our parser, never
 * the model's own text: echoing repository content back into the prompt would
 * hand a document the chance to write its own instructions.
 */
function repairNote(hint: string): string {
  return [
    '',
    '',
    `YOUR PREVIOUS ANSWER COULD NOT BE READ: ${hint}`,
    'Send the same analysis again as one strictly valid JSON object matching the response schema.',
    String.raw`Inside JSON strings escape every backslash as \\, every double quote as \", and every newline as \n.`,
    'Write nothing before or after the JSON object.',
  ].join('\n');
}

export async function callModel(
  ai: AIProvider,
  prompt: string,
  config: PipelineConfig,
  logger: Pick<Logger, 'warn'>,
) {
  const sleep = config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  const add = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);
  let lastProblem = '';

  let repair = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await ai.generateJson({
        system: SYSTEM_PROMPT,
        user: prompt + repair,
        jsonSchema: JSON_SCHEMA,
        maxOutputTokens: config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        timeoutMs: config.timeoutMs,
      });
      inputTokens = add(inputTokens, result.usage.inputTokens);
      outputTokens = add(outputTokens, result.usage.outputTokens);
      const parsed = parseModelOutput(result.text);
      if (parsed.ok) return { output: parsed.output, attempts: attempt, inputTokens, outputTokens };
      // A malformed answer is worth another try, but not an identical request:
      // the same prompt reproduced the same broken answer three times running on
      // documents full of backslashes and quotes. Saying what went wrong is what
      // makes the retry a different draw.
      repair = repairNote(parsed.hint);
      lastProblem = `${parsed.reason}: ${parsed.detail}, finishReason ${result.finishReason ?? 'none'}`;
      logger.warn({ attempt, problem: lastProblem }, 'Model output failed validation');
    } catch (err) {
      if (!(err instanceof AIProviderError)) throw err;
      if (!err.transient || attempt === MAX_ATTEMPTS) {
        throw new RunFailure(err.code, err.message, {
          attempts: attempt,
          inputTokens,
          outputTokens,
        });
      }
      lastProblem = err.message;
      const waitSeconds = Math.min(err.retryAfterSeconds ?? 2 ** attempt, 20);
      logger.warn({ attempt, code: err.code, waitSeconds }, 'AI call failed, retrying');
      await sleep(waitSeconds * 1000);
    }
  }
  throw new RunFailure(
    'AI_INVALID_OUTPUT',
    `The model did not return valid output after ${MAX_ATTEMPTS} attempts (${lastProblem})`,
    { attempts: MAX_ATTEMPTS, inputTokens, outputTokens },
  );
}

// ---------------------------------------------------------------- the whole pipeline

export type PipelineResult =
  | {
      /** Nothing worth asking the model about; no tokens were spent. */
      kind: 'skipped';
      summary: string;
      context: AnalysisContext;
    }
  | {
      kind: 'answered';
      output: AnalysisOutput;
      /** After semantic validation: what users actually see. */
      recommendations: Recommendation[];
      warnings: string[];
      attempts: number;
      inputTokens: number | null;
      outputTokens: number | null;
      context: AnalysisContext;
    };

/**
 * Runs one analysis. Throws RunFailure for AI problems; errors from the
 * RepoSource (e.g. GitHubError) are passed through for the caller to map.
 */
export async function runPipeline(deps: {
  ai: AIProvider;
  source: RepoSource;
  pullRequest: PullRequestInfo;
  config: PipelineConfig;
  logger: Pick<Logger, 'warn'>;
}): Promise<PipelineResult> {
  const context = await buildContext(deps.source, deps.pullRequest, deps.config);

  // Nothing to ask the model? Don't spend tokens on it.
  if (context.included.length === 0 || context.docs.length === 0) {
    return {
      kind: 'skipped',
      summary:
        context.included.length === 0
          ? 'No reviewable code changes (only generated, binary or sensitive files), so no analysis was needed.'
          : 'No documentation files were found in this repository, so there is nothing to check.',
      context,
    };
  }

  const result = await callModel(deps.ai, context.prompt, deps.config, deps.logger).catch(
    (err: unknown) => {
      if (err instanceof RunFailure) err.context = context;
      throw err;
    },
  );
  const { recommendations, warnings } = validateSemantics(result.output, {
    changedFiles: context.changedFiles,
    docs: context.docs,
  });
  return { kind: 'answered', ...result, recommendations, warnings, context };
}
