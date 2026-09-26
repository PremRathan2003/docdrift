/**
 * "Open a documentation pull request" — one deliberate action, by one person.
 *
 * There is no automatic path to this endpoint: nothing DocDrift does on a
 * schedule or in response to a webhook reaches it. A person signs in, reads the
 * suggestions, approves the ones they want, and presses the button; only then
 * does anything get written to their repository.
 */
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/require-auth.js';
import type { AuditService } from '../audit/audit.service.js';
import type { SessionCookieConfig } from '../auth/cookie.js';
import type { SessionService } from '../auth/session.service.js';
import { GitHubError } from '../github/github-client.js';
import type { DocsPullRequestService } from './docs-pr.service.js';

const idParam = z.object({ id: z.string().min(1).max(40) });

export function docsPullRequestRouter(deps: {
  db: Db;
  docsPr: DocsPullRequestService | null;
  sessions: SessionService;
  audit: AuditService;
  cookie: SessionCookieConfig;
}) {
  const { db, docsPr, audit } = deps;
  const router = Router();
  const auth = requireAuth(deps.sessions, deps.cookie);

  router.post('/analyses/:id/docs-pull-request', auth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    if (!docsPr)
      throw new AppError(
        503,
        'GITHUB_NOT_CONFIGURED',
        'GitHub integration is not configured on this server',
      );
    const userId = req.auth!.user.id;

    try {
      const result = await docsPr.create({ runId: id, userId });
      await audit.record({
        action: 'docs_pr.create',
        actorId: userId,
        entityType: 'analysisRun',
        entityId: id,
        metadata: {
          number: result.number,
          branch: result.branch,
          // The audit log takes scalars; the paths are recorded in full on the
          // DocsPullRequest row this action created.
          documents: result.documents.join(', '),
          created: result.created,
        },
      });
      res.status(result.created ? 201 : 200).json({ docsPullRequest: result });
    } catch (err) {
      // A missing write permission is the likeliest first failure, and the
      // message should say what to do rather than what went wrong.
      if (err instanceof GitHubError && err.code === 'GITHUB_FORBIDDEN')
        throw new AppError(
          403,
          'GITHUB_WRITE_FORBIDDEN',
          'The GitHub App needs "Contents: read and write" and "Pull requests: read and write" on this repository. Update its permissions, then accept the request on the installation page.',
        );
      throw err;
    }
  });

  /** What the review page shows once a documentation pull request exists. */
  router.get('/analyses/:id/docs-pull-request', auth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const row = await db.docsPullRequest.findFirst({
      where: { analysisRunId: id, analysisRun: { pullRequest: { repository: { userId: req.auth!.user.id } } } },
    });
    if (!row) throw new AppError(404, 'NOT_FOUND', 'No documentation pull request for this analysis');
    res.json({
      docsPullRequest: {
        number: row.number,
        htmlUrl: row.htmlUrl,
        branch: row.branch,
        base: row.baseRef,
        documents: row.documents,
        createdAt: row.createdAt.toISOString(),
      },
    });
  });

  return router;
}
