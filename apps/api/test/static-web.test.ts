/**
 * Serving the built web app from the API.
 *
 * In production one service answers both, so the browser stays on a single
 * origin and the session cookie is first-party without a proxy rewrite. The
 * risk in that arrangement is the single-page fallback swallowing unknown API
 * routes and answering HTML where a client expects JSON, so that is what these
 * tests pin down.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type AppDeps } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import { createPrismaClient } from '../src/lib/prisma.js';

const unusedDb = createPrismaClient('postgresql://unused:unused@localhost:1/unused');

const dist = mkdtempSync(join(tmpdir(), 'docdrift-web-'));
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>DocDrift</title>');
writeFileSync(join(dist, 'app.js'), 'console.log(1)');

function buildApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    env: {
      WEB_ORIGIN: 'http://localhost:5173',
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-only-secret-that-is-at-least-32-characters',
    },
    logger: createLogger('silent'),
    version: 'test',
    db: unusedDb,
    checkDatabase: async () => {},
    webDist: dist,
    ...overrides,
  });
}

describe('serving the web app', () => {
  it('serves index.html at the root and for client-side routes', async () => {
    for (const path of ['/', '/dashboard', '/suggestions/abc123']) {
      const res = await request(buildApp()).get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).toContain('DocDrift');
      // A deploy replaces index.html; a cached copy would load assets that are gone.
      expect(res.headers['cache-control'], path).toContain('no-cache');
    }
  });

  it('serves built assets with a long cache, since their names are hashed', async () => {
    const res = await request(buildApp()).get('/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=31536000');
  });

  it('still answers JSON for an unknown API route, not the app shell', async () => {
    const res = await request(buildApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('still serves the real API routes', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });

  it('answers a JSON 404 everywhere when no web build is configured', async () => {
    const res = await request(buildApp({ webDist: undefined })).get('/dashboard');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
