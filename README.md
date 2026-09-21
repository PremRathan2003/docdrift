# DocDrift — AI Code Intelligence & Documentation Platform

DocDrift analyses GitHub pull requests, identifies documentation that may no longer match
the code, and drafts documentation updates that a human reviews before anything changes.

> **Status: Phase 1, milestone 1.1 (scaffold).** What works today: monorepo, validated
> config, structured logging, `/api/health` with a real database check, landing page
> showing live API status, dark/light theme, Phase 1 database schema, CI.
> Nothing else is implemented yet — see [docs/ROADMAP.md](docs/ROADMAP.md).

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

## Limitations

AI-generated analysis can be wrong. Confidence values are the model's own estimate, not a
calibrated probability. Every suggestion requires human review. Parts of a PR diff are sent
to the configured LLM provider — only connect repositories you're allowed to share with it.

## Deployment · Screenshots · Demo

Added in Phase 4. Demo link: _TBD_.
