# Architecture

DocDrift is a monorepo with three packages:

| Package           | What it is                                                    | Deployed to         |
| ----------------- | ------------------------------------------------------------- | ------------------- |
| `apps/web`        | React + Vite single-page app (the dashboard)                  | Vercel              |
| `apps/api`        | Express REST API, analysis pipeline, GitHub + LLM integration | Render or Railway   |
| `packages/shared` | Zod schemas = the API contract, used by both sides            | (bundled into both) |

## System diagram

```
 Browser (React SPA)
    │  same-origin /api/*   (Vite proxy in dev, Vercel rewrite in prod)
    ▼
 Express API ──────────────► PostgreSQL (+ pgvector from Phase 2)
    │   │
    │   └──► LLM provider (behind an AIProvider interface)
    │
    └──► GitHub REST API  (GitHub App installation tokens, minted on demand)
            ▲
            └── GitHub webhooks (Phase 3) → signature check → WebhookEvent table
```

## Backend module layout (feature-first)

Each feature owns its routes, validation, business logic and data access:

```
apps/api/src/
  app.ts                 createApp(deps) — wiring only, no business logic
  server.ts              process entry: env, logger, DB, listen, graceful shutdown
  config/env.ts          validated environment variables
  lib/                   logger, prisma client, AppError
  middleware/            error handler, auth guard, rate limiting
  modules/
    auth/                register, login, logout, sessions         (Milestone 1.2)
    github/              GitHub App client, token minting            (1.3)
    repositories/        connect + list repositories                 (1.3)
    pull-requests/       sync PRs, fetch files & diffs               (1.4)
    analysis/            pipeline: filter → context → LLM → validate (1.5)
      diff/              diff parsing + file classification (pure, unit-tested)
      prompts/           versioned prompt templates (v1.ts, v2.ts…)
      providers/         AIProvider interface + one implementation
    suggestions/         review workflow + state machine            (1.6)
    audit/               audit log writer
```

Inside a module: `*.routes.ts` (HTTP + Zod validation) → `*.service.ts` (logic) →
Prisma. Services receive dependencies as arguments, so tests can pass fakes.

## Key decisions and trade-offs

**D1 — GitHub App, not OAuth tokens or PATs.** A GitHub App asks for fine-grained,
per-repository permissions (Phase 1: _Contents: read, Pull requests: read, Metadata: read_;
_Contents: write_ + _Pull requests: write_ only when docs PR creation lands). Installation
tokens live one hour and are minted from the App's private key. **We never store a
GitHub token in the database** — that satisfies the "no plaintext tokens" requirement by
design rather than by encryption. Trade-off: a slightly more involved one-time setup.

**D2 — Server-side sessions in Postgres + httpOnly cookie, not JWT in localStorage.**
Sessions can be revoked instantly (logout, "sign out everywhere"), and JavaScript can't
read the cookie, which limits XSS damage. We store only a SHA-256 hash of the session
token. Passwords are hashed with Node's built-in `scrypt` — no native dependency.

**D3 — Same-origin API.** The browser calls `/api/...` on its own origin. See risk R3.

**D4 — Analysis runs are database-backed jobs.** `POST /analyze` creates an
`AnalysisRun` (status `QUEUED`), returns `202 Accepted` with its id, and the UI polls.
Phase 1 executes the run in-process; if that becomes unreliable we add `pg-boss`
(a Postgres-backed queue) — no Redis needed. The API contract doesn't change.

**D5 — Shared Zod schemas.** Request/response shapes and the LLM output schema live in
`packages/shared`. The API validates inputs; the web app validates responses. The LLM
schema is converted to JSON Schema for providers that support structured outputs.

**D6 — Validation is two layers.** (1) Zod: is the output well-formed? (2) Semantic
checks: does every `evidence.filePath` exist in the PR? Does `documentationPath` exist
in the repo (or is it clearly marked as a new file)? Failures become `warnings` on the
run, and invalid recommendations are dropped rather than shown as facts.

**D7 — Diffs are not persisted.** They are fetched from GitHub on demand. The run stores
an `inputManifest` (files sent, files skipped and why) for reproducibility instead.

**D8 — Retrieval starts simple.** Phase 1 finds candidate docs with path heuristics
(README, `docs/**`, OpenAPI files, docs mentioning a changed file or symbol). Phase 2
adds Postgres full-text search and pgvector embeddings, and the evaluation set decides
whether vectors actually beat keywords for this problem.

**D9 — Connecting GitHub never trusts the redirect URL.** After an installation GitHub
redirects back with an `installation_id`, which its docs say can be spoofed, and it doesn't
reliably return our OAuth `state` on that path. So:

