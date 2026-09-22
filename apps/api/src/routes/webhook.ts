import { Router, type Request, type Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { randomUUID } from 'crypto';
import { getPool } from '@ai-support/database';
import { getRedis } from '../services/redis';
import { messageQueue } from '../services/queue';
import { extractMessages, type WhatsAppWebhookPayload } from '../services/whatsapp';
import { config } from '../config';

const router = Router();

// ─── GET /webhook — Meta'nın endpoint doğrulaması ─────────────────────────────
// Meta, webhook URL'ini kaydettiğinde bu isteği atar.
// hub.challenge değerini olduğu gibi geri döndürmeliyiz.
router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.webhookSecret) {
    console.log('[Webhook] Verification successful');
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: 'Forbidden' });
});

// ─── POST /webhook — Gelen mesajlar ──────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  // 1. İmza doğrulama — istek gerçekten Meta'dan mı geliyor?
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!verifySignature(req.rawBody ?? '', signature)) {
    console.warn('[Webhook] Invalid signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Meta her zaman 200 bekler — önce 200 dön, sonra işle
  res.status(200).json({ status: 'ok' });

  // 2. Gelen mesajları çıkar
  const payload = req.body as WhatsAppWebhookPayload;
  const messages = extractMessages(payload);

  for (const msg of messages) {
    // Sadece metin mesajlarını işle (şimdilik)
    if (msg.type !== 'text' || !msg.text?.body) continue;

    try {
      await handleIncomingMessage(msg.from, msg.id, msg.text.body);
    } catch (err) {
      console.error('[Webhook] Error handling message:', (err as Error).message);
    }
  }
});

// ─── Mesaj işleme ─────────────────────────────────────────────────────────────
async function handleIncomingMessage(
  phone: string,
  whatsappMsgId: string,
  content: string
): Promise<void> {
  const redis = getRedis();

  // Idempotency: Bu mesajı daha önce işledik mi?
  const idempotencyKey = `wa:processed:${whatsappMsgId}`;
  const alreadyProcessed = await redis.set(idempotencyKey, '1', 'EX', 86400, 'NX');
  // NX = sadece key yoksa set et. null dönerse key zaten vardı.
  if (alreadyProcessed === null) {
    console.log(`[Webhook] Duplicate message ${whatsappMsgId} — skipping`);
    return;
  }

  const pool = getPool();
  const companyId = config.whatsapp.companyId;

  if (!companyId) {
    console.warn('[Webhook] WHATSAPP_COMPANY_ID not configured');
    return;
  }

  // Müşteriyi bul veya oluştur
  // external_id = "wa:{phone}" — varolan unique index'i kullanır
  const customerResult = await pool.query(
    `INSERT INTO customers (company_id, external_id, phone, name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, external_id) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [companyId, `wa:${phone}`, phone, `WhatsApp ${phone}`]
  );
  const customerId: string = customerResult.rows[0].id;

  // Aktif konuşmayı bul veya yeni aç
  // Son 24 saat içinde açık olan konuşmayı kullan
  const convResult = await pool.query(
    `SELECT id FROM conversations
     WHERE company_id = $1 AND customer_id = $2 AND status = 'active'
       AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC LIMIT 1`,
    [companyId, customerId]
  );

  let conversationId: string;
  if (convResult.rows.length > 0) {
    conversationId = convResult.rows[0].id;
  } else {
    const newConv = await pool.query(
      `INSERT INTO conversations (id, company_id, customer_id, status, channel)
       VALUES ($1, $2, $3, 'active', 'whatsapp') RETURNING id`,
      [randomUUID(), companyId, customerId]
    );
    conversationId = newConv.rows[0].id;
  }

  // Kuyruğa ekle — worker işleyecek, WhatsApp'a cevap gönderecek
  await messageQueue.add('process-message', {
    conversationId,
    companyId,
    customerId,
    content,
    source: 'whatsapp',
    externalMessageId: `${phone}:${whatsappMsgId}`,
  });

  console.log(`[Webhook] Message from ${phone} queued → conversation ${conversationId}`);
}

// ─── HMAC-SHA256 imza doğrulama ───────────────────────────────────────────────
// Meta raw request body üzerinden imza hesaplar — re-serialize etme!
function verifySignature(rawBody: string, signature: string): boolean {
  if (!signature?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', config.whatsapp.webhookSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(`sha256=${expected}`);
  const receivedBuf = Buffer.from(signature);

  // timingSafeEqual: timing attack'a karşı sabit zamanlı karşılaştırma
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export default router;
