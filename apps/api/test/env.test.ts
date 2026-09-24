import { describe, expect, it } from 'vitest';
import { loadAiEnv, loadEnv } from '../src/config/env.js';

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

describe('loadEnv: openai-compatible provider', () => {
  const ai = { ...base, AI_PROVIDER: 'openai-compatible', AI_API_KEY: 'k', AI_MODEL: 'm' };

  it('requires a base URL', () => {
    expect(() => loadEnv(ai)).toThrow(/AI_BASE_URL: required when AI_PROVIDER=openai-compatible/);
  });

  it('accepts https, and http only for localhost', () => {
    expect(loadEnv({ ...ai, AI_BASE_URL: 'https://api.groq.com/openai/v1' }).AI_BASE_URL).toBe(
      'https://api.groq.com/openai/v1',
    );
    expect(loadEnv({ ...ai, AI_BASE_URL: 'http://localhost:11434/v1' }).AI_BASE_URL).toBeDefined();
    expect(() => loadEnv({ ...ai, AI_BASE_URL: 'http://api.example.com/v1' })).toThrow(
      /must be an https/,
    );
  });
});

describe('loadAiEnv', () => {
  it('validates the AI settings without demanding the rest of the system', () => {
    // The evaluation harness talks to a model and nothing else; a half-filled
    // GitHub App or a missing database must not stop it.
    const env = loadAiEnv({
      AI_PROVIDER: 'gemini',
      AI_API_KEY: 'k',
      AI_MODEL: 'm',
      GITHUB_APP_SLUG: 'half-configured',
    } as NodeJS.ProcessEnv);
    expect(env).toMatchObject({ AI_PROVIDER: 'gemini', AI_MODEL: 'm' });
  });

  it('still insists on what the AI itself needs', () => {
    expect(() => loadAiEnv({ AI_PROVIDER: 'gemini' } as NodeJS.ProcessEnv)).toThrow(/AI_API_KEY/);
    expect(() =>
      loadAiEnv({ AI_PROVIDER: 'openai-compatible', AI_API_KEY: 'k', AI_MODEL: 'm' } as NodeJS.ProcessEnv),
    ).toThrow(/AI_BASE_URL/);
  });
});
