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
import { buildUserPrompt, SYSTEM_PROMPT } from './prompts/v2.js';
import { parseModelOutput, validateSemantics } from './validate.js';

export { PROMPT_VERSION } from './prompts/v2.js';

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
const MAX_CHARS_PER_DOC = 12_000;
const CHARS_PER_TOKEN = 4; // rough rule of thumb for English text and code

const JSON_SCHEMA = z.toJSONSchema(analysisOutputSchema) as Record<string, unknown>;

/** An analysis that could not produce a result. Carries what was spent before failing. */
export class RunFailure extends Error {
  attempts = 0;
  inputTokens: number | null = null;
  outputTokens: number | null = null;
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
  const docs: { path: string; content: string; truncated: boolean; matched: string[] }[] = [];
  for (const d of ranked) {
    const { text, redactions } = redactSecrets(d.content);
    secretsRedacted += redactions;
    const truncated = text.length > MAX_CHARS_PER_DOC;
    const content = truncated ? text.slice(0, MAX_CHARS_PER_DOC) : text;
    if (used + content.length > docBudget) continue;
    used += content.length;
    docs.push({ path: d.path, content, truncated, matched: d.matched });
  }

  const prompt = buildUserPrompt({
    repository: source.fullName,
    pullRequest: pr,
    files: selection.included,
    skippedFiles: selection.skipped,
    docs,
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
      truncated: d.truncated,
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
    truncatedDocs: docs.filter((d) => d.truncated).map((d) => d.path),
    changedFiles: files.map((f) => f.filename),
  };
}

export type AnalysisContext = Awaited<ReturnType<typeof buildContext>>;

// ---------------------------------------------------------------- one LLM call with retries

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

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await ai.generateJson({
        system: SYSTEM_PROMPT,
        user: prompt,
        jsonSchema: JSON_SCHEMA,
        maxOutputTokens: config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        timeoutMs: config.timeoutMs,
      });
      inputTokens = add(inputTokens, result.usage.inputTokens);
      outputTokens = add(outputTokens, result.usage.outputTokens);
      const parsed = parseModelOutput(result.text);
      if (parsed.ok) return { output: parsed.output, attempts: attempt, inputTokens, outputTokens };
      // A malformed answer is worth one more try; the same prompt often succeeds.
      lastProblem = `${parsed.reason}: ${parsed.detail}`;
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

  const result = await callModel(deps.ai, context.prompt, deps.config, deps.logger);
  const { recommendations, warnings } = validateSemantics(result.output, {
    changedFiles: context.changedFiles,
    candidateDocs: context.docs.map((d) => d.path),
    truncatedDocs: context.truncatedDocs,
  });
  return { kind: 'answered', ...result, recommendations, warnings, context };
}
