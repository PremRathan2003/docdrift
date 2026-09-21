import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@docdrift/shared';
import { createApp, type AppDeps } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';

function buildApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    env: { WEB_ORIGIN: 'http://localhost:5173', NODE_ENV: 'test' },
    logger: createLogger('silent'),
    version: 'test',
    checkDatabase: async () => {},
    ...overrides,
  });
}

describe('GET /api/health', () => {
  it('returns 200 and a schema-valid body when the database is reachable', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body)).toMatchObject({
      status: 'ok',
      checks: { database: 'ok' },
    });
  });

  it('returns 503 "degraded" when the database check fails', async () => {
    const app = buildApp({
      checkDatabase: async () => {
        throw new Error('connection refused');
      },
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', checks: { database: 'error' } });
  });

  it('echoes a request id header', async () => {
    const res = await request(buildApp()).get('/api/health').set('x-request-id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });
});

describe('error handling', () => {
  it('returns a consistent JSON 404 for unknown routes', async () => {
    const res = await request(buildApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'ROUTE_NOT_FOUND' });
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('only allows the configured web origin via CORS', async () => {
    const allowed = await request(buildApp())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    // The cors package always answers with the single configured origin; the
    // browser then refuses the response because it doesn't match the caller.
    const blocked = await request(buildApp())
      .get('/api/health')
      .set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).not.toBe('*');
  });
});
