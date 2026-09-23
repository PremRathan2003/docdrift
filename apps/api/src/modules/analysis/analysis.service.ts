import { ANALYSIS_OUTPUT_SCHEMA_VERSION, type InputManifest } from '@docdrift/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { Db } from '../../lib/prisma.js';
import type { AIProvider } from '../ai/provider.js';
import { GitHubError } from '../github/github-client.js';
import type { GitHubService } from '../github/github.service.js';
import { PROMPT_VERSION, RunFailure, runPipeline, type RepoSource } from './pipeline.js';

export interface AnalysisConfig {
  timeoutMs: number;
  maxInputTokens: number;
  maxOutputTokens?: number;
  inputUsdPerMTok?: number;
  outputUsdPerMTok?: number;
  /** Test hook: replaces real waiting between retries. */
  sleep?: (ms: number) => Promise<void>;
}

type RepoRef = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  installationId: bigint;
};

/** The pipeline's view of a repository, read from GitHub at one commit. */
function gitHubSource(
  github: GitHubService,
  repo: RepoRef,
  prNumber: number,
  sha: string,
): RepoSource {
  // The tree is read once and reused: it carries each file's blob SHA, which is
  // the cache key for that file's content.
  let tree: Promise<{ path: string; sha: string }[]> | null = null;
  const paths = () => (tree ??= github.treePaths(repo, sha).then((t) => t.paths));

  return {
    fullName: repo.fullName,
    changedFiles: () => github.pullRequestFiles(repo, prNumber),
    treePaths: async () => (await paths()).map((p) => p.path),
    textFile: (path) => github.textFile(repo, path, sha),
    async textFiles(wanted) {
      const bySha = new Map((await paths()).map((p) => [p.path, p.sha]));
      return github.textFilesBySha(
        repo,
        wanted.map((path) => ({ path, sha: bySha.get(path) ?? '' })),
      );
    },
  };
}

export function createAnalysisService(deps: {
  db: Db;
  github: GitHubService | null;
  ai: AIProvider | null;
  logger: Logger;
  config: AnalysisConfig;
}) {
  const { db, github, ai, logger, config } = deps;

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

  function costOf(inputTokens: number | null, outputTokens: number | null) {
    if (config.inputUsdPerMTok === undefined || config.outputUsdPerMTok === undefined) return null;
    if (inputTokens === null || outputTokens === null) return null;
    return new Prisma.Decimal(
      (inputTokens * config.inputUsdPerMTok + outputTokens * config.outputUsdPerMTok) / 1_000_000,
    );
  }

  // ---------------------------------------------------------------- run one analysis and store it
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
      const result = await runPipeline({
        ai,
        source: gitHubSource(github, repo, pr.number, run.headSha),
        pullRequest: pr,
        config,
        logger,
      });
      manifest = result.context.manifest;

      if (result.kind === 'skipped') {
        await db.analysisRun.update({
          where: { id: runId },
          data: {
            status: 'SUCCEEDED',
            summary: result.summary,
            rawOutput: Prisma.JsonNull,
            warnings: [],
            inputManifest: manifest,
            latencyMs: Date.now() - started,
            finishedAt: new Date(),
          },
        });
        return;
      }

      await db.$transaction([
        db.analysisRun.update({
          where: { id: runId },
          data: {
            status: 'SUCCEEDED',
            summary: result.output.summary,
            rawOutput: result.output,
            warnings: result.warnings,
            inputManifest: manifest,
            attemptCount: result.attempts,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: costOf(result.inputTokens, result.outputTokens),
            latencyMs: Date.now() - started,
            finishedAt: new Date(),
          },
        }),
        ...result.recommendations.map((r) =>
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
      await db.analysisRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          errorCode: failure.code,
          errorMessage: failure.message.slice(0, 1000),
          inputManifest: manifest ?? Prisma.JsonNull,
          attemptCount: failure.attempts,
          inputTokens: failure.inputTokens,
          outputTokens: failure.outputTokens,
          costUsd: costOf(failure.inputTokens, failure.outputTokens),
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
