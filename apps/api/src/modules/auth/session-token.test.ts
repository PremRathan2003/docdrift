import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashSessionToken } from './session-token.js';

describe('session tokens', () => {
  it('generates 256-bit URL-safe tokens that do not repeat', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateSessionToken));
    expect(tokens.size).toBe(1000);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically per secret', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token, 's'.repeat(32))).toBe(hashSessionToken(token, 's'.repeat(32)));
    expect(hashSessionToken(token, 's'.repeat(32))).not.toBe(
      hashSessionToken(token, 't'.repeat(32)),
    );
  });

  it('never stores the token itself', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token, 'x'.repeat(32))).not.toContain(token);
  });
});
