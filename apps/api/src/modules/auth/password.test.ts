import { describe, expect, it } from 'vitest';
import { getDummyHash, hashPassword, needsRehash, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('correct horse battery stapler', hash)).toBe(false);
  });

  it('uses a random salt, so equal passwords give different hashes', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same password!'),
      hashPassword('same password!'),
    ]);
    expect(a).not.toBe(b);
  });

  it('stores the algorithm and parameters, never the password', async () => {
    const hash = await hashPassword('my secret password');
    expect(hash).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hash).not.toContain('my secret password');
  });

  it('treats Unicode look-alikes consistently (NFKC normalisation)', async () => {
    const hash = await hashPassword('café-password'); // é as one code point
    expect(await verifyPassword('café-password', hash)).toBe(true); // e + combining accent
  });

  it('returns false instead of throwing for malformed or hostile hashes', async () => {
    for (const bad of [
      '',
      'plain-text',
      'scrypt$1$1$1$a$b',
      'scrypt$1073741824$8$1$AAAA$AAAA',
      'bcrypt$x',
    ]) {
      expect(await verifyPassword('anything', bad), bad).toBe(false);
    }
  });

  it('flags hashes made with other parameters for upgrade', async () => {
    expect(needsRehash(await hashPassword('a-long-password'))).toBe(false);
    expect(needsRehash('scrypt$16384$8$1$AAAA$AAAA')).toBe(true);
    expect(needsRehash('garbage')).toBe(true);
  });

  it('provides a stable dummy hash that no ordinary password matches', async () => {
    const dummy = await getDummyHash();
    expect(await getDummyHash()).toBe(dummy);
    expect(await verifyPassword('password1234', dummy)).toBe(false);
  });
});
