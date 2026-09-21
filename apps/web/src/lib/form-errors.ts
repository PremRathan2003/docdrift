import type { ZodError } from 'zod';
import { ApiError } from './api';

export type FieldErrors = Partial<Record<string, string>>;

/** First message per field, from client-side validation. */
export function fieldErrorsFromZod(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    out[key] ??= issue.message;
  }
  return out;
}

/** Field messages from the API's VALIDATION_ERROR details: [{ path, message }]. */
export function fieldErrorsFromApi(error: unknown): FieldErrors {
  if (
    !(error instanceof ApiError) ||
    error.code !== 'VALIDATION_ERROR' ||
    !Array.isArray(error.details)
  ) {
    return {};
  }
  const out: FieldErrors = {};
  for (const d of error.details as { path?: unknown; message?: unknown }[]) {
    if (typeof d.path === 'string' && typeof d.message === 'string') out[d.path] ??= d.message;
  }
  return out;
}

/** Seconds to wait, for rate-limit errors (429). Null for everything else. */
export function retryAfterSeconds(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 429) return null;
  const seconds = (error.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
  return typeof seconds === 'number' && seconds > 0 ? Math.ceil(seconds) : 60;
}

/** A message that is safe and useful to show above a form. */
export function formErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'VALIDATION_ERROR') return 'Please fix the highlighted fields.';
    if (error.status >= 500) return 'Something went wrong on our side. Please try again.';
    return error.message;
  }
  return 'Could not reach the server. Check your connection and try again.';
}
