/**
 * Reading a GitHub webhook delivery.
 *
 * Everything here is a pure function over the request: the signature check, the
 * shape of the payload and the decision about what to do with it. The route
 * around it does the database work. Keeping them apart means the security-
 * critical part is testable without a server or a database.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * GitHub signs the raw request body with the secret configured on the App.
 *
 * Two details matter. The comparison is timing-safe, so a wrong signature takes
 * the same time to reject whichever byte differs. And the body must be the
 * bytes GitHub sent: re-serialising parsed JSON changes whitespace and key
 * order, and the signature would never match — which is why the route is
 * mounted before the JSON body parser.
 */
export function verifySignature(rawBody: Buffer, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The part of a pull_request event we cache. Unknown fields are ignored. */
const pullRequestEvent = z.object({
  action: z.string(),
  repository: z.object({ id: z.number(), full_name: z.string() }),
  pull_request: z.object({
    id: z.number(),
    number: z.int().positive(),
    title: z.string(),
    body: z.string().nullable().default(null),
    state: z.enum(['open', 'closed']),
    draft: z.boolean().default(false),
    user: z.object({ login: z.string() }).nullable().default(null),
    head: z.object({ sha: z.string(), ref: z.string() }),
    base: z.object({ ref: z.string() }),
    additions: z.number().default(0),
    deletions: z.number().default(0),
    changed_files: z.number().default(0),
    html_url: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    merged_at: z.string().nullable().default(null),
  }),
});

export type PullRequestEvent = z.infer<typeof pullRequestEvent>;

/**
 * Actions worth acting on. Others (labelled, assigned, review requested…) change
 * nothing we cache, so they are recorded and ignored rather than causing work.
 */
const HANDLED_ACTIONS = new Set(['opened', 'reopened', 'synchronize', 'edited', 'closed']);

export type Decision =
  | { kind: 'pull_request'; event: PullRequestEvent; reason?: undefined }
  | { kind: 'ignored'; reason: string };

/** What to do with a delivery, from its event name and body. */
export function decide(event: string | undefined, body: unknown): Decision {
  if (event === 'ping') return { kind: 'ignored', reason: 'ping' };
  if (event !== 'pull_request') return { kind: 'ignored', reason: `event ${event ?? 'missing'}` };

  const parsed = pullRequestEvent.safeParse(body);
  // A payload we cannot read is not an error to retry: GitHub would send it
  // again unchanged. Record why and accept it.
  if (!parsed.success) return { kind: 'ignored', reason: 'payload did not match the schema' };
  if (!HANDLED_ACTIONS.has(parsed.data.action))
    return { kind: 'ignored', reason: `action ${parsed.data.action}` };
  return { kind: 'pull_request', event: parsed.data };
}

/** The event's pull request as the columns of our own PullRequest row. */
export function toPullRequestRow(e: PullRequestEvent) {
  const pr = e.pull_request;
  return {
    githubPrId: BigInt(pr.id),
    number: pr.number,
    title: pr.title,
    body: pr.body,
    authorLogin: pr.user?.login ?? 'unknown',
    state:
      pr.state === 'open'
        ? ('OPEN' as const)
        : pr.merged_at
          ? ('MERGED' as const)
          : ('CLOSED' as const),
    isDraft: pr.draft,
    headSha: pr.head.sha,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    htmlUrl: pr.html_url,
    githubCreatedAt: new Date(pr.created_at),
    githubUpdatedAt: new Date(pr.updated_at),
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
  };
}
