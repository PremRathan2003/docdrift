import type { z } from 'zod';

/** Mirrors the API's error envelope: { error: { code, message, details?, requestId } } */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Small fetch wrapper. Every response is validated against a Zod schema from
 * @docdrift/shared, so if the backend and frontend drift apart we get a clear
 * error instead of `undefined` somewhere deep in a component.
 */
export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<z.infer<S>> {
  const res = await fetchImpl(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (e.g. a proxy error page). Handled below.
  }

  // The health endpoint legitimately returns a valid body with 503, so we try
  // the success schema first and only then treat the response as an error.
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;

  const err = (body as { error?: { code?: string; message?: string; requestId?: string } } | null)
    ?.error;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Request failed with status ${res.status}`,
      err?.requestId,
    );
  }
  throw new ApiError(res.status, 'INVALID_RESPONSE', 'The server returned an unexpected response');
}
