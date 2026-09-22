import rateLimit from 'express-rate-limit';

export const limiter = rateLimit({ windowMs: 60_000, limit: 100 });

export function requireKey(keys) {
  return (req, res, next) => {
    const key = req.get('Authorization')?.replace(/^Bearer /, '');
    if (!key || !keys.has(key)) return res.status(401).json({ error: 'invalid key' });
    next();
  };
}
