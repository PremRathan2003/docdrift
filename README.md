# DocDrift — AI Code Intelligence & Documentation Platform

DocDrift analyses GitHub pull requests, identifies documentation that may no longer match
the code, and drafts documentation updates that a human reviews before anything changes.

> **Status: Phases 1–3 largely complete.** DocDrift connects to a GitHub App, reads a pull
> request, works out which documentation the change made out of date, drafts the updates,
> and — once a person approves them — opens a documentation pull request on the repository.
> A webhook keeps pull requests current. Every claim below about accuracy comes from
> [the evaluation](#what-the-evaluation-says), not from impressions.
> Remaining: a job queue (3.2), deployment and polish (Phase 4). See [docs/ROADMAP.md](docs/ROADMAP.md).

## What it does

1. **Reads the pull request** — the diff, and every documentation file in the repository.
2. **Chooses what to show the model** — BM25 over the text of all documents, and for a long
   reference file, the sections that match the change rather than the whole thing.
3. **Asks for specific updates** — each recommendation must cite a changed file as evidence and
   rewrite one section, which the API splices back into the complete document.
4. **Validates the answer** — schema, then semantics: invented paths, evidence that isn't in the
   diff, and sections that were never shown are dropped with a warning rather than displayed.
5. **Waits for a person** — diff against the current file, edit in Monaco, approve or reject.
6. **Opens a pull request** with only the approved changes, into the branch of the pull request
   that caused the drift, so documentation lands with the code.

## What the evaluation says

`npm run eval` scores the pipeline on 42 labelled cases — 26 written by hand, 16 rebuilt from
merged pull requests in pydantic, execa, click, fastify, commander and httpx, where the developer's
own documentation edit is the ground truth ([how they are built](eval/README.md)).

Most recent full run (gemini-3.5-flash-lite, prompt v3.2):

| | precision | recall | cases exactly right |
| --- | --- | --- | --- |
| synthetic (26) | 100% | 100% | 26 of 26 |
| real pull requests (16) | 94% | 63%¹ | 6 of 16 |

¹ Measured over three runs (60%, 63%, 67%), because single runs of a model vary by more than the
changes being measured — an early version of this project drew a conclusion from one run and had to
retract it.

Two numbers mattered more than the headline ones while building it:

- **Documents reaching the model: 27% → 98%.** Filename heuristics were replaced with content
  ranking; this was the binding constraint for two milestones and no prompt work would have moved it.
- **The right *section* reaching the model: 56% → 81%**, by cutting long documents into 2 kB pieces
  instead of 6 kB. Chosen by `npm run eval:sections`, which measures it against the sections the
  developers actually edited — without calling a model, so the setting was picked from evidence
  rather than intuition.

The evaluation also found four real bugs, including a suggestion that would have written the
prompt's line numbers into a README, and a matcher that silently discarded correct answers.
Reports for every run are committed under `eval/reports/`.

## Architecture

React SPA → same-origin `/api` → Express API → PostgreSQL, GitHub App, LLM provider.
Details, decisions and risks: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Database design: [docs/DATABASE.md](docs/DATABASE.md).

## Tech stack

**Web:** React 19, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query
**API:** Node 22, Express 5, TypeScript, Zod, Prisma 7, pino
**DB:** PostgreSQL 16 (pgvector image, used from Phase 2)
**Testing:** Vitest, Supertest, Playwright

## Local setup

Prerequisites: Node 22+, Docker Desktop (or any local PostgreSQL 16).

```bash
npm install                              # also generates the Prisma client
cp apps/api/.env.example apps/api/.env   # then set SESSION_SECRET (command in the file)
npm run db:up                            # start Postgres in Docker
npm run db:migrate -- --name init        # create + apply the first migration
npm run db:seed                          # optional demo user
npm run dev                              # shared (watch) + API :4000 + web :5173
```

Open http://localhost:5173 — the landing page should show **API ok**.
Or: `curl http://localhost:4000/api/health`.

## GitHub integration setup

Create your own development GitHub App and configure it: [docs/GITHUB_APP_SETUP.md](docs/GITHUB_APP_SETUP.md).
Then verify it with `npm run github:check -w @docdrift/api`. Without it the app still runs;
GitHub features are simply unavailable.

## AI provider setup

Gemini is the first provider: [docs/AI_SETUP.md](docs/AI_SETUP.md). Verify with
`npm run ai:check -w @docdrift/api`. Without it the app runs; analysis is simply unavailable.

## Sandbox repository

`tools/seed-sandbox.sh` fills a test repository (e.g. your `docdrift-sandbox`) with a small
Express API, its docs, and three branches whose pull requests exercise DocDrift: an API change
that leaves the README stale, a pure refactor, and a renamed config variable.

```bash
git clone https://github.com/<you>/docdrift-sandbox.git ~/docdrift-sandbox
bash tools/seed-sandbox.sh ~/docdrift-sandbox
```

## Scripts

| Command                    | What it does                                                              |
| -------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`              | Run everything in watch mode                                              |
| `npm test`                 | Unit tests (no network, no database, no real LLM)                         |
| `npm run test:integration` | API tests against the `_test` database                                    |
| `npm run test:e2e`         | Browser tests of the whole flow (fake GitHub + scripted AI)               |
| `npm run eval`             | Score the AI on the labelled cases in `eval/` ([details](eval/README.md)) |
| `npm run eval:sections`    | Sweep document-chunking settings against the developers' own edits (no model, no cost) |
| `npm run eval:import`      | Turn a merged public pull request into a labelled case                    |
| `npm run check`            | Lint + format check + typecheck + tests (what CI runs)                    |
| `npm run build`            | Production builds of all packages                                         |
| `npm run db:migrate`       | Create/apply a migration after editing `schema.prisma`                    |

## Testing

- **Unit tests** (`npm test`) need nothing running.
- **Integration tests** (`npm run test:integration`) use a separate database whose name must
  end in `_test`, because every run wipes it. Create it once:

  ```bash
  psql -d postgres -c "CREATE DATABASE docdrift_test OWNER docdrift;"
  ```

  and set `DATABASE_URL_TEST` in `apps/api/.env` (see `.env.example`). Each run rebuilds the
  schema from the committed migrations, so the tests also prove the migrations work.

- **End-to-end tests** (`npm run test:e2e`) drive a real Chromium through the real web app
  and API: register, connect GitHub, analyse pull requests, edit, approve, reject, reopen,
  a stale-tab conflict and the patch download. GitHub and the AI are deterministic fakes
  (`apps/api/test/e2e/server.ts`), so they're free and need no secrets. They use the same
  `_test` database. First time only: `npx playwright install chromium`. To watch them run:
  `npm run test:e2e:ui`.

- No test ever calls GitHub or an LLM provider. Live integration tests, when added, will be
  a separate, opt-in command.

## Environment variables

API (`apps/api/.env`): see [`apps/api/.env.example`](apps/api/.env.example). The web app has
no secrets; anything prefixed `VITE_` would be public, so secrets never go there.

## Security notes

- Sessions: random 256-bit token in an httpOnly, SameSite=Lax cookie (`__Host-` + Secure in
  production); the database stores only an HMAC of it.
- Passwords: scrypt (N=2^15, r=8, p=3), upgraded automatically on login if parameters change.
- CSRF: SameSite cookies plus an `Origin` check on every state-changing request.
- Brute force: per-IP limit on `/login` and `/register` (20 per 15 min) and per-account lock
  after 5 failed logins (15 min). Both return `429` with `Retry-After`.
- Audit log: register, login success/failure (with reason) and logout events.

## Limitations

- Rate-limit counters live in memory: they reset on restart and aren't shared between server
  instances. Fine for a single instance; a shared store (PostgreSQL/Redis) is needed to scale out.
- Registering with an existing email returns `409 EMAIL_TAKEN`, which reveals that the account
  exists (a deliberate usability trade-off, slowed down by the rate limit).
- Audit writes are best-effort: a failed audit write is logged but doesn't fail the request.
- AI-generated analysis can be wrong. Confidence values are the model's own estimate, not a
  calibrated probability. Every suggestion requires human review. Parts of a PR diff are sent
  to the configured LLM provider — only connect repositories you're allowed to share with it.
- **It misses things.** On real pull requests it finds roughly two thirds of the documents a
  developer updated. Most of what it misses is the same drift written in a second place, or a
  document that is still accurate but no longer complete. Treat a quiet result as "nothing found",
  not "nothing to find".
- Two known retrieval gaps, both measured: a reference table with no internal headings cannot be
  split into sections sensibly (fastify's error table), and document ranking occasionally misses a
  file entirely. `npm run eval:sections` reports both.

## Webhooks

`POST /api/webhooks/github` verifies GitHub's signature over the raw body (timing-safe, before
parsing), records every delivery by its id so redeliveries do no work twice — while still allowing
a delivery that failed halfway to be retried — and keeps the cached pull requests current.
It deliberately does **not** start an analysis: that spends AI quota and writes suggestions against
someone's documentation, so it stays a decision a person makes.

## Deployment · Screenshots · Demo

Added in Phase 4. Demo link: _TBD_.
