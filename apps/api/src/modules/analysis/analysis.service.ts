import {
  ANALYSIS_OUTPUT_SCHEMA_VERSION,
  analysisOutputSchema,
  type InputManifest,
} from '@docdrift/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { Db } from '../../lib/prisma.js';
import { AIProviderError, type AIProvider } from '../ai/provider.js';
import { GitHubError } from '../github/github-client.js';
import type { GitHubService } from '../github/github.service.js';
import {
  extractKeywords,
  isSensitivePath,
  pickDocCandidates,
  rankDocs,
  redactSecrets,
  selectChangedFiles,
} from './context.js';
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from './prompts/v2.js';
import { parseModelOutput, validateSemantics } from './validate.js';

export interface AnalysisConfig {
  timeoutMs: number;
  maxInputTokens: number;
  inputUsdPerMTok?: number;
  outputUsdPerMTok?: number;
  /** Test hook: replaces real waiting between retries. */
  sleep?: (ms: number) => Promise<void>;
}

const MAX_ATTEMPTS = 3;
// Thinking models count their reasoning tokens against this limit, so leave generous room.
const MAX_OUTPUT_TOKENS = 16_384;
const MAX_DOCS_FETCHED = 15;
const MAX_CHARS_PER_DOC = 12_000;
const CHARS_PER_TOKEN = 4; // rough rule of thumb for English text and code

const JSON_SCHEMA = z.toJSONSchema(analysisOutputSchema) as Record<string, unknown>;

class RunFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type RepoRef = { owner: string; name: string; fullName: string; installationId: bigint };

