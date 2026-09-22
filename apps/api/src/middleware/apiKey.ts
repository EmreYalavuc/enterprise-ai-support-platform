import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { getPool } from '@ai-support/database';
import { config } from '../config';
import type { Company } from '@ai-support/shared';

export async function apiKeyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const pool = getPool();

  // Önce JWT dene (dashboard kullanıcıları)
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, config.auth.jwtSecret) as { companyId: string };
      const result = await pool.query<Company>(
        'SELECT * FROM companies WHERE id = $1 AND is_active = true LIMIT 1',
        [payload.companyId]
      );
      if (result.rows.length > 0) {
        req.company = result.rows[0];
        next();
        return;
      }
    } catch {
      // Geçersiz JWT → API key'e geç
    }
  }

  // API key dene (widget, WhatsApp, external)
  const key = req.headers['x-api-key'];
  if (!key || typeof key !== 'string') {
    res.status(401).json({ success: false, error: 'Authentication required (API key or Bearer token)' });
    return;
  }

  const hash = createHash('sha256').update(key).digest('hex');
  try {
    const result = await pool.query<Company>(
      'SELECT * FROM companies WHERE api_key_hash = $1 AND is_active = true LIMIT 1',
      [hash]
    );
    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: 'Invalid or inactive API key' });
      return;
    }
    req.company = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}
