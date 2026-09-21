import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  WEB_ORIGIN: 'http://localhost:5173',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejects the placeholder secret from .env.example', () => {
    expect(() =>
      loadEnv({
        ...base,
        SESSION_SECRET: 'replace-me-with-a-long-random-string-at-least-32-chars',
      }),
    ).toThrow(/still the example value/);
  });

  it('fails fast with a readable message and does not leak values', () => {
    expect(() => loadEnv({ ...base, SESSION_SECRET: 'short-secret-value' })).toThrow(
      /SESSION_SECRET: SESSION_SECRET must be at least 32 characters/,
    );
    expect(() => loadEnv({ ...base, SESSION_SECRET: 'short-secret-value' })).not.toThrow(
      /short-secret-value/,
    );
  });
});
