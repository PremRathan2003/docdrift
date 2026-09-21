import type { CookieOptions, Response } from 'express';

/**
 * In production the cookie uses the "__Host-" prefix. Browsers only accept
 * such a cookie if it is Secure, has Path=/ and no Domain — so it can never be
 * set or overwritten by a subdomain or over plain HTTP. Locally we run on
 * http://localhost, where Secure cookies are not allowed, so we drop the prefix.
 */
export interface SessionCookieConfig {
  name: string;
  secure: boolean;
}

export function sessionCookieConfig(nodeEnv: string): SessionCookieConfig {
  const production = nodeEnv === 'production';
  return { name: production ? '__Host-docdrift_session' : 'docdrift_session', secure: production };
}

function baseOptions(config: SessionCookieConfig): CookieOptions {
  return {
    httpOnly: true, // JavaScript in the page can't read it, which limits XSS damage
    secure: config.secure,
    sameSite: 'lax', // not sent on cross-site POSTs, a first line of CSRF defence
    path: '/',
  };
}

export function setSessionCookie(
  res: Response,
  config: SessionCookieConfig,
  token: string,
  expiresAt: Date,
) {
  res.cookie(config.name, token, { ...baseOptions(config), expires: expiresAt });
}

export function clearSessionCookie(res: Response, config: SessionCookieConfig) {
  res.clearCookie(config.name, baseOptions(config));
}

export function readSessionCookie(
  cookies: unknown,
  config: SessionCookieConfig,
): string | undefined {
  const value = (cookies as Record<string, unknown> | undefined)?.[config.name];
  return typeof value === 'string' ? value : undefined;
}
