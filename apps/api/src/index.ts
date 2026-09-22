import express from 'express';
import cors from 'cors';
import { config } from './config';
import { getPool, closePool } from '@ai-support/database';
import { getRedis, closeRedis } from './services/redis';
import { ensureCollection } from './services/qdrant';
import { apiKeyMiddleware } from './middleware/apiKey';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { closeQueues } from './services/queue';
import { startDocumentWorker } from './workers/document.worker';
import { startMessageWorker } from './workers/message.worker';
import conversationsRouter from './routes/conversations';
import messagesRouter from './routes/messages';
import documentsRouter from './routes/documents';
import settingsRouter from './routes/settings';
import authRouter from './routes/auth';
import webhookRouter from './routes/webhook';
import workspaceRouter from './routes/workspace';
import type { HealthCheck } from '@ai-support/shared';

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
  credentials: true,
}));
// rawBody: webhook imza doğrulaması için ham body'yi sakla
app.use(express.json({
  verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks: HealthCheck['checks'] = {
    database: 'unconfigured',
    redis: 'unconfigured',
    qdrant: 'unconfigured',
  };

  try {
    await getPool().query('SELECT 1');
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  try {
    await getRedis().ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  try {
    const response = await fetch(`${config.qdrant.url}/healthz`);
    checks.qdrant = response.ok ? 'ok' : 'error';
  } catch {
    checks.qdrant = 'error';
  }

  const allCriticalOk = checks.database === 'ok';
  const status: HealthCheck['status'] = allCriticalOk ? 'ok' : 'down';

  res.status(allCriticalOk ? 200 : 503).json({ status, timestamp: new Date().toISOString(), checks });
});

// ─── Auth (public) ───────────────────────────────────────────────────────────
app.use('/auth', authRouter);

// ─── Webhook (public) ─────────────────────────────────────────────────────────
// Meta'dan gelen istekler API key taşımaz, imza ile doğrulanır
app.use('/webhook', webhookRouter);

// ─── Protected Routes ─────────────────────────────────────────────────────────
app.use('/settings', apiKeyMiddleware, rateLimitMiddleware, settingsRouter);
app.use('/conversations', apiKeyMiddleware, rateLimitMiddleware, conversationsRouter);
app.use('/conversations/:id/messages', apiKeyMiddleware, rateLimitMiddleware, messagesRouter);
app.use('/documents', apiKeyMiddleware, rateLimitMiddleware, documentsRouter);
app.use('/workspace', apiKeyMiddleware, rateLimitMiddleware, workspaceRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(config.port, async () => {
  console.log(`\n🚀 API server running on http://localhost:${config.port}`);
  console.log(`   Environment : ${config.env}`);
  console.log(`   Health      : http://localhost:${config.port}/health\n`);

  // Qdrant koleksiyonunu garantiye al
  await ensureCollection().catch((err) =>
    console.warn('[Qdrant] Could not ensure collection:', err.message)
  );

  // BullMQ worker'larını başlat
  startDocumentWorker();
  startMessageWorker();
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(async () => {
    await Promise.all([closePool(), closeRedis(), closeQueues()]);
    console.log('✓ Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Force shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
