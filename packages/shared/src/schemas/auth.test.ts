import { describe, expect, it } from 'vitest';
import { loginRequestSchema, registerRequestSchema } from './auth.js';

describe('registerRequestSchema', () => {
  it('normalises the email to trimmed lowercase', () => {
    const parsed = registerRequestSchema.parse({
      email: '  Prem@Example.COM ',
      password: 'a-long-enough-password',
    });
    expect(parsed.email).toBe('prem@example.com');
  });

  it('rejects short passwords and invalid emails', () => {
    expect(registerRequestSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(
      false,
    );
    expect(
      registerRequestSchema.safeParse({ email: 'not-an-email', password: 'a-long-enough-password' })
        .success,
    ).toBe(false);
  });

  it('rejects absurdly long passwords', () => {
    const result = registerRequestSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(129) });
    expect(result.success).toBe(false);
  });
});

describe('loginRequestSchema', () => {
  it('does not apply the registration length rule', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true);
  });
});