```
/api/github/install ──► GitHub install page ──► /api/github/callback (no state)
                                                   │ not trusted: bounce ▼
/api/github/authorize (sets state cookie) ──► GitHub OAuth ──► /api/github/callback?code&state
   state matches cookie (timing-safe, single use)
   └► exchange code → short-lived user token → GET /user/installations (as that user)
      └► store only installations GitHub lists for this user; discard the user token
```

A claimed `installation_id` that isn't in GitHub's list is rejected and audited. Connecting a
repository sends only its GitHub id; the server looks it up through the user's installations,
so metadata can't be forged and inaccessible repositories can't be connected.

**D10 — Pull requests: GraphQL for lists, REST for files, diffs never stored.** The REST list
endpoint lacks additions/deletions/changed-file counts (one extra call per PR); a single GraphQL
query returns 50 PRs with all of them. The list is cached in PostgreSQL and refreshed at most
once a minute (or on demand); if GitHub fails, the cached list is shown with a warning. Changed
files and patches are fetched live via REST, classified by path (`classifyFile` in
`packages/shared`), and huge patches are truncated before reaching the browser.

**D11 — The analysis pipeline.** `POST /api/pull-requests/:id/analyses` creates an
`AnalysisRun` (202) and an in-process queue (2 at a time) runs it:

```
changed files (GitHub) ─► select: skip sensitive / generated / binary, redact secrets, token budget
repo tree at head SHA  ─► doc candidates (path rules) ─► fetch ─► rank by changed identifiers
                         └──────────────► prompt v1 (repository content fenced as <untrusted>)
AIProvider.generateJson (JSON schema) ─► retry: malformed output ×3, rate limit/timeout with backoff
Zod schema check ─► semantic check (doc path was provided? evidence file was changed?) ─► store
```

Every run stores provider, model, prompt version, schema version, tokens, latency, attempts,
cost (only if prices are configured) and an _input manifest_ of what was sent and skipped. If no
reviewable code or no docs exist, the model is not called. Runs cut off by a restart are marked
`INTERRUPTED` at startup (single-instance assumption; pg-boss if that changes). Starting runs is
rate-limited per user because each costs tokens.

**D12 — Review workflow.** Clients send an _action_ (`START_REVIEW`, `EDIT`, `REQUEST_CHANGES`,
`APPROVE`, `REJECT`, `REOPEN`), never a status; a pure, unit-tested state machine decides the next
status. Every write carries the `version` the reviewer saw and the update is conditional on it
(optimistic locking → `409 VERSION_CONFLICT` instead of a silent overwrite). The AI's
`originalContent` is never modified; each review row snapshots the content at that moment.
Prompt v2 asks for the complete updated file, so the review page can show an exact diff against
the document at the analysed commit and export a `git apply`-able patch. Nothing is written to
GitHub; `APPLIED`/`FAILED` are reserved for docs-PR creation in Phase 3.

**D14 — Several AI providers.** Besides Gemini's native API, one `OpenAICompatibleProvider`
covers every service that speaks OpenAI's Chat Completions format (Groq, OpenRouter, Cerebras,
OpenAI, a local Ollama), chosen by `AI_BASE_URL`. Both use JSON mode with the schema in the
system message, so behaviour is comparable; the pipeline, validation and evaluation don't change.
Motivation: free-tier quotas differ a lot, and measuring several models on the same cases is
more informative than one.

**D15 — Document selection by content (Phase 2.3).** Phase 1 chose the 15 documents to show the
model by filename, with an alphabetical tie-break; the real pull-request cases showed only 27% of
the documents that needed updating ever reached the model. Now every documentation file in the
repository is ranked by BM25 against the identifiers the pull request changed, with sub-word
tokenizing (`killDescendants` matches "kill descendants"), words appearing in over half the
repository's documents dropped as uninformative, history documents (changelogs, migration guides)
excluded, and the filename used only as a ±25% nudge. Measured on the same cases: 96% reach the
model (91% on the real ones), while _fewer_ documents are sent (2.2 vs 4.6 per pull request).
Ranking is plain TypeScript rather than PostgreSQL full-text search so the evaluation runs exactly
the code the app runs, and because identifiers need their own tokenizer. Reading every document
needs their content: `DocumentBlob` caches it by git blob SHA (a content hash), so each file is
downloaded once per repository and later analyses read the cache — proven by an integration test.

