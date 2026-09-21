import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt (built into Node, no native dependency).
 *
 * Parameters: N=2^15, r=8, p=3. This is one of the OWASP-recommended scrypt
 * settings (equivalent strength to N=2^17, p=1) but needs only ~32 MB of
 * memory per hash instead of ~128 MB, which matters on a 512 MB free-tier
 * server that may handle a few logins at once. It takes roughly 0.25 s,
 * which is fine for a login and painful for someone guessing passwords.
 *
 * Stored format:  scrypt$N$r$p$<salt base64>$<hash base64>
 * Keeping the parameters inside the string means we can raise them later and
 * still verify old hashes (see needsRehash).
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function scryptAsync(password: string, salt: Buffer, params: { N: number; r: number; p: number }) {
  const options: ScryptOptions = {
    ...params,
    // Node refuses to use more than 32 MB unless we allow it explicitly.
    maxmem: 128 * params.N * params.r * 2,
  };
  return new Promise<Buffer>((resolve, reject) => {
    // The async version runs on libuv's thread pool, so it doesn't freeze
    // every other request while it hashes.
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, n, r, p, salt, hash] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  // Refuse silly values rather than let a corrupted row allocate gigabytes.
  if (
    ![N, R, P].every(Number.isInteger) ||
    N < 2 ** 10 ||
    N > 2 ** 20 ||
    R < 1 ||
    R > 32 ||
    P < 1 ||
    P > 16
  ) {
    return null;
  }
  return { N, r: R, p: P, salt: Buffer.from(salt!, 'base64'), hash: Buffer.from(hash!, 'base64') };
}

/** Returns false (never throws) for a wrong password or a malformed hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed || parsed.hash.length !== KEY_LENGTH) return false;
  const candidate = await scryptAsync(password, parsed.salt, parsed);
  // Constant-time comparison: the time taken doesn't reveal how many bytes matched.
  return timingSafeEqual(candidate, parsed.hash);
}

/** True when a hash was made with older/weaker parameters and should be upgraded at next login. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  return !parsed || parsed.N !== PARAMS.N || parsed.r !== PARAMS.r || parsed.p !== PARAMS.p;
}

/**
 * A real hash of a random password, used when a login email doesn't exist.
 * We still run a full verification against it, so "unknown email" and
 * "wrong password" take the same time and attackers can't use response time
 * to discover which emails are registered.
 */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64'));
  return dummyHash;
}
