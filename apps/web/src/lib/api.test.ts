import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@docdrift/shared';
import { ApiError, apiFetch } from './api';

const fakeFetch = (status: number, body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

const health = { status: 'ok', version: '1', uptimeSeconds: 3, checks: { database: 'ok' } };

describe('apiFetch', () => {
  it('returns parsed data for a valid response', async () => {
    await expect(
      apiFetch('/api/health', healthResponseSchema, {}, fakeFetch(200, health)),
    ).resolves.toEqual(health);
  });

  it('maps the API error envelope to ApiError', async () => {
    const promise = apiFetch(
      '/api/x',
      healthResponseSchema,
      {},
      fakeFetch(404, { error: { code: 'NOT_FOUND', message: 'nope', requestId: 'r1' } }),
    );
    await expect(promise).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'r1',
    });
  });

  it('rejects a 200 response whose shape does not match the schema', async () => {
    const promise = apiFetch(
      '/api/health',
      healthResponseSchema,
      {},
      fakeFetch(200, { hello: 'world' }),
    );
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
