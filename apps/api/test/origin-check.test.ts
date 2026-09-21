import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../src/middleware/error-handler.js';
import { originCheck } from '../src/middleware/origin-check.js';

function app() {
  const a = express();
  a.use(originCheck('http://localhost:5173'));
  a.all('/x', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  a.use(errorHandler);
  return a;
}

describe('originCheck', () => {
  it('blocks state-changing requests from another origin', async () => {
    const res = await request(app()).post('/x').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('allows the web app origin and requests without an Origin header', async () => {
    expect((await request(app()).post('/x').set('Origin', 'http://localhost:5173')).status).toBe(
      200,
    );
    expect((await request(app()).post('/x')).status).toBe(200);
  });

  it('never blocks safe methods', async () => {
    expect((await request(app()).get('/x').set('Origin', 'https://evil.example')).status).toBe(200);
  });
});
