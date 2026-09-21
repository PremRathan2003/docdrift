# Database design

PostgreSQL via Prisma. Schema: `apps/api/prisma/schema.prisma`.

## Entity relationships

```
User 1─* Session
User 1─* GithubInstallation 1─* Repository 1─* PullRequest 1─* AnalysisRun 1─* Suggestion 1─* Review
User 1─* Repository            (who connected it — the authorisation boundary)
User 1─* AnalysisRun           (who triggered it; null for webhook runs)
User 1─* Review                (who decided)
User 1─* AuditLog              (actor)
```

| Relationship                           | Why it exists                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User → Session                         | Server-side sessions so logout/revocation is real. Cascade: deleting a user logs them out everywhere.                                                          |
| User → GithubInstallation → Repository | A repository is reachable only through an installation the user linked, so every GitHub call knows which installation token to mint.                           |
| User → Repository                      | Authorisation: every query for repos/PRs/runs is scoped by `userId`. A user can never read another user's data by guessing an id.                              |
| Repository → PullRequest               | Cached PR metadata for fast lists, search and filters without hitting GitHub each time. `@@unique([repositoryId, number])` makes syncing an idempotent upsert. |
| PullRequest → AnalysisRun              | History: each run is pinned to a `headSha`, so we can tell whether results are stale after a new push.                                                         |
| AnalysisRun → Suggestion               | One run produces 0..20 recommendations.                                                                                                                        |
| Suggestion → Review                    | Append-only decision log. The suggestion holds the _current_ state; reviews hold the _history_.                                                                |
| AuditLog (no FK to target)             | Survives deletion of the thing it describes.                                                                                                                   |

## Design choices worth mentioning in interviews

- **`cuid()` string ids**, not auto-increment integers: not guessable, safe in URLs.
- **GitHub ids are `BigInt`** — GitHub ids already exceed 32-bit range for some objects.
- **`originalContent` vs `currentContent`** on Suggestion: the AI's output is preserved
  forever; edits go to `currentContent`. That's how we can later measure how much
  humans had to change the AI's suggestions.
- **Optimistic locking (`version`)** on Suggestion: an update must send the version it
  read; if someone else changed it first, the API returns `409 Conflict`.
- **`costUsd` is `Decimal(12,6)`**, never a float — money should not accumulate float error.
  Token counts and cost are nullable: if the provider doesn't report usage we store
  nothing rather than an estimate.
- **Cascades**: deleting a repository deletes its PRs, runs, suggestions and reviews
  (they're meaningless without it). Deleting a user _nulls_ `triggeredById`/`reviewerId`
  on other people's data instead of deleting it.
- **Indexes** match the actual queries: PR list ordered by `githubUpdatedAt`, run history
  by `createdAt`, "pending reviews" by `status`, audit lookups by entity and actor.

## Suggestion status state machine

```
PENDING ──start review──► IN_REVIEW ──edit──► EDITED
   │                          │                 │
   └──────────── approve / reject ◄─────────────┘
                     │           │
                 APPROVED     REJECTED
                     │
          (explicit confirm) create docs PR
                     │
              APPLIED  or  FAILED (retryable)
```

Transitions are enforced in `modules/suggestions` (a pure function, unit-tested), not
trusted from the client.

## Added in later phases

| Table                                    | Phase | Purpose                                                                                        |
| ---------------------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| `DocumentationFile`                      | 2     | One row per indexed doc file per repo + `contentSha`, so re-indexing skips unchanged files     |
| `DocumentationChunk`                     | 2     | Heading-aware chunks, `tsvector` for keyword search, `vector` column (pgvector) for embeddings |
| `EvaluationRun` / `EvaluationCaseResult` | 2     | Stored results of `npm run eval` so reports are reproducible                                   |
| `WebhookEvent`                           | 3     | `deliveryId` unique (dedup), event type, status, attempts, error                               |

## Data retention

- Sessions: expired rows deleted by a daily cleanup job.
- AuditLog: contains IP addresses (personal data under GDPR). Keep 90 days by default, then
  delete or anonymise. Failed logins for unknown emails never store the typed email.
- `AnalysisRun.rawOutput` can be large; keep 90 days by default (configurable), keep summaries forever.
- No source code is stored except short evidence excerpts inside suggestions.
- Deleting a repository removes all derived data (cascade).

## Local workflow

```bash
npm run db:up                         # start Postgres in Docker
npm run db:migrate -- --name <change>  # edit schema.prisma, then create + apply a migration
npm run db:seed                       # demo user
npm run db:studio -w @docdrift/api    # browse data
```

Production uses `npm run db:deploy -w @docdrift/api` (applies committed migrations only,
never generates new ones).
