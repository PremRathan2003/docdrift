import { createHmac, randomBytes } from 'node:crypto';

/**
 * A session token is 32 random bytes (256 bits): impossible to guess, so it
 * needs no signature. The browser gets the token in an httpOnly cookie.
 *
 * The database only ever stores HMAC-SHA256(SESSION_SECRET, token):
 *  - someone who reads the database (backup leak, SQL injection) cannot turn
 *    a row back into a usable cookie;
 *  - without SESSION_SECRET they can't even check a stolen cookie against it;
 *  - rotating SESSION_SECRET logs everyone out — a useful emergency switch.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
