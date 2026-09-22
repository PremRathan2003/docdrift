import {
  decisionRequestSchema,
  editSuggestionRequestSchema,
  type DashboardSummary,
  type ReviewAction,
  type SuggestionDetail,
} from '@docdrift/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { toSuggestionDto } from '../analysis/analysis.routes.js';
import type { AuditAction, AuditService } from '../audit/audit.service.js';
import type { SessionCookieConfig } from '../auth/cookie.js';
import type { SessionService } from '../auth/session.service.js';
import { GitHubError } from '../github/github-client.js';
import type { GitHubService } from '../github/github.service.js';
import { allowedActions, nextStatus, type SuggestionStatus } from './state-machine.js';

const idParam = z.object({ id: z.string().min(1).max(40) });
const ALL_STATUSES: SuggestionStatus[] = [
  'PENDING',
  'IN_REVIEW',
  'EDITED',
  'APPROVED',
  'REJECTED',
  'APPLIED',
  'FAILED',
];

export function suggestionsRouter(deps: {
  db: Db;
  github: GitHubService | null;
  sessions: SessionService;
  audit: AuditService;
  cookie: SessionCookieConfig;
}) {
  const { db, github, audit } = deps;
  const router = Router();
  const auth = requireAuth(deps.sessions, deps.cookie);

  /** A suggestion is visible only through a repository the user connected. */
  async function owned(userId: string, id: string) {
    const s = await db.suggestion.findFirst({
      where: { id, analysisRun: { pullRequest: { repository: { userId } } } },
      include: {
        analysisRun: {
          include: {
            pullRequest: { include: { repository: { include: { installation: true } } } },
          },
        },
      },
    });
    if (!s) throw new AppError(404, 'NOT_FOUND', 'Suggestion not found');
    return s;
  }

  /**
   * Applies one review action inside a transaction. The UPDATE is conditional
   * on the version the reviewer saw ("optimistic locking"): if someone else
   * changed the suggestion in the meantime, nothing is written and the client
   * gets 409 with the current version, instead of silently overwriting.
   */
  async function applyAction(
    userId: string,
    id: string,
    action: ReviewAction,
    version: number,
    note: string | undefined,
    newContent?: string,
  ) {
    const current = await owned(userId, id);
    if (current.version !== version) {
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'This suggestion was changed by someone else. Reload to see the latest version.',
        {
          currentVersion: current.version,
        },
      );
    }
    const to = nextStatus(current.status, action);
    if (!to) {
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        `Cannot ${action.toLowerCase().replace('_', ' ')} a suggestion that is ${current.status.toLowerCase()}`,
        {
          status: current.status,
          allowedActions: allowedActions(current.status),
        },
      );
    }
    const content = newContent ?? current.currentContent;

    await db.$transaction(async (tx) => {
      const { count } = await tx.suggestion.updateMany({
        where: { id, version },
        data: { status: to, currentContent: content, version: { increment: 1 } },
      });
      if (count === 0) {
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'This suggestion was changed by someone else. Reload to see the latest version.',
        );
      }
      await tx.review.create({
        data: {
          suggestionId: id,
          reviewerId: userId,
          decision: action,
          note: note || null,
          contentAtTime: content,
        },
      });
    });
    await audit.record({
      action: `suggestion.${action.toLowerCase()}` as AuditAction,
      actorId: userId,
      entityType: 'suggestion',
      entityId: id,
      metadata: { from: current.status, to, documentationPath: current.documentationPath },
    });
    return detail(userId, id);
  }

  async function detail(userId: string, id: string): Promise<SuggestionDetail> {
    const s = await owned(userId, id);
    const run = s.analysisRun;
    const pr = run.pullRequest;
    const repo = pr.repository;

    let originalDocument: SuggestionDetail['originalDocument'] = {
      status: 'unavailable',
      content: null,
    };
    if (github) {
      try {
        const content = await github.textFile(
          { owner: repo.owner, name: repo.name, installationId: repo.installation.installationId },
          s.documentationPath,
          run.headSha,
        );
        originalDocument =
          content === null ? { status: 'missing', content: null } : { status: 'found', content };
      } catch (err) {
        if (!(err instanceof GitHubError)) throw err;
      }
    }

    const reviews = await db.review.findMany({
      where: { suggestionId: id },
      orderBy: { createdAt: 'asc' },
      include: { reviewer: { select: { displayName: true, email: true } } },
    });

    return {
      suggestion: toSuggestionDto(s),
      allowedActions: allowedActions(s.status),
      analysis: {
        id: run.id,
        provider: run.provider,
        model: run.model,
        promptVersion: run.promptVersion,
        headSha: run.headSha,
        createdAt: run.createdAt.toISOString(),
      },
      pullRequest: { id: pr.id, number: pr.number, title: pr.title, headSha: pr.headSha },
      repository: { id: repo.id, fullName: repo.fullName },
      originalDocument,
      reviews: reviews.map((r) => ({
        id: r.id,
        decision: r.decision,
        note: r.note,
        reviewer: r.reviewer,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  router.get('/suggestions/:id', auth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await detail(req.auth!.user.id, id));
  });

  router.patch('/suggestions/:id/content', auth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = editSuggestionRequestSchema.parse(req.body);
    res.json(
      await applyAction(req.auth!.user.id, id, 'EDIT', body.version, body.note, body.content),
    );
  });

  router.post('/suggestions/:id/decision', auth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = decisionRequestSchema.parse(req.body);
    res.json(await applyAction(req.auth!.user.id, id, body.action, body.version, body.note));
  });

  /** Real numbers for the dashboard — no placeholders. */
  router.get('/dashboard', auth, async (req, res) => {
    const userId = req.auth!.user.id;
    const inMyRepos = { analysisRun: { pullRequest: { repository: { userId } } } };
    const [repositoryCount, grouped, pending, runs] = await Promise.all([
      db.repository.count({ where: { userId } }),
      db.suggestion.groupBy({ by: ['status'], where: inMyRepos, _count: { _all: true } }),
      db.suggestion.findMany({
        where: { ...inMyRepos, status: { in: ['PENDING', 'IN_REVIEW', 'EDITED'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          analysisRun: {
            include: { pullRequest: { include: { repository: { select: { fullName: true } } } } },
          },
        },
      }),
      db.analysisRun.findMany({
        where: { pullRequest: { repository: { userId } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          _count: { select: { suggestions: true } },
          pullRequest: { include: { repository: { select: { fullName: true } } } },
        },
      }),
    ]);

    const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<
      SuggestionStatus,
      number
    >;
    for (const g of grouped) counts[g.status] = g._count._all;

    const body: DashboardSummary = {
      repositoryCount,
      suggestionCounts: counts,
      pendingReviews: pending.map((s) => ({
        id: s.id,
        documentationPath: s.documentationPath,
        status: s.status,
        pullRequest: {
          id: s.analysisRun.pullRequest.id,
          number: s.analysisRun.pullRequest.number,
          title: s.analysisRun.pullRequest.title,
        },
        repositoryFullName: s.analysisRun.pullRequest.repository.fullName,
        createdAt: s.createdAt.toISOString(),
      })),
      recentAnalyses: runs.map((r) => ({
        id: r.id,
        status: r.status,
        suggestionCount: r._count.suggestions,
        pullRequest: {
          id: r.pullRequest.id,
          number: r.pullRequest.number,
          title: r.pullRequest.title,
        },
        repositoryFullName: r.pullRequest.repository.fullName,
        createdAt: r.createdAt.toISOString(),
      })),
    };
    res.json(body);
  });

  return router;
}
