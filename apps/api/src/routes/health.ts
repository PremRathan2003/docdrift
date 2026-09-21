import { Router } from 'express';
import type { HealthResponse } from '@docdrift/shared';

export interface HealthDeps {
  version: string;
  /** Resolves if the database answers; rejects otherwise. */
  checkDatabase: () => Promise<void>;
}

export function healthRouter({ version, checkDatabase }: HealthDeps) {
  const router = Router();

  router.get('/health', async (req, res) => {
    let database: HealthResponse['checks']['database'] = 'ok';
    try {
      await checkDatabase();
    } catch (err) {
      database = 'error';
      // The real cause goes to the server log; the public response stays generic.
      req.log.warn({ err }, 'Health check: database unreachable');
    }

    const body: HealthResponse = {
      status: database === 'ok' ? 'ok' : 'degraded',
      version,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database },
    };
    // 503 lets a hosting platform's health check notice a broken database.
    res.status(body.status === 'ok' ? 200 : 503).json(body);
  });

  return router;
}
