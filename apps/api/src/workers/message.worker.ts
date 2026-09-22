import { Worker, type Job } from 'bullmq';
import { getPool } from '@ai-support/database';
import { runAgent } from '../services/agent';
import { sendWhatsAppMessage } from '../services/whatsapp';
import type { ProcessMessageJob } from '../services/queue';
import { config } from '../config';

const connection = { host: config.redis.host, port: config.redis.port };

async function processMessageJob(job: Job<ProcessMessageJob>): Promise<void> {
  const { conversationId, companyId, customerId, content, source } = job.data;
  const pool = getPool();

  console.log(`[MsgWorker] Processing ${source} message for conversation ${conversationId}`);

  // 1. Konuşma durumunu kontrol et — escalated ise AI atla
  const convCheck = await pool.query(
    'SELECT status FROM conversations WHERE id = $1',
    [conversationId]
  );
  const convStatus = convCheck.rows[0]?.status;

  // 2. Kullanıcı mesajını DB'ye kaydet (her zaman)
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content)
     VALUES ($1, 'user', $2)
     ON CONFLICT DO NOTHING`,
    [conversationId, content]
  );

  // Escalated konuşmada AI cevap vermiyor — insan agent bekliyor
  if (convStatus === 'escalated') {
    console.log(`[MsgWorker] Conversation ${conversationId} is escalated — skipping AI`);
    return;
  }

  // 3. Son 20 mesajı yükle (context window) — sadece user/assistant rolleri
  const historyResult = await pool.query(
    `SELECT role, content FROM (
       SELECT role, content, created_at FROM messages
       WHERE conversation_id = $1 AND role IN ('user', 'assistant')
       ORDER BY created_at DESC LIMIT 20
     ) sub ORDER BY created_at ASC`,
    [conversationId]
  );

  const messages = historyResult.rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content as string,
  }));

  // 4. Şirketin AI ayarlarını al
  const companyRow = await pool.query(
    'SELECT ai_provider, ai_api_key, ai_model FROM companies WHERE id = $1',
    [companyId]
  );
  const { ai_provider, ai_api_key, ai_model } = companyRow.rows[0] ?? {};

  const agentResult = await runAgent(messages, {
    provider: (ai_provider as 'claude' | 'gemini' | 'mock') ?? 'mock',
    apiKey: ai_api_key ?? '',
    model: ai_model ?? undefined,
    companyId, customerId, conversationId,
  });

  // 5. Cevabı DB'ye kaydet
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content, tokens_input, tokens_output, cost_usd, language)
     VALUES ($1, 'assistant', $2, $3, $4, $5, $6)`,
    [conversationId, agentResult.response, agentResult.inputTokens, agentResult.outputTokens, agentResult.costUsd, agentResult.language]
  );

  // 5. WhatsApp'a cevap gönder (sadece whatsapp kaynağında)
  if (source === 'whatsapp' && job.data.externalMessageId) {
    const customerPhone = job.data.externalMessageId.split(':')[0];
    if (customerPhone) {
      await sendWhatsAppMessage(customerPhone, agentResult.response);
    }
  }

  console.log(`[MsgWorker] Conversation ${conversationId} processed`);
}

export function startMessageWorker(): Worker<ProcessMessageJob> {
  const worker = new Worker<ProcessMessageJob>('messages', processMessageJob, {
    connection,
    concurrency: 5, // aynı anda 5 konuşma işle
  });

  worker.on('completed', (job) => {
    console.log(`[MsgWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[MsgWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[MsgWorker] Worker error:', err.message);
  });

  console.log('[MsgWorker] Message worker started');
  return worker;
}
