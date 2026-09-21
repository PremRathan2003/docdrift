/**
 * An error that is safe to show to the client. Anything that is *not* an
 * AppError is treated as an unexpected bug: it is logged in full but the
 * client only sees a generic 500 message.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
