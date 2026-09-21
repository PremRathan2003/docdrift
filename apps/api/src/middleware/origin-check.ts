import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth (SameSite=Lax cookies are the first layer).
 *
 * Browsers attach an Origin header to every cross-origin request and to all
 * same-origin POST/PUT/PATCH/DELETE requests. If a state-changing request
 * comes from a *different* origin, we reject it before any handler runs.
 * Requests without an Origin (curl, server-to-server, tests) are allowed:
 * CSRF is an attack through a victim's browser, and browsers send Origin.
 */
export function originCheck(allowedOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== allowedOrigin) {
      return next(new AppError(403, 'FORBIDDEN_ORIGIN', 'Cross-origin request blocked'));
    }
    next();
  };
}
