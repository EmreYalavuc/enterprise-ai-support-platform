import { Router } from 'express';
import { getPool } from '@ai-support/database';
import type { Conversation, ApiResponse } from '@ai-support/shared';

const router = Router();

// POST /conversations — yeni konuşma başlat
router.post('/', async (req, res, next) => {
  const { channel = 'api', customer_id, metadata = {} } = req.body;

  const validChannels = ['web', 'whatsapp', 'api'];
  if (!validChannels.includes(channel)) {
    res.status(400).json({ success: false, error: `channel must be one of: ${validChannels.join(', ')}` });
    return;
  }

  try {
    const pool = getPool();
    const result = await pool.query<Conversation>(
      `INSERT INTO conversations (company_id, customer_id, channel, status, metadata)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING *`,
      [req.company.id, customer_id ?? null, channel, JSON.stringify(metadata)]
    );

    const response: ApiResponse<Conversation> = { success: true, data: result.rows[0] };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

// GET /conversations — şirkete ait konuşmaları listele
router.get('/', async (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? '20', 10)));
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;

  try {
    const pool = getPool();

    const conditions = ['company_id = $1'];
    const params: unknown[] = [req.company.id];

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    const where = conditions.join(' AND ');

    const [rows, countResult] = await Promise.all([
      pool.query<Conversation>(
        `SELECT * FROM conversations WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM conversations WHERE ${where}`,
        params
      ),
    ]);

    res.json({
      success: true,
      data: rows.rows,
      meta: {
        total: parseInt(countResult.rows[0].count, 10),
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /conversations/:id — tek konuşmayı getir
router.get('/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query<Conversation>(
      'SELECT * FROM conversations WHERE id = $1 AND company_id = $2',
      [req.params.id, req.company.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /conversations/:id — durumu güncelle
router.patch('/:id', async (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['active', 'resolved', 'escalated'];

  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  try {
    const pool = getPool();
    const result = await pool.query<Conversation>(
      `UPDATE conversations SET status = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING *`,
      [status, req.params.id, req.company.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
