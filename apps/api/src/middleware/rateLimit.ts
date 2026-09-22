import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../services/redis';

const REQUESTS_PER_MINUTE = 100;

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const redis = getRedis();
  const minute = Math.floor(Date.now() / 60_000);
  const key = `rate:${req.company.id}:${minute}`;

  try {
    const count = await redis.incr(key);

    if (count === 1) {
      // İlk istek: anahtara 60 saniyelik TTL ver
      await redis.expire(key, 60);
    }

    res.setHeader('X-RateLimit-Limit', REQUESTS_PER_MINUTE);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, REQUESTS_PER_MINUTE - count));

    if (count > REQUESTS_PER_MINUTE) {
      res.status(429).json({ success: false, error: 'Rate limit exceeded. Try again in a minute.' });
      return;
    }

    next();
  } catch {
    // Redis çöksе rate limiting devre dışı bırak, istek geçsin
    next();
  }
}
