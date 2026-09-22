import { inputManifestSchema, suggestionSchema, type AnalysisRunDto } from '@docdrift/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/require-auth.js';
import type { SessionCookieConfig } from '../auth/cookie.js';
import type { SessionService } from '../auth/session.service.js';
import type { AnalysisService } from './analysis.service.js';

const idParam = z.object({ id: z.string().min(1).max(40) });

type RunRow = Awaited<ReturnType<Db['analysisRun']['findFirstOrThrow']>>;
type SuggestionRow = Awaited<ReturnType<Db['suggestion']['findFirstOrThrow']>>;

export function toSuggestionDto(s: SuggestionRow) {
  return suggestionSchema.parse({
    id: s.id,
    documentationPath: s.documentationPath,
    reason: s.reason,
    evidence: s.evidence,
    originalContent: s.originalContent,
    currentContent: s.currentContent,
    modelConfidence: s.modelConfidence,
    uncertainty: s.uncertainty,
    status: s.status,
    version: s.version,
  });
}

export function toRunDto(r: RunRow, suggestions: SuggestionRow[] = []): AnalysisRunDto {
  const manifest = inputManifestSchema.safeParse(r.inputManifest);
  return {
    id: r.id,
    pullRequestId: r.pullRequestId,
    status: r.status,
    headSha: r.headSha,
    provider: r.provider,
    model: r.model,
    promptVersion: r.promptVersion,
    schemaVersion: r.schemaVersion,
    summary: r.summary,
    warnings: Array.isArray(r.warnings) ? (r.warnings as string[]) : [],
    errorCode: r.errorCode,
    errorMessage: r.errorMessage,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.costUsd === null ? null : Number(r.costUsd),
    latencyMs: r.latencyMs,
    attemptCount: r.attemptCount,
    inputManifest: manifest.success ? manifest.data : null,
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    suggestions: suggestions.map(toSuggestionDto),
  };
}

export function analysisRouter(deps: {
  db: Db;
  analysis: AnalysisService;
  sessions: SessionService;
  cookie: SessionCookieConfig;
  /** Analyses cost money: cap how many one user can start per hour. */
  maxRunsPerHour?: number;
}) {
  const { db, analysis } = deps;
  const router = Router();
  const auth = requireAuth(deps.sessions, deps.cookie);

  const startLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: deps.maxRunsPerHour ?? 30,
    keyGenerator: (req) => req.auth!.user.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res, next) =>
      next(
        new AppError(
          429,
          'RATE_LIMITED',
          'You have started many analyses recently. Please wait a while.',
          {
            retryAfterSeconds: Number(res.getHeader('Retry-After')) || undefined,
          },
        ),
      ),
  });

  router.get('/ai/status', auth, (_req, res) => {
    const info = analysis.aiInfo();
    res.json({
      configured: analysis.configured(),
      provider: info?.provider ?? null,
      model: info?.model ?? null,
    });
  });

  router.post('/pull-requests/:id/analyses', auth, startLimiter, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { run, created } = await analysis.start(id, req.auth!.user.id);
    res.status(created ? 202 : 200).json({ analysis: toRunDto(run) });
  });

  router.get('/pull-requests/:id/analyses', auth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const pr = await db.pullRequest.findFirst({
      where: { id, repository: { userId: req.auth!.user.id } },
      select: { id: true },
    });
    if (!pr) throw new AppError(404, 'NOT_FOUND', 'Pull request not found');
    const runs = await db.analysisRun.findMany({
      where: { pullRequestId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { _count: { select: { suggestions: true } } },
    });
    res.json({
      analyses: runs.map(({ _count, ...r }) => {
        const dto: Partial<AnalysisRunDto> = toRunDto(r);
        delete dto.suggestions; // the list view stays small; details come from GET /analyses/:id
        delete dto.inputManifest;
        return { ...dto, suggestionCount: _count.suggestions };
      }),
    });
  });

  router.get('/analyses/:id', auth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const run = await db.analysisRun.findFirst({
      where: { id, pullRequest: { repository: { userId: req.auth!.user.id } } },
      include: { suggestions: { orderBy: { createdAt: 'asc' } } },
    });
    if (!run) throw new AppError(404, 'NOT_FOUND', 'Analysis not found');
    const { suggestions, ...row } = run;
    res.json({ analysis: toRunDto(row, suggestions) });
  });

  return router;
}
