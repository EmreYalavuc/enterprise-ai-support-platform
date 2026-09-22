import { Router } from 'express';
import { getPool } from '@ai-support/database';
import { runAgent } from '../services/agent';
import type { Message, ApiResponse } from '@ai-support/shared';

const router = Router({ mergeParams: true });

// GET /conversations/:id/messages
router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();

    const conv = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND company_id = $2',
      [req.params.id, req.company.id]
    );
    if (conv.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    const result = await pool.query<Message>(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /conversations/:id/messages — mesaj gönder, AI cevap üretsin
router.post('/', async (req, res, next) => {
  const { content, role = 'user' } = req.body;

  if (!content || typeof content !== 'string' || content.trim() === '') {
    res.status(400).json({ success: false, error: 'content is required' });
    return;
  }

  // Sadece user mesajları AI'ı tetikler
  // assistant/system mesajları doğrudan kaydedilir (webhook, test için)
  const triggerAI = role === 'user';

  try {
    const pool = getPool();

    const conv = await pool.query(
      'SELECT id, customer_id FROM conversations WHERE id = $1 AND company_id = $2 AND status = $3',
      [req.params.id, req.company.id, 'active']
    );
    if (conv.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Active conversation not found' });
      return;
    }

    const customerId = conv.rows[0].customer_id;

    // 1. Kullanıcı mesajını kaydet
    const userMsg = await pool.query<Message>(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, role, content.trim()]
    );

    if (!triggerAI) {
      res.status(201).json({ success: true, data: userMsg.rows[0] });
      return;
    }

    // 2. Konuşma geçmişini getir — DESC ile son 20'yi al, sonra ASC sıraya sok
    const history = await pool.query<Message>(
      `SELECT role, content FROM (
         SELECT role, content, created_at FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC LIMIT 20
       ) sub ORDER BY created_at ASC`,
      [req.params.id]
    );

    // 3. Şirketin AI ayarlarını al
    const companyRow = await pool.query(
      'SELECT ai_provider, ai_api_key, ai_model FROM companies WHERE id = $1',
      [req.company.id]
    );
    const { ai_provider, ai_api_key, ai_model } = companyRow.rows[0] ?? {};

    // 4. AI agent'ı çalıştır
    const agentResult = await runAgent(
      history.rows.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      {
        provider: (ai_provider as 'claude' | 'gemini' | 'mock') ?? 'mock',
        apiKey: ai_api_key ?? '',
        model: ai_model ?? undefined,
        companyId: req.company.id,
        customerId: customerId ?? undefined,
        conversationId: req.params.id,
      }
    );

    // 4. AI cevabını kaydet
    const aiMsg = await pool.query<Message>(
      `INSERT INTO messages (conversation_id, role, content, metadata, tokens_input, tokens_output, cost_usd, language)
       VALUES ($1, 'assistant', $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.params.id,
        agentResult.response,
        JSON.stringify({ tools_used: agentResult.toolsUsed }),
        agentResult.inputTokens,
        agentResult.outputTokens,
        agentResult.costUsd,
        agentResult.language,
      ]
    );

    const response: ApiResponse<{ user: Message; assistant: Message }> = {
      success: true,
      data: { user: userMsg.rows[0], assistant: aiMsg.rows[0] },
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

export default router;
