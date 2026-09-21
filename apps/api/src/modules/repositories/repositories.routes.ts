import { connectRepositoryRequestSchema, type Repository as RepositoryDto } from '@docdrift/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/require-auth.js';
import type { AuditService } from '../audit/audit.service.js';
import type { SessionCookieConfig } from '../auth/cookie.js';
import type { SessionService } from '../auth/session.service.js';
import type { GitHubService } from '../github/github.service.js';

type RepositoryRow = Awaited<ReturnType<Db['repository']['findFirstOrThrow']>>;

export function toRepositoryDto(r: RepositoryRow): RepositoryDto {
  return {
    id: r.id,
    githubRepoId: String(r.githubRepoId),
    owner: r.owner,
    name: r.name,
    fullName: r.fullName,
    defaultBranch: r.defaultBranch,
    isPrivate: r.isPrivate,
    htmlUrl: r.htmlUrl,
    createdAt: r.createdAt.toISOString(),
  };
}

const idParam = z.object({ id: z.string().min(1).max(40) });

export function repositoriesRouter(deps: {
  db: Db;
  github: GitHubService | null;
  sessions: SessionService;
  audit: AuditService;
  cookie: SessionCookieConfig;
}) {
  const { db, github, audit } = deps;
  const router = Router();
  router.use(requireAuth(deps.sessions, deps.cookie));

  const requireGitHub = () => {
    if (!github)
      throw new AppError(
        503,
        'GITHUB_NOT_CONFIGURED',
        'GitHub integration is not configured on this server',
      );
    return github;
  };

  /** Connected repositories. Every query is scoped to the signed-in user. */
  router.get('/', async (req, res) => {
    const rows = await db.repository.findMany({
      where: { userId: req.auth!.user.id },
      orderBy: { fullName: 'asc' },
    });
    res.json({ repositories: rows.map(toRepositoryDto) });
  });

  /** Repositories the user *could* connect (live from GitHub). */
  router.get('/available', async (req, res) => {
    const { repositories, unavailableInstallations } =
      await requireGitHub().listAvailableRepositories(req.auth!.user.id);
    res.json({
      repositories: repositories.map(
        ({ owner: _o, name: _n, installationRowId: _i, ...pub }) => pub,
      ),
      unavailableInstallations,
    });
  });

  router.post('/', async (req, res) => {
    const { githubRepoId } = connectRepositoryRequestSchema.parse(req.body);
    const user = req.auth!.user;
    const repo = await requireGitHub().connectRepository(user.id, githubRepoId);
    await audit.record({
      action: 'repository.connect',
      actorId: user.id,
      entityType: 'repository',
      entityId: repo.id,
      metadata: { fullName: repo.fullName },
    });
    res.status(201).json({ repository: toRepositoryDto(repo) });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const user = req.auth!.user;
    // deleteMany with userId in the filter: another user's id simply matches nothing,
    // and the response is the same 404 either way (no hint that the id exists).
    const repo = await db.repository.findFirst({ where: { id, userId: user.id } });
    if (!repo) throw new AppError(404, 'NOT_FOUND', 'Repository not found');
    await db.repository.deleteMany({ where: { id, userId: user.id } });
    await audit.record({
      action: 'repository.disconnect',
      actorId: user.id,
      entityType: 'repository',
      entityId: id,
      metadata: { fullName: repo.fullName },
    });
    res.status(204).end();
  });

  return router;
}
