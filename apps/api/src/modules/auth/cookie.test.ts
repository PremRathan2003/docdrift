import { describe, expect, it } from 'vitest';
import { readSessionCookie, sessionCookieConfig } from './cookie.js';

describe('session cookie config', () => {
  it('uses a Secure __Host- cookie in production only', () => {
    expect(sessionCookieConfig('production')).toEqual({
      name: '__Host-docdrift_session',
      secure: true,
    });
    expect(sessionCookieConfig('development')).toEqual({ name: 'docdrift_session', secure: false });
  });

  it('reads only string cookie values', () => {
    const cfg = sessionCookieConfig('test');
    expect(readSessionCookie({ docdrift_session: 'abc' }, cfg)).toBe('abc');
    expect(readSessionCookie({ docdrift_session: ['a', 'b'] }, cfg)).toBeUndefined();
    expect(readSessionCookie(undefined, cfg)).toBeUndefined();
  });
});