**D16 — Section-level documents (Phase 2.3b).** Prompt v2 sent each document whole and asked for
the whole file back. On real projects that failed at both ends: a 40 kB reference document arrived
truncated (and was then refused, because rewriting a half-read file would delete what the model
never saw), and when one did fit, the model ran out of output tokens mid-answer
(`AI_INVALID_OUTPUT`). Prompt v3 shows a long document as the sections that match the change,
each with its heading and the headings above it, and asks for ONE updated section back
(`scope: 'section'` + `sectionHeading`). The API splices it into the file with `replaceSection`,
which refuses unless the section still matches byte for byte, so nothing downstream changes: the
review page, the diff and the exported patch still work with complete documents, and a section the
model was not shown is dropped with a warning. Measured: every document that needed updating now
reaches the model (28 of 28, six as sections), and prompts got smaller.

**D17 — Section size, decided by measurement (Phase 2.4).** Showing a long document in parts raises
a question v3 left open: which parts? The answer needs ground truth for "the right part", and the
pull request has it — diffing each expected document as it was before and after the developer's own
edit gives the sections they touched (`npm run eval:anchors`, stored as `anchors` in each case, and
computed at import from then on). The evaluation reports a _section ceiling_ beside the document
one: a section that was never shown cannot be updated, whatever the model does. Because this needs
no model, `npm run eval:sections` sweeps the settings for nothing — the loop that chose 2 kB over
the original 6 kB (26 of 30 documents against 22, for 3% more prompt). Two findings from the same
sweep are recorded here because they are easy to get wrong: giving one document a larger allowance
buys sections by pushing other documents out of the prompt entirely, and simply enlarging the prompt
changes nothing while the per-document cap binds. The denominator is therefore every expected
document, not only the sectioned ones.

**D18 — Webhooks (Phase 3).** `POST /api/webhooks/github` is mounted before the JSON body parser
and reads the raw bytes, because the signature GitHub sends covers exactly what it sent:
re-serialising parsed JSON reorders nothing visible but changes the hash. The HMAC comparison is
timing-safe and happens before the payload is parsed at all. Every delivery is recorded by GitHub's
own `X-GitHub-Delivery` id, and the `outcome` column is what makes that guard safe to retry: a
delivery recorded but never finished (`received`, `failed`) may be processed again, while one that
completed is skipped — otherwise a crash halfway through would make an event permanently
unrepeatable. Anything the endpoint cannot use (a `ping`, a `labeled` action, an unreadable body) is
recorded with the reason and answered 2xx, because GitHub disables a webhook that keeps failing.
`GITHUB_WEBHOOK_SECRET` is deliberately not part of the all-or-nothing `GITHUB_APP_*` group: a
server can read pull requests long before webhooks are wired up, and without the secret the endpoint
answers 503 while everything else works. What the webhook does NOT do is start an analysis: that
spends the user's AI quota and writes suggestions against their documentation, so it stays a
decision someone makes. Keeping the cached pull request list fresh is the half that costs nothing.

**D19 — Documentation pull requests (Phase 3.3).** The only code that writes to a user's repository.
It builds ONE commit through git's object model (a blob per document, one tree, one commit, then the
branch) rather than calling the update-a-file endpoint per file, which would make a commit each time
and could leave a branch half-updated. The branch is DocDrift's own — `docdrift/pr-<n>` — so
force-updating it can never touch someone's work, and naming it after the pull request means one code
change has exactly one documentation pull request, however often it is analysed. It targets the pull
request's **own** branch, not the default branch, so merging puts the documentation alongside the
code change that made it necessary. What it refuses is as important as what it does: a suggestion
nobody approved, an analysis of a commit the branch has moved past (the suggestions may describe code
that no longer exists), and two approved suggestions for the same document (each holds a complete
file, so applying both would silently lose one). Suggestions are marked APPLIED only after the pull
request exists, so nothing is ever recorded as applied without somewhere to point at. Reaching this
endpoint requires a signed-in person pressing a button; no webhook or schedule leads to it.

Because every attempt commits on the pull request's head rather than on the previous documentation
commit, the plan must always describe the **whole** branch, so a suggestion already APPLIED still
counts as approved when planning. Integration tests found this: the first version planned only
APPROVED suggestions, which made the second attempt refuse with NOTHING_APPROVED — and had that
refusal not been there, the second commit would have carried one file on a fresh parent and silently
removed the documents committed first. The branch therefore always equals "everything approved right
now", which also means rejecting something and re-running correctly takes it back off the branch.

