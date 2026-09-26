/**
 * The endpoint GitHub calls when something happens in a connected repository.
 *
 * Three properties matter more than what it does with the payload:
 *
 *  - it trusts nothing unsigned. The body is verified against the App's webhook
 *    secret before it is parsed, over the raw bytes as received;
 *  - a redelivery does the work once. GitHub retries, and lets a maintainer
 *    redeliver by hand, so every delivery is recorded by its own id;
 *  - it answers quickly and it answers 2xx. GitHub disables a webhook that keeps
 *    failing, so an event we cannot use is recorded and accepted, not rejected.
 *
 * What it deliberately does NOT do: start an analysis. That spends the user's
 * AI quota and writes suggestions against their documentation, so it stays a
 * decision someone makes, not a consequence of pushing a commit. Keeping the
 * cached pull request list fresh is the useful half that costs nothing.
 */
import { Router } from 'express';
import type { Logger } from 'pino';
import type { Db } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { decide, toPullRequestRow, verifySignature } from './webhook.js';

/** Outcomes that mean the delivery finished; anything else may be retried. */
const FINISHED = new Set(['handled', 'ignored']);

export function webhooksRouter(deps: { db: Db; secret: string | null; logger: Logger }) {
  const { db, secret, logger } = deps;
  const router = Router();

  router.post('/github', async (req, res) => {
    if (!secret)
      throw new AppError(
        503,
        'GITHUB_WEBHOOK_NOT_CONFIGURED',
        'This server has no webhook secret configured',
      );

    // express.raw gives a Buffer; anything else means the route was mounted
    // after a body parser, which would break the signature silently.
    const raw = req.body;
    if (!Buffer.isBuffer(raw))
      throw new AppError(500, 'WEBHOOK_MISCONFIGURED', 'The webhook body was parsed too early');

    const signature = req.header('x-hub-signature-256');
    if (!verifySignature(raw, signature, secret)) {
      logger.warn({ delivery: req.header('x-github-delivery') }, 'Rejected an unsigned webhook');
      throw new AppError(401, 'INVALID_SIGNATURE', 'Signature missing or wrong');
    }

    const deliveryId = req.header('x-github-delivery');
    if (!deliveryId)
      throw new AppError(400, 'MISSING_DELIVERY_ID', 'X-GitHub-Delivery header is required');
    const event = req.header('x-github-event') ?? 'missing';

    let body: unknown;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      // Signed, so it came from GitHub, but unusable. Accept and record.
      await finish(deliveryId, event, null, null, 'ignored', 'body was not JSON');
      return res.json({ status: 'ignored', reason: 'body was not JSON' });
    }

    const decision = decide(event, body);
    const action = decision.kind === 'pull_request' ? decision.event.action : null;
    const repository =
      decision.kind === 'pull_request' ? decision.event.repository.full_name : null;

    // Claim the delivery before doing anything with it, so two concurrent
    // copies cannot both act. A claim that never finished may be retried.
    const existing = await db.webhookDelivery.findUnique({
      where: { id: deliveryId },
      select: { outcome: true },
    });
    if (existing && FINISHED.has(existing.outcome)) {
      logger.info({ delivery: deliveryId, event }, 'Ignored a duplicate webhook delivery');
      return res.json({ status: 'duplicate' });
    }
    await db.webhookDelivery.upsert({
      where: { id: deliveryId },
      create: { id: deliveryId, event, action, repository, outcome: 'received' },
      update: { event, action, repository, outcome: 'received', detail: null },
    });

    if (decision.kind === 'ignored') {
      await finish(deliveryId, event, action, repository, 'ignored', decision.reason);
      return res.json({ status: 'ignored', reason: decision.reason });
    }

    try {
      const updated = await cachePullRequest(decision.event);
      const detail =
        updated === 0 ? 'repository is not connected by any user' : `${updated} row(s) updated`;
      await finish(deliveryId, event, action, repository, updated ? 'handled' : 'ignored', detail);
      logger.info({ delivery: deliveryId, event, action, repository, updated }, 'Webhook handled');
      return res.json({ status: updated ? 'handled' : 'ignored', repositories: updated });
    } catch (err) {
      // Leave the delivery unfinished so a redelivery can try again.
      await db.webhookDelivery
        .update({ where: { id: deliveryId }, data: { outcome: 'failed' } })
        .catch(() => {});
      throw err;
    }
  });

  /** Updates the cached pull request for every user who connected this repository. */
  async function cachePullRequest(e: Parameters<typeof toPullRequestRow>[0]) {
    const repos = await db.repository.findMany({
      where: { githubRepoId: BigInt(e.repository.id) },
      select: { id: true },
    });
    if (repos.length === 0) return 0;

    const row = toPullRequestRow(e);
    await db.$transaction(
      repos.map((repo) =>
        db.pullRequest.upsert({
          where: { repositoryId_number: { repositoryId: repo.id, number: row.number } },
          update: { ...row, syncedAt: new Date() },
          create: { ...row, repositoryId: repo.id, syncedAt: new Date() },
        }),
      ),
    );
    return repos.length;
  }

  function finish(
    id: string,
    event: string,
    action: string | null,
    repository: string | null,
    outcome: string,
    detail: string,
  ) {
    return db.webhookDelivery.upsert({
      where: { id },
      create: { id, event, action, repository, outcome, detail },
      update: { outcome, detail },
    });
  }

  return router;
}
