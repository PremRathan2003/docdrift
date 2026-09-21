import { pino } from 'pino';

export function createLogger(level: string) {
  return pino({
    level,
    // Never log credentials, even by accident.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
