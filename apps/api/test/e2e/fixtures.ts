/**
 * Data shared by the E2E API server and the Playwright tests, so both sides
 * agree on names without duplicating strings.
 */
export const E2E = {
  owner: 'e2e-owner',
  repo: 'task-api',
  installationId: 111,
  /** The fake GitHub accepts this OAuth code for the e2e user. */
  oauthCode: 'e2e-oauth-code',
  prs: {
    /** The AI finds drift in README.md. */
    drift: { number: 1, title: 'Rename done to completed' },
    /** The AI finds nothing to update. */
    clean: { number: 2, title: 'Switch console logging to the logger' },
    /** The AI never returns valid output: the run fails with AI_INVALID_OUTPUT. */
    broken: { number: 3, title: 'Raise the cache TTL' },
  },
} as const;

/** The "## Caching" section exists so the cache pull request also has a document to match. */
const CACHING =
  '\n\n## Caching\n\nResponses are cached; `ttl` in `src/cache.js` sets for how long.\n';

export const README =
  '# Task API\n\nA tiny task list API.\n\n## Tasks\n\nEach task looks like `{ "id": 1, "done": false }`.\n\n`POST /tasks/:id/done` marks a task as done.' +
  CACHING;

export const README_UPDATED =
  '# Task API\n\nA tiny task list API.\n\n## Tasks\n\nEach task looks like `{ "id": 1, "completed": false }`.\n\n`POST /tasks/:id/done` marks a task as completed.' +
  CACHING;
