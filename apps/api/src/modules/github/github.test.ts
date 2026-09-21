import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../config/env.js';
import { createAppJwt } from './app-jwt.js';
import { loadGitHubConfig } from './config.js';
import { createGitHubClient, GitHubError } from './github-client.js';
import { createInstallationTokenProvider } from './installation-tokens.js';
import { exchangeCodeForUserToken, listUserInstallations } from './user-oauth.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function fakeFetch(...handlers: Handler[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const handler = handlers[Math.min(calls.length - 1, handlers.length - 1)]!;
    return handler(String(url), init);
  });
  return { fetchImpl: fn as unknown as typeof fetch, calls };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('createAppJwt', () => {
  it('produces an RS256 JWT with the claims GitHub requires', () => {
    const now = Date.UTC(2026, 0, 1);
    const jwt = createAppJwt('Iv23liABC', privateKey, now);
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    const claims = JSON.parse(Buffer.from(p!, 'base64url').toString());
    expect(claims).toEqual({ iss: 'Iv23liABC', iat: now / 1000 - 60, exp: now / 1000 + 540 });
    expect(
      verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s!, 'base64url')),
    ).toBe(true);
  });
});

describe('GitHub config', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    WEB_ORIGIN: 'http://localhost:5173',
    SESSION_SECRET: 'x'.repeat(32),
  };
  const pemB64 = Buffer.from(privateKey.export({ type: 'pkcs1', format: 'pem' })).toString(
    'base64',
  );
  const full = {
    ...base,
    GITHUB_APP_ID: '123',
    GITHUB_APP_SLUG: 'docdrift-dev',
    GITHUB_APP_CLIENT_ID: 'Iv23li',
    GITHUB_APP_CLIENT_SECRET: 'secret',
    GITHUB_APP_PRIVATE_KEY_BASE64: pemB64,
  };

  it('is optional: no variables means GitHub is off', () => {
    expect(loadGitHubConfig(loadEnv(base))).toBeNull();
    expect(loadGitHubConfig(loadEnv({ ...base, GITHUB_APP_ID: '' }))).toBeNull();
  });

  it('requires the whole group once any variable is set', () => {
    expect(() => loadEnv({ ...base, GITHUB_APP_ID: '123' })).toThrow(
      /GITHUB_APP_CLIENT_SECRET: required/,
    );
  });

  it('parses the base64 private key and rejects a broken one', () => {
    expect(loadGitHubConfig(loadEnv(full))?.privateKey.asymmetricKeyType).toBe('rsa');
    expect(() =>
      loadGitHubConfig(loadEnv({ ...full, GITHUB_APP_PRIVATE_KEY_BASE64: 'bm90IGEga2V5' })),
    ).toThrow(/not a valid base64-encoded PEM/);
  });
});

