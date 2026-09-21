# DocDrift — AI Code Intelligence & Documentation Platform

DocDrift analyses GitHub pull requests, identifies documentation that may no longer match
the code, and drafts documentation updates that a human reviews before anything changes.

> **Status: Phase 1, milestone 1.3 (GitHub repositories) complete.** Working today: accounts
> (register, sign in/out, rate limiting, audit log), connecting GitHub through a GitHub App with
> verified installations, choosing repositories to connect, `/api/health`, dark/light theme, CI.
> Not built yet: pull request views, AI analysis, review workflow — see [docs/ROADMAP.md](docs/ROADMAP.md).

## Architecture

React SPA → same-origin `/api` → Express API → PostgreSQL, GitHub App, LLM provider.
Details, decisions and risks: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Database design: [docs/DATABASE.md](docs/DATABASE.md).

## Tech stack

**Web:** React 19, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query
**API:** Node 22, Express 5, TypeScript, Zod, Prisma 7, pino
**DB:** PostgreSQL 16 (pgvector image, used from Phase 2)
**Testing:** Vitest, Supertest (Playwright from milestone 1.7)

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

## Scripts

| Command              | What it does                                                   |
| -------------------- | -------------------------------------------------------------- |
| `npm run dev`        | Run everything in watch mode                                   |
| `npm test`           | Unit + integration tests (no network, no real DB, no real LLM) |
| `npm run check`      | Lint + format check + typecheck + tests (what CI runs)         |
| `npm run build`      | Production builds of all packages                              |
| `npm run db:migrate` | Create/apply a migration after editing `schema.prisma`         |

## Testing

- **Unit tests** (`npm test`) need nothing running.
- **Integration tests** (`npm run test:integration`) use a separate database whose name must
  end in `_test`, because every run wipes it. Create it once:

  ```bash
  psql -d postgres -c "CREATE DATABASE docdrift_test OWNER docdrift;"
  ```

  and set `DATABASE_URL_TEST` in `apps/api/.env` (see `.env.example`). Each run rebuilds the
  schema from the committed migrations, so the tests also prove the migrations work.

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

## Deployment · Screenshots · Demo

Added in Phase 4. Demo link: _TBD_.
