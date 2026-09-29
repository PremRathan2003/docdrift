# Deployment

DocDrift deploys as **one Render web service plus one Postgres database**. The
service serves the API and the built web app together, so the browser stays on a
single origin and the session cookie is first-party — no proxy rewrite, no CORS
exception, nothing that breaks when a browser tightens its third-party cookie
rules (`docs/ARCHITECTURE.md`, risk R3).

Everything below is described by `render.yaml` in the repository root. Render
reads it and creates both resources; the only things typed by hand are secrets
and the service's own URL.

## What you need first

- A Render account
- The repository pushed to GitHub
- Your Gemini API key
- The GitHub App values already in `apps/api/.env`

## 1. Create the services

In Render: **New → Blueprint**, choose the `docdrift` repository, apply.

Render reads `render.yaml`, creates `docdrift-db` and `docdrift`, and asks for
every value marked `sync: false`. Fill in what you can now:

| Variable                        | Where it comes from                          |
| ------------------------------- | -------------------------------------------- |
| `AI_API_KEY`                    | Google AI Studio                             |
| `GITHUB_APP_ID`                 | `apps/api/.env`                              |
| `GITHUB_APP_SLUG`               | `apps/api/.env`                              |
| `GITHUB_APP_CLIENT_ID`          | `apps/api/.env`                              |
| `GITHUB_APP_CLIENT_SECRET`      | `apps/api/.env`                              |
| `GITHUB_APP_PRIVATE_KEY_BASE64` | `apps/api/.env` — one long line, no newlines |
| `GITHUB_WEBHOOK_SECRET`         | `apps/api/.env`, or leave empty for now      |

Leave `WEB_ORIGIN` blank for the moment: it is this service's own URL, which
Render has not assigned yet.

The first build will **fail**, because the API refuses to start without
`WEB_ORIGIN`. That is the intended behaviour — a missing setting stops the
server rather than producing something subtly wrong at runtime.

## 2. Set WEB_ORIGIN

Once the service exists, Render shows its URL at the top of the page, something
like `https://docdrift-xxxx.onrender.com`.

Set `WEB_ORIGIN` to exactly that, with `https://` and **no trailing slash**, then
deploy again. This time it should start.

## 3. Point the GitHub App at the deployed URL

The App still refers to `localhost`. In **Settings → Developer settings → GitHub
Apps → your app**, replace both, using your Render URL:

- **Callback URL** → `https://<your-render-url>/api/github/callback`
- **Webhook URL** → `https://<your-render-url>/api/github/webhooks`

Sign-in through GitHub fails with a redirect-URI mismatch until the callback URL
matches.

## 4. Check it

| Check                      | Expected                                    |
| -------------------------- | ------------------------------------------- |
| `https://<url>/api/health` | `{"status":"ok", ...}`                      |
| `https://<url>/`           | the DocDrift landing page                   |
| Register, then sign in     | lands on the dashboard                      |
| Connect GitHub             | the installation page, then back to the app |
| Run an analysis            | a suggestion appears                        |

If health says `degraded`, the database is unreachable — check `DATABASE_URL` is
bound to `docdrift-db` under the service's Environment tab.

## What the free plan actually means

Worth knowing before putting the link on a CV:

- **The service sleeps after 15 minutes of inactivity.** The next request wakes
  it, which takes roughly 50 seconds. A reviewer clicking a cold link sees a
  blank page for almost a minute. Warn them in the README, or keep the service
  awake with an uptime pinger.
- **A free Postgres database is deleted after 30 days.** Not paused — deleted.
  Diary it, and upgrade or re-create before then.
- **An analysis running when the service sleeps is cut off.** On the next start
  those runs are marked failed rather than left pretending to run
  (`failInterruptedRuns`), so nothing is silently lost — but the analysis has to
  be started again.

## Deploying a change

Push to `main`. Render rebuilds and runs `prisma migrate deploy` before the new
version accepts traffic. Committed migrations are applied; nothing is generated
or reset on the server.