describe('GitHub client', () => {
  it('sends the standard headers and the token', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(200, { id: 1 }));
    const { data } = await createGitHubClient({ fetchImpl }).request<{ id: number }>({
      path: '/app',
      token: 't0k',
    });
    expect(data).toEqual({ id: 1 });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(calls[0]!.url).toBe('https://api.github.com/app');
    expect(headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: 'Bearer t0k',
    });
  });

  it('retries a GET once on a 5xx, but never retries a POST', async () => {
    const get = fakeFetch(
      () => json(503, {}),
      () => json(200, { ok: true }),
    );
    await expect(
      createGitHubClient({ fetchImpl: get.fetchImpl }).request({ path: '/x' }),
    ).resolves.toBeTruthy();
    expect(get.calls).toHaveLength(2);

    const post = fakeFetch(() => json(503, {}));
    await expect(
      createGitHubClient({ fetchImpl: post.fetchImpl }).request({ method: 'POST', path: '/x' }),
    ).rejects.toMatchObject({ code: 'GITHUB_UNAVAILABLE' });
    expect(post.calls).toHaveLength(1);
  });

  it('maps status codes to error codes', async () => {
    const cases: [number, Record<string, string>, string][] = [
      [401, {}, 'GITHUB_UNAUTHORIZED'],
      [403, {}, 'GITHUB_FORBIDDEN'],
      [404, {}, 'GITHUB_NOT_FOUND'],
      [
        403,
        {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120),
        },
        'GITHUB_RATE_LIMITED',
      ],
      [429, { 'retry-after': '30' }, 'GITHUB_RATE_LIMITED'],
    ];
    for (const [status, headers, code] of cases) {
      const { fetchImpl } = fakeFetch(() => json(status, { message: 'nope' }, headers));
      await expect(
        createGitHubClient({ fetchImpl }).request({ path: '/x' }),
        `${status}`,
      ).rejects.toMatchObject({ code });
    }
    const { fetchImpl } = fakeFetch(() => json(429, {}, { 'retry-after': '30' }));
    const err = await createGitHubClient({ fetchImpl })
      .request({ path: '/x' })
      .catch((e: GitHubError) => e);
    expect((err as GitHubError).retryAfterSeconds).toBe(30);
  });

  it('turns network failures and timeouts into GITHUB_UNAVAILABLE', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const { fetchImpl } = fakeFetch(() => {
      throw timeout;
    });
    await expect(createGitHubClient({ fetchImpl }).request({ path: '/x' })).rejects.toMatchObject({
      code: 'GITHUB_UNAVAILABLE',
      message: 'GitHub request timed out',
    });
  });

  it('follows pagination links and never sends tokens to other hosts', async () => {
    const { fetchImpl, calls } = fakeFetch(
      () => json(200, { items: [1, 2] }, { link: '<https://api.github.com/x?page=2>; rel="next"' }),
      () => json(200, { items: [3] }),
    );
    const client = createGitHubClient({ fetchImpl });
    expect(
      await client.paginate<{ items: number[] }, number>({ path: '/x' }, (p) => p.items),
    ).toEqual([1, 2, 3]);
    expect(calls[0]!.url).toBe('https://api.github.com/x?per_page=100');

    const evil = fakeFetch(() =>
      json(200, { items: [1] }, { link: '<https://evil.example/steal>; rel="next"' }),
    );
    await expect(
      createGitHubClient({ fetchImpl: evil.fetchImpl }).paginate<{ items: number[] }, number>(
        { path: '/x', token: 'secret' },
        (p) => p.items,
      ),
    ).rejects.toMatchObject({ code: 'GITHUB_BAD_RESPONSE' });
    expect(evil.calls).toHaveLength(1);
  });
});

describe('installation token provider', () => {
  function setup() {
    let t = Date.UTC(2026, 0, 1);
    const { fetchImpl, calls } = fakeFetch(() =>
      json(201, {
        token: `ghs_${calls.length}`,
        expires_at: new Date(t + 60 * 60_000).toISOString(),
      }),
    );
    const provider = createInstallationTokenProvider({
      client: createGitHubClient({ fetchImpl }),
      appJwt: () => 'app-jwt',
      now: () => t,
    });
    return { provider, calls, advance: (ms: number) => (t += ms) };
  }

  it('mints a token with the app JWT and caches it', async () => {
    const { provider, calls } = setup();
    expect(await provider.get(42n)).toBe('ghs_1');
    expect(await provider.get('42')).toBe('ghs_1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.github.com/app/installations/42/access_tokens');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer app-jwt');
  });

  it('refreshes 5 minutes before expiry and shares concurrent requests', async () => {
    const { provider, calls, advance } = setup();
    await provider.get('1');
    advance(54 * 60_000);
    expect(await provider.get('1')).toBe('ghs_1');
    advance(2 * 60_000); // 4 minutes left: refresh
    const [a, b] = await Promise.all([provider.get('1'), provider.get('1')]);
    expect(a).toBe('ghs_2');
    expect(b).toBe('ghs_2');
    expect(calls).toHaveLength(2);
  });
});

describe('user OAuth', () => {
  it('exchanges a code for a user token', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json(200, { access_token: 'ghu_abc', token_type: 'bearer' }),
    );
    await expect(
      exchangeCodeForUserToken({ clientId: 'c', clientSecret: 's', code: 'x' }, fetchImpl),
    ).resolves.toBe('ghu_abc');
    expect(calls[0]!.url).toBe('https://github.com/login/oauth/access_token');
  });

  it('treats GitHub’s "HTTP 200 with an error field" as a failure', async () => {
    const { fetchImpl } = fakeFetch(() => json(200, { error: 'bad_verification_code' }));
    await expect(
      exchangeCodeForUserToken({ clientId: 'c', clientSecret: 's', code: 'x' }, fetchImpl),
    ).rejects.toMatchObject({
      code: 'GITHUB_UNAUTHORIZED',
      message: expect.stringContaining('bad_verification_code'),
    });
  });

  it('lists the installations the user can access', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json(200, {
        total_count: 1,
        installations: [{ id: 7, account: { login: 'prem', type: 'User' } }, { bogus: true }],
      }),
    );
    expect(await listUserInstallations(createGitHubClient({ fetchImpl }), 'ghu')).toEqual([
      { id: 7, account: { login: 'prem', type: 'User' } },
    ]);
  });
});
