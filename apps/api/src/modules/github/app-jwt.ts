import { sign, type KeyObject } from 'node:crypto';

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/**
 * A GitHub App proves who it is with a short-lived JWT signed by its private
 * key (RS256). The JWT itself can only do app-level things — mainly
 * "give me a token for installation X". Written with node:crypto rather than
 * a JWT library: it's 10 lines and one less dependency to trust.
 *
 * Claims per GitHub's docs: iat 60 s in the past (clock drift), exp at most
 * 10 minutes ahead (we use 9), iss = the app's client ID (recommended).
 */
export function createAppJwt(clientId: string, privateKey: KeyObject, nowMs = Date.now()): string {
  const now = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: clientId }));
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${b64url(signature)}`;
}
