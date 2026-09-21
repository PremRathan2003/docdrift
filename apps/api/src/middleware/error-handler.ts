import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { GitHubError } from '../modules/github/github-client.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

/** Every error response has the same shape: { error: { code, message, details?, requestId } } */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        requestId,
      },
    });
    return;
  }

  // GitHub failures: log the detail, give the client a stable, safe code.
  if (err instanceof GitHubError) {
    req.log.warn(
      { err: { code: err.code, status: err.status, message: err.message } },
      'GitHub request failed',
    );
    const rateLimited = err.code === 'GITHUB_RATE_LIMITED';
    if (rateLimited && err.retryAfterSeconds)
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
    res.status(rateLimited ? 503 : 502).json({
      error: {
        code: rateLimited ? 'GITHUB_RATE_LIMITED' : 'GITHUB_UNAVAILABLE',
        message: rateLimited
          ? 'GitHub rate limit reached. Please try again shortly.'
          : 'GitHub could not be reached or returned an error. Please try again.',
        details: rateLimited ? { retryAfterSeconds: err.retryAfterSeconds } : undefined,
        requestId,
      },
    });
    return;
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON body', requestId } });
    return;
  }

  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId },
  });
};
