import { Queue } from 'bullmq';
import { config } from '../config';

// Redis bağlantı ayarı — BullMQ bunu kullanır
const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

// ─── Job Tipleri ──────────────────────────────────────────────────────────────

export interface EmbedDocumentJob {
  documentId: string;
  companyId: string;
  content: string;
  title: string;
  chunks: string[];
}

export interface ProcessMessageJob {
  conversationId: string;
  companyId: string;
  customerId?: string;
  content: string;
  source: 'whatsapp' | 'api' | 'widget';
  externalMessageId?: string; // idempotency için
}

export type JobName = 'embed-document' | 'process-message';

// ─── Kuyruklar ────────────────────────────────────────────────────────────────

export const documentQueue = new Queue<EmbedDocumentJob>('documents', {
  connection,
  defaultJobOptions: {
    attempts: 3,                    // başarısız olursa 3 kez dene
    backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s bekle
    removeOnComplete: { count: 100 },  // son 100 başarılı job'ı tut
    removeOnFail: { count: 50 },       // son 50 başarısız job'ı tut
  },
});

export const messageQueue = new Queue<ProcessMessageJob>('messages', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

// Graceful shutdown için
export async function closeQueues(): Promise<void> {
  await Promise.all([documentQueue.close(), messageQueue.close()]);
}
