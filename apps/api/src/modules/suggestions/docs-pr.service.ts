/**
 * Opening the documentation pull request: the side-effecting half of docs-pr.ts.
 *
 * The order of operations is chosen so that a failure leaves nothing confusing
 * behind. The commit and branch come first (they are ours, and repeating them is
 * harmless), then the pull request, and only then are the suggestions marked
 * APPLIED — so a suggestion is never recorded as applied unless a pull request
 * exists that contains it. Re-running for the same analysis finds the same
 * branch and the same open pull request instead of opening a second one.
 */
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import type { GitHubService } from '../github/github.service.js';
import { planDocsPullRequest } from './docs-pr.js';

export interface DocsPullRequestResult {
  number: number;
  htmlUrl: string;
  branch: string;
  base: string;
  documents: string[];
  createdAt: string;
  created: boolean;
}

export function createDocsPullRequestService(deps: {
  db: Db;
  github: GitHubService;
  logger: Logger;
}) {
  const { db, github, logger } = deps;

  return {
    async create(opts: { runId: string; userId: string }): Promise<DocsPullRequestResult> {
      const run = await db.analysisRun.findFirst({
        where: { id: opts.runId, pullRequest: { repository: { userId: opts.userId } } },
        include: {
          suggestions: true,
          pullRequest: { include: { repository: { include: { installation: true } } } },
        },
      });
      if (!run) throw new AppError(404, 'NOT_FOUND', 'Analysis not found');

      const actor = await db.user.findUniqueOrThrow({
        where: { id: opts.userId },
        select: { email: true },
      });
      const planned = planDocsPullRequest({
        run: { id: run.id, status: run.status, headSha: run.headSha },
        pullRequest: run.pullRequest,
        suggestions: run.suggestions,
        actorLogin: actor.email.split('@')[0]!,
      });
      // A refusal is a 409: the request was understood, the state says no.
      if (!planned.ok) throw new AppError(409, planned.code, planned.message);
      const plan = planned.plan;

      const repo = run.pullRequest.repository;
      const existing = await db.docsPullRequest.findUnique({ where: { analysisRunId: run.id } });

      const commitSha = await github.commitDocuments(
        { owner: repo.owner, name: repo.name, installationId: repo.installation.installationId },
        { parentSha: run.pullRequest.headSha, message: plan.commitMessage, files: plan.files },
      );
      await github.setBranch(
        { owner: repo.owner, name: repo.name, installationId: repo.installation.installationId },
        plan.branch,
        commitSha,
      );

      // The branch may already have a pull request, either from an earlier
      // attempt of this run or one we recorded and GitHub still has open.
      const already = await github.findDocsPullRequest(
        { owner: repo.owner, name: repo.name, installationId: repo.installation.installationId },
        plan.branch,
        plan.base,
      );
      const pr =
        already ??
        (await github.openDocsPullRequest(
          { owner: repo.owner, name: repo.name, installationId: repo.installation.installationId },
          { branch: plan.branch, base: plan.base, title: plan.title, body: plan.body },
        ));

      const [, row] = await db.$transaction([
        db.suggestion.updateMany({
          where: { id: { in: plan.suggestionIds } },
          data: { status: 'APPLIED' },
        }),
        db.docsPullRequest.upsert({
          where: { analysisRunId: run.id },
          create: {
            analysisRunId: run.id,
            branch: plan.branch,
            baseRef: plan.base,
            number: pr.number,
            htmlUrl: pr.htmlUrl,
            commitSha,
            documents: plan.files.map((f) => f.path),
            createdById: opts.userId,
          },
          update: { commitSha, number: pr.number, htmlUrl: pr.htmlUrl },
        }),
      ]);

      logger.info(
        { runId: run.id, branch: plan.branch, number: pr.number, documents: plan.files.length },
        existing ? 'Updated a documentation pull request' : 'Opened a documentation pull request',
      );
      // Answered from the stored row, not from the plan, so what the client
      // receives is what was written — the same shape the run carries.
      return {
        number: row.number,
        htmlUrl: row.htmlUrl,
        branch: row.branch,
        base: row.baseRef,
        documents: row.documents,
        createdAt: row.createdAt.toISOString(),
        created: !already,
      };
    },
  };
}

export type DocsPullRequestService = ReturnType<typeof createDocsPullRequestService>;
