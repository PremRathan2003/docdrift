import { classifyFile, type PullRequestDto } from '@docdrift/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/require-auth.js';
import type { SessionCookieConfig } from '../auth/cookie.js';
import type { SessionService } from '../auth/session.service.js';
import { GitHubError } from '../github/github-client.js';
import type { GitHubService } from '../github/github.service.js';

/** Don't hit GitHub again if the list was refreshed this recently (unless ?refresh=1). */
const SYNC_TTL_MS = 60_000;
/** Patches above this size are cut, so one huge file can't freeze the browser. */
export const MAX_PATCH_CHARS = 100_000;

const listQuery = z.object({
  state: z.enum(['open', 'closed', 'merged', 'all']).default('open'),
  q: z.string().trim().max(200).optional(),
  refresh: z.enum(['1', 'true']).optional(),
});
const idParam = z.object({ id: z.string().min(1).max(40) });

type PrRow = Awaited<ReturnType<Db['pullRequest']['findFirstOrThrow']>> & {
  analysisRuns?: { status: PullRequestDto['latestAnalysisStatus'] }[];
};

export function toPullRequestDto(pr: PrRow): PullRequestDto {
  return {
    id: pr.id,
    repositoryId: pr.repositoryId,
    number: pr.number,
    title: pr.title,
    body: pr.body,
    authorLogin: pr.authorLogin,
    state: pr.state,
    isDraft: pr.isDraft,
    headRef: pr.headRef,
    baseRef: pr.baseRef,
    headSha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    htmlUrl: pr.htmlUrl,
    githubCreatedAt: pr.githubCreatedAt.toISOString(),
    githubUpdatedAt: pr.githubUpdatedAt.toISOString(),
    mergedAt: pr.mergedAt?.toISOString() ?? null,
    latestAnalysisStatus: pr.analysisRuns?.[0]?.status ?? null,
  };
}

const latestRun = {
  analysisRuns: { select: { status: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
};

export function pullRequestsRouter(deps: {
  db: Db;
  github: GitHubService | null;
  sessions: SessionService;
  cookie: SessionCookieConfig;
}) {
  const { db, github } = deps;
  const router = Router();
  // Per-route (not router.use): this router is mounted at /api, and a
  // router-wide guard would turn every unknown /api path into a 401.
  const auth = requireAuth(deps.sessions, deps.cookie);

  /** Every lookup includes the user id, so ids of other users' data simply 404. */
  async function ownedRepository(userId: string, id: string) {
    const repo = await db.repository.findFirst({
      where: { id, userId },
      include: { installation: { select: { installationId: true } } },
    });
    if (!repo) throw new AppError(404, 'NOT_FOUND', 'Repository not found');
    return repo;
  }

  async function ownedPullRequest(userId: string, id: string) {
    const pr = await db.pullRequest.findFirst({
      where: { id, repository: { userId } },
      include: {
        ...latestRun,
        repository: { include: { installation: { select: { installationId: true } } } },
      },
    });
    if (!pr) throw new AppError(404, 'NOT_FOUND', 'Pull request not found');
    return pr;
  }

  router.get('/repositories/:id/pull-requests', auth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const query = listQuery.parse(req.query);
    const repo = await ownedRepository(req.auth!.user.id, id);

    let syncWarning: string | null = null;
    const stale = !repo.lastSyncedAt || Date.now() - repo.lastSyncedAt.getTime() > SYNC_TTL_MS;
    if (github && (stale || query.refresh)) {
      try {
        await github.syncPullRequests({
          ...repo,
          installationId: repo.installation.installationId,
        });
      } catch (err) {
        // Serve what we have instead of failing the whole page.
        if (!(err instanceof GitHubError)) throw err;
        req.log.warn({ err: { code: err.code, message: err.message } }, 'Pull request sync failed');
        syncWarning =
          err.code === 'GITHUB_RATE_LIMITED'
            ? 'GitHub rate limit reached; showing the last saved list.'
            : 'Could not refresh from GitHub; showing the last saved list.';
      }
    } else if (!github) {
      syncWarning = 'GitHub integration is not configured; showing the last saved list.';
    }

    const q = query.q;
    const numberMatch = q && /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : undefined;
    const rows = await db.pullRequest.findMany({
      where: {
        repositoryId: repo.id,
        ...(query.state !== 'all'
          ? { state: query.state.toUpperCase() as 'OPEN' | 'CLOSED' | 'MERGED' }
          : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' as const } },
                { authorLogin: { contains: q, mode: 'insensitive' as const } },
                ...(numberMatch !== undefined ? [{ number: numberMatch }] : []),
              ],
            }
          : {}),
      },
      include: latestRun,
      orderBy: { githubUpdatedAt: 'desc' },
      take: 100,
    });
    const fresh = await db.repository.findUniqueOrThrow({
      where: { id: repo.id },
      select: { lastSyncedAt: true },
    });

    res.json({
      repository: {
        id: repo.id,
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        defaultBranch: repo.defaultBranch,
      },
      pullRequests: rows.map(toPullRequestDto),
      syncedAt: fresh.lastSyncedAt?.toISOString() ?? null,
      syncWarning,
    });
  });

  router.get('/pull-requests/:id', auth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const pr = await ownedPullRequest(req.auth!.user.id, id);
    res.json({
      pullRequest: toPullRequestDto(pr),
      repository: { id: pr.repository.id, fullName: pr.repository.fullName },
    });
  });

  router.get('/pull-requests/:id/files', auth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    if (!github)
      throw new AppError(
        503,
        'GITHUB_NOT_CONFIGURED',
        'GitHub integration is not configured on this server',
      );
    const pr = await ownedPullRequest(req.auth!.user.id, id);
    const repo = pr.repository;
    const files = await github.pullRequestFiles(
      { owner: repo.owner, name: repo.name, installationId: repo.installation.installationId },
      pr.number,
    );

    res.json({
      headSha: pr.headSha,
      incomplete: files.length < pr.changedFiles,
      files: files.map((f) => {
        const truncated = f.patch !== null && f.patch.length > MAX_PATCH_CHARS;
        return {
          ...f,
          kind: classifyFile(f.filename),
          patch: truncated ? f.patch!.slice(0, MAX_PATCH_CHARS) : f.patch,
          patchTruncated: truncated,
        };
      }),
    });
  });

  return router;
}
