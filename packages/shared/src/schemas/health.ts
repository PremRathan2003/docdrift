import { z } from 'zod';

/** Response of GET /api/health. Shared so the web app can validate it too. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.object({
    database: z.enum(['ok', 'error']),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