export function createAnalysisService(deps: {
  db: Db;
  github: GitHubService | null;
  ai: AIProvider | null;
  logger: Logger;
  config: AnalysisConfig;
}) {
  const { db, github, ai, logger, config } = deps;
  const sleep = config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  // ---------------------------------------------------------------- a tiny in-process queue
  // Analyses take 10–60 s, so the HTTP request returns 202 immediately and the
  // work runs in the background. Two at a time keeps us inside free-tier limits.
  // If this ever needs to survive restarts or scale out, pg-boss (a PostgreSQL
  // queue) can replace it without changing the API.
  const CONCURRENCY = 2;
  const queue: string[] = [];
  let active = 0;
  const idleWaiters: (() => void)[] = [];

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const runId = queue.shift()!;
      active++;
      execute(runId)
        .catch((err) => logger.error({ err, runId }, 'Analysis crashed'))
        .finally(() => {
          active--;
          pump();
          if (active === 0 && queue.length === 0) idleWaiters.splice(0).forEach((f) => f());
        });
    }
  }

  // ---------------------------------------------------------------- context building
  async function buildContext(
    pr: {
      number: number;
      title: string;
      body: string | null;
      baseRef: string;
      headRef: string;
      headSha: string;
    },
    repo: RepoRef,
  ) {
    const budget = config.maxInputTokens * CHARS_PER_TOKEN;
    const files = await github!.pullRequestFiles(repo, pr.number);
    const selection = selectChangedFiles(files, Math.floor(budget * 0.55));

    const { paths } = await github!.treePaths(repo, pr.headSha);
    const candidates = pickDocCandidates(
      paths.map((p) => p.path).filter((p) => !isSensitivePath(p)),
      files.map((f) => f.filename),
      MAX_DOCS_FETCHED,
    );
    const fetched: { path: string; content: string }[] = [];
    for (const path of candidates) {
      const content = await github!.textFile(repo, path, pr.headSha);
      if (content !== null) fetched.push({ path, content });
    }

    const keywords = extractKeywords(selection.included.map((f) => f.patch));
    const ranked = rankDocs(fetched, keywords);
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
      repository: repo.fullName,
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
      truncatedDocs: docs.filter((d) => d.truncated).map((d) => d.path),
      changedFiles: files.map((f) => f.filename),
      docPaths: docs.map((d) => d.path),
      included: selection.included.length,
    };
  }

  // ---------------------------------------------------------------- one LLM call with retries
  async function callModel(prompt: string) {
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    const add = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);
    let lastProblem = '';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await ai!.generateJson({
          system: SYSTEM_PROMPT,
          user: prompt,
          jsonSchema: JSON_SCHEMA,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          timeoutMs: config.timeoutMs,
        });
        inputTokens = add(inputTokens, result.usage.inputTokens);
        outputTokens = add(outputTokens, result.usage.outputTokens);
        const parsed = parseModelOutput(result.text);
        if (parsed.ok)
          return { output: parsed.output, attempts: attempt, inputTokens, outputTokens };
        // A malformed answer is worth one more try; the same prompt often succeeds.
        lastProblem = `${parsed.reason}: ${parsed.detail}`;
        logger.warn({ attempt, problem: lastProblem }, 'Model output failed validation');
      } catch (err) {
        if (!(err instanceof AIProviderError)) throw err;
        if (!err.transient || attempt === MAX_ATTEMPTS) {
          throw Object.assign(new RunFailure(err.code, err.message), {
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
    throw Object.assign(
      new RunFailure(
        'AI_INVALID_OUTPUT',
        `The model did not return valid output after ${MAX_ATTEMPTS} attempts (${lastProblem})`,
      ),
      { attempts: MAX_ATTEMPTS, inputTokens, outputTokens },
    );
  }

  function costOf(inputTokens: number | null, outputTokens: number | null) {
    if (config.inputUsdPerMTok === undefined || config.outputUsdPerMTok === undefined) return null;
    if (inputTokens === null || outputTokens === null) return null;
    return new Prisma.Decimal(
      (inputTokens * config.inputUsdPerMTok + outputTokens * config.outputUsdPerMTok) / 1_000_000,
    );
  }

  // ---------------------------------------------------------------- the pipeline
  async function execute(runId: string) {
    const run = await db.analysisRun.findUnique({
      where: { id: runId },
      include: { pullRequest: { include: { repository: { include: { installation: true } } } } },
    });
    if (!run || run.status !== 'QUEUED') return;
    const pr = run.pullRequest;
    const repo: RepoRef = {
      ...pr.repository,
      installationId: pr.repository.installation.installationId,
    };
    const started = Date.now();
    await db.analysisRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    let manifest: InputManifest | null = null;
    try {
      if (!github || !ai)
        throw new RunFailure('NOT_CONFIGURED', 'GitHub or the AI provider is not configured');
      const ctx = await buildContext({ ...pr, headSha: run.headSha }, repo);
      manifest = ctx.manifest;

      // Nothing to ask the model? Don't spend tokens on it.
      if (ctx.included === 0 || ctx.docPaths.length === 0) {
        await db.analysisRun.update({
          where: { id: runId },
          data: {
            status: 'SUCCEEDED',
            summary:
              ctx.included === 0
                ? 'No reviewable code changes (only generated, binary or sensitive files), so no analysis was needed.'
                : 'No documentation files were found in this repository, so there is nothing to check.',
            rawOutput: Prisma.JsonNull,
            warnings: [],
            inputManifest: manifest,
            latencyMs: Date.now() - started,
            finishedAt: new Date(),
          },
        });
        return;
      }

      const result = await callModel(ctx.prompt);
      const { recommendations, warnings } = validateSemantics(result.output, {
        changedFiles: ctx.changedFiles,
        candidateDocs: ctx.docPaths,
        truncatedDocs: ctx.truncatedDocs,
      });

      await db.$transaction([
        db.analysisRun.update({
          where: { id: runId },
          data: {
            status: 'SUCCEEDED',
            summary: result.output.summary,
            rawOutput: result.output,
            warnings,
            inputManifest: manifest,
            attemptCount: result.attempts,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: costOf(result.inputTokens, result.outputTokens),
            latencyMs: Date.now() - started,
            finishedAt: new Date(),
          },
        }),
        ...recommendations.map((r) =>
          db.suggestion.create({
            data: {
              analysisRunId: runId,
              documentationPath: r.documentationPath,
              reason: r.reason,
              evidence: r.evidence,
              originalContent: r.suggestedUpdate,
              currentContent: r.suggestedUpdate,
              modelConfidence: r.modelConfidence,
              uncertainty: r.uncertainty || null,
            },
          }),
        ),
      ]);
    } catch (err) {
      const failure =
        err instanceof RunFailure
          ? err
          : err instanceof GitHubError
            ? new RunFailure('GITHUB_ERROR', `GitHub request failed (${err.code})`)
            : new RunFailure('INTERNAL_ERROR', 'Unexpected error during analysis');
      if (!(err instanceof RunFailure) && !(err instanceof GitHubError))
        logger.error({ err, runId }, 'Analysis failed unexpectedly');
      const extra = err as {
        attempts?: number;
        inputTokens?: number | null;
        outputTokens?: number | null;
      };
      await db.analysisRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          errorCode: failure.code,
          errorMessage: failure.message.slice(0, 1000),
          inputManifest: manifest ?? Prisma.JsonNull,
          attemptCount: extra.attempts ?? 0,
          inputTokens: extra.inputTokens ?? null,
          outputTokens: extra.outputTokens ?? null,
          costUsd: costOf(extra.inputTokens ?? null, extra.outputTokens ?? null),
          latencyMs: Date.now() - started,
          finishedAt: new Date(),
        },
      });
    }
  }

  return {
    configured: () => ai !== null && github !== null,
    aiInfo: () => (ai ? { provider: ai.name, model: ai.model } : null),

    /**
     * Starts an analysis of the PR's current head commit. Idempotent: if one is
     * already queued or running for the same commit, that run is returned
     * (double clicks and retries don't spend tokens twice).
     */
    async start(pullRequestId: string, userId: string) {
      if (!ai)
        throw new AppError(503, 'AI_NOT_CONFIGURED', 'No AI provider is configured on this server');
      if (!github)
        throw new AppError(
          503,
          'GITHUB_NOT_CONFIGURED',
          'GitHub integration is not configured on this server',
        );
      const pr = await db.pullRequest.findFirst({
        where: { id: pullRequestId, repository: { userId } },
      });
      if (!pr) throw new AppError(404, 'NOT_FOUND', 'Pull request not found');

      const run = await db.$transaction(async (tx) => {
        const existing = await tx.analysisRun.findFirst({
          where: { pullRequestId, headSha: pr.headSha, status: { in: ['QUEUED', 'RUNNING'] } },
        });
        if (existing) return { run: existing, created: false };
        const created = await tx.analysisRun.create({
          data: {
            pullRequestId,
            triggeredById: userId,
            trigger: 'MANUAL',
            headSha: pr.headSha,
            promptVersion: PROMPT_VERSION,
            schemaVersion: ANALYSIS_OUTPUT_SCHEMA_VERSION,
            provider: ai.name,
            model: ai.model,
          },
        });
        return { run: created, created: true };
      });
      if (run.created) {
        queue.push(run.run.id);
        pump();
      }
      return run;
    },

    /** Runs left QUEUED/RUNNING by a crash or restart can never finish: mark them failed. */
    async failInterruptedRuns() {
      const { count } = await db.analysisRun.updateMany({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
        data: {
          status: 'FAILED',
          errorCode: 'INTERRUPTED',
          errorMessage: 'The server restarted before this analysis finished.',
          finishedAt: new Date(),
        },
      });
      return count;
    },

    /** Test helper: resolves when the queue is empty. */
    whenIdle(): Promise<void> {
      if (active === 0 && queue.length === 0) return Promise.resolve();
      return new Promise((r) => idleWaiters.push(r));
    },
  };
}

export type AnalysisService = ReturnType<typeof createAnalysisService>;
