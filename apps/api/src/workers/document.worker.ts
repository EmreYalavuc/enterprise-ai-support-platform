import { Worker, type Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { getPool } from '@ai-support/database';
import { embed } from '../services/embedder';
import { getQdrant, COLLECTION } from '../services/qdrant';
import type { EmbedDocumentJob } from '../services/queue';
import { config } from '../config';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

async function processEmbedJob(job: Job<EmbedDocumentJob>): Promise<void> {
  const { documentId, companyId, content: _content, title, chunks } = job.data;
  const pool = getPool();

  console.log(`[Worker] Processing document ${documentId} — ${chunks.length} chunks`);

  // İlerlemeyi job'a yaz (0-100 arası)
  await job.updateProgress(10);

  // 1. Chunk'ları embed et
  const vectors = await embed(chunks);
  await job.updateProgress(60);

  // 2. Qdrant'a upsert et
  const qdrant = getQdrant();
  const points = chunks.map((chunk, i) => ({
    id: randomUUID(),
    vector: vectors[i],
    payload: { company_id: companyId, document_id: documentId, chunk_index: i, content: chunk, title },
  }));

  await qdrant.upsert(COLLECTION, { wait: true, points });
  await job.updateProgress(80);

  // 3. Chunk'ları DB'ye kaydet
  for (const [i, chunk] of chunks.entries()) {
    await pool.query(
      `INSERT INTO document_chunks (document_id, content, chunk_index, qdrant_point_id)
       VALUES ($1, $2, $3, $4)`,
      [documentId, chunk, i, points[i].id]
    );
  }

  // 4. Dökümanı indexed olarak işaretle
  await pool.query(
    `UPDATE documents SET status = 'indexed', chunk_count = $1, updated_at = NOW() WHERE id = $2`,
    [chunks.length, documentId]
  );

  await job.updateProgress(100);
  console.log(`[Worker] Document ${documentId} indexed successfully`);
}

export function startDocumentWorker(): Worker<EmbedDocumentJob> {
  const worker = new Worker<EmbedDocumentJob>('documents', processEmbedJob, {
    connection,
    concurrency: 2, // aynı anda max 2 döküman işle
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);

    // Son deneme başarısız → dökümanı failed olarak işaretle
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      getPool()
        .query(`UPDATE documents SET status = 'failed', updated_at = NOW() WHERE id = $1`, [
          job.data.documentId,
        ])
        .catch(() => {}); // shutdown sırasında hata olabilir, yutuyoruz
    }
  });

  worker.on('error', (err) => {
    console.error('[Worker] Worker error:', err.message);
  });

  console.log('[Worker] Document worker started');
  return worker;
}
