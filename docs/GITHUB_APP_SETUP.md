# GitHub App setup (local development)

DocDrift talks to GitHub as a **GitHub App**. You create your own app once; it takes about
10 minutes. GitHub's screens change occasionally, so labels may differ slightly.

## Why a GitHub App (and not a personal access token)?

- **Least privilege:** read-only access to the repositories _you_ pick, nothing else.
- **No stored tokens:** the server holds a private key and mints one-hour tokens on demand.
  No GitHub token is ever written to the database.
- **Acts as itself:** actions show as the app, not as you.

## 1. Create the app

GitHub → your profile picture → **Settings** → **Developer settings** → **GitHub Apps** →
**New GitHub App**.

| Field                                                  | Value                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| GitHub App name                                        | `docdrift-dev-<your-github-username>` (must be unique on GitHub) |
| Homepage URL                                           | `http://localhost:5173`                                          |
| Callback URL                                           | `http://localhost:5173/api/github/callback`                      |
| Expire user authorization tokens                       | ✅ checked                                                       |
| Request user authorization (OAuth) during installation | ✅ **checked** (important — see below)                           |
| Enable Device Flow                                     | ☐ unchecked                                                      |
| Setup URL                                              | leave empty (GitHub disables it when the box above is checked)   |
| Webhook → Active                                       | ☐ **unchecked** (webhooks arrive in Phase 3)                     |

**Permissions → Repository permissions:**

| Permission    | Access                                        |
| ------------- | --------------------------------------------- |
| Contents      | Read-only                                     |
| Pull requests | Read-only                                     |
| Metadata      | Read-only (GitHub selects this automatically) |

Leave every other permission as **No access**, including all _Account permissions_.

**Where can this GitHub App be installed?** → **Only on this account**.

Click **Create GitHub App**.

> Why "Request user authorization during installation"? After someone installs the app,
> GitHub redirects back with an `installation_id` in the URL — and GitHub's own docs warn
> that this value can be spoofed. With this option on, GitHub also sends a one-time `code`
> that DocDrift exchanges for a short-lived _user_ token, asks GitHub "which installations
> can this user access?", and only accepts those. The user token is then discarded.

## 2. Collect the credentials

On the app's settings page (**General**):

1. **App ID** — a number near the top.
2. **Client ID** — starts with `Iv`.
3. **Client secrets → Generate a new client secret** — copy it immediately; GitHub shows
   it only once.
4. **Private keys → Generate a private key** — a `.pem` file downloads.
5. The **slug** is the last part of the app's public URL, e.g.
   `https://github.com/apps/docdrift-dev-prem` → `docdrift-dev-prem`.

## 3. Store the private key safely

Keep it **outside** the project folder, readable only by you:

```bash
mkdir -p ~/.docdrift
mv ~/Downloads/docdrift-dev-*.private-key.pem ~/.docdrift/docdrift-dev.private-key.pem
chmod 600 ~/.docdrift/docdrift-dev.private-key.pem
```

Never commit it, paste it into chat, or put it in the web app. (`*.pem` is in `.gitignore`
as a safety net.) If it ever leaks, delete it on the app's settings page and generate a new one.

## 4. Configure the API

Add to `apps/api/.env` (not `.env.example`):

```bash
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=docdrift-dev-yourname
GITHUB_APP_CLIENT_ID=Iv23li...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_APP_PRIVATE_KEY_BASE64=...
```

Get the one-line base64 value of the key with:

```bash
base64 -i ~/.docdrift/docdrift-dev.private-key.pem | tr -d '\n'
```

## 5. Verify

```bash
npm run github:check -w @docdrift/api
```

It authenticates to the real GitHub API as your app and checks the ID, slug and
permissions. It prints no secrets. "Not installed anywhere yet" is expected at this stage.

## Production later (Phase 4)

Create a **separate** app for production (its own key and secret), with the deployed URLs
as Homepage and Callback URL. Development and production credentials are never shared.