The branch was first named `docdrift/pr-<n>-<run>`, one per analysis run, so that two runs could
never overwrite each other. Using it against a real repository revealed the cost: six analyses of one
pull request left six open documentation pull requests proposing competing rewrites of the same file,
which is noise for whoever reviews that repository. It is now one branch per pull request, and the
accepted trade-off is that a later run REPLACES what an earlier one proposed — the branch holds the
most recent analysis's approved output, not the union of every analysis. Because that silently changes
an open pull request, the panel says so before the button is pressed rather than after.

Verified against real GitHub, not only against the test double: a pull request opened from the UI onto
`docdrift/pr-1`, and `scripts/github-probe-ref.ts` (`npm run github:probe-ref`) confirming that GitHub
accepts the percent-encoded ref path `setBranch` builds — `git/ref/heads%2Fdocdrift%2Fpr-1`. That last
one needed its own probe precisely because the fake was written to match what our code sends, so it
would have agreed with the encoding whether or not GitHub did.

**D20 — One service, one origin (Phase 4).** The deployed API also serves the built web app
(`webDist` in `createApp`), rather than a static host proxying `/api/*` to a separate API service.
The reason is the session cookie: on one origin it is plainly first-party, with no rewrite rule to
get right and no CORS exception, which is the part of a split deployment most likely to break
silently as browsers tighten third-party cookie rules (risk R3). It also removes the one value a
blueprint cannot express — the other service's URL, which does not exist until that service is
created. The single-page fallback is mounted AFTER the API routes and their 404 handler, so an
unknown `/api/...` path still answers JSON rather than the app shell; `test/static-web.test.ts` pins
that boundary, because getting it wrong gives clients HTML where they expect an error.

Two production-only defects surfaced by running the built server rather than trusting it. Helmet
sends `script-src 'self'`, which blocks inline scripts: the theme script that ran before first paint
to avoid a flash was inline in `index.html`, so it was silently refused in every deployed build and
never in development. It now lives in `public/theme.js`. And `index.html` must be served with
`no-cache` while the hashed assets beside it are cached for a year — the reverse leaves a browser
holding an old shell that asks for assets a deploy has already replaced.

**D13 — Evaluation.** `npm run eval` runs the same `runPipeline` as the app (context selection,
prompt, retries, validation), only reading repositories from `eval/cases` instead of GitHub, so it
measures what users get. Cases are small repositories (`head/` + the changed files' `base/`) with
labels: which documents must change, which are _acceptable_ either way, and strings the suggestion
must (not) contain. Scoring is per document, micro-averaged, with 95% Wilson intervals because the
dataset is small; errors count as misses. A no-AI keyword baseline runs on the same cases, so the
model's numbers have a reference point. Reports (Markdown + full JSON answers) are committed under
`eval/reports`; synthetic data is labelled as such in every report.

## Technical risks and how we handle them

| #   | Risk                                                                                                                    | Mitigation                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Large PRs exceed the model's context / cost budget                                                                      | Filter lockfiles, generated & binary files; per-file and total token budgets; record skipped files in `inputManifest` and surface them as warnings            |
| R2  | Secrets in diffs sent to a third-party LLM                                                                              | Never send `.env*`, key/cert files; regex redaction of common secret patterns before sending; users only connect repos they choose; documented in Limitations |
| R3  | Cross-site cookies: web on Vercel, API on Render = different sites, and browsers increasingly block third-party cookies | Vercel `rewrites` proxy `/api/*` to the API so cookies are first-party (`SameSite=Lax`). Same pattern as the Vite dev proxy                                   |
| R4  | LLM returns invalid JSON / hallucinated paths                                                                           | Structured outputs + Zod + semantic validation; bounded retries (max 2) on _malformed_ output only; timeouts                                                  |
| R5  | Free-tier hosts sleep or have short-lived databases                                                                     | Health check, clear cold-start UX; check each provider's current free-tier terms before deploying                                                             |
| R6  | GitHub rate limits (5k req/h per installation)                                                                          | Cache PR metadata in DB, conditional requests (ETag) later, respect `retry-after`                                                                             |
| R7  | Duplicate analysis runs (double clicks, webhook retries)                                                                | Reject a new run if one is `QUEUED/RUNNING` for the same PR + `headSha` (checked in a transaction); webhook `delivery_id` unique (Phase 3)                    |
| R8  | "Accuracy" claims without evidence                                                                                      | Only report metrics computed by the evaluation script against the labelled dataset in `eval/`                                                                 |

## Decisions still needed from you

1. **LLM provider** for the first implementation (OpenAI, Anthropic or Google Gemini).
   The code is provider-agnostic; this only decides which adapter we write first and
   which API key you need. Pick the one you have credits for.
2. **A test repository** on your GitHub account with a README and a few code files —
   we'll open realistic PRs against it for development and for the evaluation dataset.
