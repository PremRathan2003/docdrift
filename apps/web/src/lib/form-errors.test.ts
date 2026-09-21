import { registerRequestSchema } from '@docdrift/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import {
  fieldErrorsFromApi,
  fieldErrorsFromZod,
  formErrorMessage,
  retryAfterSeconds,
} from './form-errors';

describe('form error helpers', () => {
  it('maps client-side validation to one message per field', () => {
    const result = registerRequestSchema.safeParse({ email: 'nope', password: 'short' });
    expect(result.success).toBe(false);
    const errors = fieldErrorsFromZod(result.error!);
    expect(Object.keys(errors).sort()).toEqual(['email', 'password']);
  });

  it('maps API validation details to fields', () => {
    const err = new ApiError(400, 'VALIDATION_ERROR', 'x', 'r', [
      { path: 'email', message: 'Enter a valid email address' },
    ]);
    expect(fieldErrorsFromApi(err)).toEqual({ email: 'Enter a valid email address' });
    expect(fieldErrorsFromApi(new Error('x'))).toEqual({});
  });

  it('reads the wait time from rate-limit errors', () => {
    expect(
      retryAfterSeconds(
        new ApiError(429, 'ACCOUNT_THROTTLED', 'x', 'r', { retryAfterSeconds: 90 }),
      ),
    ).toBe(90);
    expect(retryAfterSeconds(new ApiError(429, 'RATE_LIMITED', 'x'))).toBe(60);
    expect(retryAfterSeconds(new ApiError(401, 'INVALID_CREDENTIALS', 'x'))).toBeNull();
  });

  it('never shows raw server errors for 5xx', () => {
    expect(formErrorMessage(new ApiError(500, 'INTERNAL_ERROR', 'stack trace here'))).not.toContain(
      'stack',
    );
    expect(formErrorMessage(new TypeError('Failed to fetch'))).toMatch(/connection/);
  });
});
