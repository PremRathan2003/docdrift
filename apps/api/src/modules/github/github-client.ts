/**
 * A deliberately small GitHub REST client on top of fetch.
 *
 * Why not Octokit? It's excellent, but we only need a handful of endpoints,
 * and owning these ~150 lines makes timeouts, retries and rate-limit handling
 * explicit (and explainable). If the list of endpoints grows a lot, switching
 * to Octokit is a reasonable later decision.
 */

export const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_PAGES = 10;

export type GitHubErrorCode =
  | 'GITHUB_UNAUTHORIZED' // bad/expired credentials
  | 'GITHUB_FORBIDDEN' // app lacks a permission
  | 'GITHUB_NOT_FOUND' // missing, or no access (GitHub hides private repos as 404)
  | 'GITHUB_RATE_LIMITED'
  | 'GITHUB_UNAVAILABLE' // 5xx, timeout, network
  | 'GITHUB_BAD_RESPONSE';

export class GitHubError extends Error {
  constructor(
    public readonly code: GitHubErrorCode,
    message: string,
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface GitHubRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Path like "/repos/o/r" or a full URL (used for pagination links). */
  path: string;
  /** Installation token, user token or app JWT. */
  token?: string;
  body?: unknown;
  timeoutMs?: number;
}

export interface GitHubResponse<T> {
  data: T;
  headers: Headers;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rateLimitError(res: Response): GitHubError | null {
  // Secondary rate limits send Retry-After; primary limits send remaining=0 + reset.
  const retryAfter = Number(res.headers.get('retry-after'));
  if (retryAfter > 0) {
    return new GitHubError(
      'GITHUB_RATE_LIMITED',
      'GitHub rate limit reached',
      res.status,
      retryAfter,
    );
  }
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const wait = reset ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : 60;
    return new GitHubError('GITHUB_RATE_LIMITED', 'GitHub rate limit reached', res.status, wait);
  }
  return null;
}

function errorFor(res: Response, message: string): GitHubError {
  if (res.status === 401) return new GitHubError('GITHUB_UNAUTHORIZED', message, 401);
  if (res.status === 403 || res.status === 429) {
    return rateLimitError(res) ?? new GitHubError('GITHUB_FORBIDDEN', message, res.status);
  }
  if (res.status === 404) return new GitHubError('GITHUB_NOT_FOUND', message, 404);
  if (res.status >= 500) return new GitHubError('GITHUB_UNAVAILABLE', message, res.status);
  return new GitHubError('GITHUB_BAD_RESPONSE', message, res.status);
}

export function createGitHubClient({ fetchImpl = fetch, userAgent = 'docdrift' } = {}) {
  async function request<T>(req: GitHubRequest): Promise<GitHubResponse<T>> {
    const method = req.method ?? 'GET';
    const url = req.path.startsWith('https://') ? req.path : `${GITHUB_API}${req.path}`;
    if (!url.startsWith(`${GITHUB_API}/`)) {
      // Never send our tokens anywhere except api.github.com (e.g. a tampered pagination link).
      throw new GitHubError('GITHUB_BAD_RESPONSE', 'Refusing to call a non-GitHub URL');
    }
    // Only idempotent reads are retried, and only on transient failures.
    const attempts = method === 'GET' ? 2 : 1;

    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method,
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': API_VERSION,
            'User-Agent': userAgent,
            ...(req.token ? { Authorization: `Bearer ${req.token}` } : {}),
            ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
          signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
      } catch (err) {
        if (attempt < attempts) {
          await sleep(300 * attempt);
          continue;
        }
        const timedOut = err instanceof Error && err.name === 'TimeoutError';
        throw new GitHubError(
          'GITHUB_UNAVAILABLE',
          timedOut ? 'GitHub request timed out' : 'Could not reach GitHub',
        );
      }

      if (res.status >= 500 && attempt < attempts) {
        await sleep(300 * attempt);
        continue;
      }

      if (!res.ok) {
        let message = `GitHub responded ${res.status}`;
        try {
          const body = (await res.json()) as { message?: unknown };
          if (typeof body.message === 'string') message = `${message}: ${body.message}`;
        } catch {
          // ignore non-JSON error bodies
        }
        throw errorFor(res, message);
      }

      if (res.status === 204) return { data: undefined as T, headers: res.headers };
      try {
        return { data: (await res.json()) as T, headers: res.headers };
      } catch {
        throw new GitHubError('GITHUB_BAD_RESPONSE', 'GitHub returned invalid JSON', res.status);
      }
    }
  }

  /**
   * Follows RFC 5988 `Link: <…>; rel="next"` headers. `pick` extracts the
   * array from each page (some endpoints wrap it, e.g. { repositories: [...] }).
   * Capped at MAX_PAGES so one huge account can't make a request run forever.
   */
  async function paginate<Page, Item>(
    req: GitHubRequest,
    pick: (page: Page) => Item[],
  ): Promise<Item[]> {
    const items: Item[] = [];
    let path: string | null = req.path.includes('?')
      ? `${req.path}&per_page=100`
      : `${req.path}?per_page=100`;
    for (let page = 0; path && page < MAX_PAGES; page++) {
      const { data, headers }: GitHubResponse<Page> = await request<Page>({ ...req, path });
      items.push(...pick(data));
      path = /<([^>]+)>;\s*rel="next"/.exec(headers.get('link') ?? '')?.[1] ?? null;
    }
    return items;
  }

  return { request, paginate };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;
