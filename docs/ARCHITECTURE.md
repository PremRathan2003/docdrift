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
