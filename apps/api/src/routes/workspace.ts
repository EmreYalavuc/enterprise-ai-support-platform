import { Router } from 'express';
import { getPool } from '@ai-support/database';

const router = Router();

// GET /workspace/conversations — tüm konuşmaları listele (status filtreli)
// Agent workspace'in inbox'ı buradan beslenir
router.get('/conversations', async (req, res, next) => {
  const { status, limit = '50', offset = '0' } = req.query;
  const validStatuses = ['active', 'escalated', 'resolved'];

  try {
    const pool = getPool();
    const params: unknown[] = [req.company.id, parseInt(limit as string), parseInt(offset as string)];
    let statusFilter = '';

    if (status && validStatuses.includes(status as string)) {
      statusFilter = `AND c.status = $${params.length + 1}`;
      params.push(status);
    }

    const result = await pool.query(
      `SELECT
         c.id, c.status, c.channel, c.created_at, c.updated_at,
         c.escalated_at, c.metadata,
         cu.name AS customer_name, cu.email AS customer_email, cu.phone AS customer_phone,
         (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
         (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
         (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS message_count
       FROM conversations c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       WHERE c.company_id = $1 ${statusFilter}
       ORDER BY
         CASE c.status WHEN 'escalated' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
         c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /workspace/conversations/:id — tek konuşma + mesajlar
router.get('/conversations/:id', async (req, res, next) => {
  try {
    const pool = getPool();

    const convResult = await pool.query(
      `SELECT c.*, cu.name AS customer_name, cu.email AS customer_email, cu.phone AS customer_phone
       FROM conversations c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       WHERE c.id = $1 AND c.company_id = $2`,
      [req.params.id, req.company.id]
    );

    if (convResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    const messagesResult = await pool.query(
      `SELECT id, role, content, created_at, tokens_input, tokens_output, cost_usd
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        conversation: convResult.rows[0],
        messages: messagesResult.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /workspace/conversations/:id/reply — agent cevap yazar
router.post('/conversations/:id/reply', async (req, res, next) => {
  const { content } = req.body;
  if (!content?.trim()) {
    res.status(400).json({ success: false, error: 'content is required' });
    return;
  }

  try {
    const pool = getPool();

    // Konuşma bu şirkete ait mi kontrol et
    const convCheck = await pool.query(
      'SELECT id, status FROM conversations WHERE id = $1 AND company_id = $2',
      [req.params.id, req.company.id]
    );
    if (convCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    const msgResult = await pool.query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'agent', $2) RETURNING id, role, content, created_at`,
      [req.params.id, content.trim()]
    );

    // updated_at güncelle
    await pool.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    res.status(201).json({ success: true, data: msgResult.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /workspace/conversations/:id/status — durum değiştir (resolve, reopen)
router.patch('/conversations/:id/status', async (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['active', 'resolved', 'escalated'];

  if (!validStatuses.includes(status)) {
    res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  try {
    const pool = getPool();
    const extra = status === 'resolved' ? ', resolved_at = NOW()' : status === 'escalated' ? ', escalated_at = NOW()' : '';

    await pool.query(
      `UPDATE conversations SET status = $1, updated_at = NOW() ${extra} WHERE id = $2 AND company_id = $3`,
      [status, req.params.id, req.company.id]
    );

    res.json({ success: true, data: { status } });
  } catch (err) {
    next(err);
  }
});

export default router;
