import { Router } from 'express';
import { getPool } from '@ai-support/database';
import { searchVectors } from '../services/qdrant';
import { embed, chunkText } from '../services/embedder';
import { documentQueue } from '../services/queue';
import type { Document, ApiResponse } from '@ai-support/shared';

const router = Router();

// POST /documents — döküman yükle, chunk'la, embed et, Qdrant'a kaydet
router.post('/', async (req, res, next) => {
  const { title, content, source_type = 'text' } = req.body;

  if (!title || typeof title !== 'string') {
    res.status(400).json({ success: false, error: 'title is required' });
    return;
  }
  if (!content || typeof content !== 'string' || content.trim().length < 50) {
    res.status(400).json({ success: false, error: 'content must be at least 50 characters' });
    return;
  }

  const validTypes = ['text', 'pdf', 'url', 'csv'];
  if (!validTypes.includes(source_type)) {
    res.status(400).json({ success: false, error: `source_type must be one of: ${validTypes.join(', ')}` });
    return;
  }

  const pool = getPool();

  try {
    // 1. Dökümanı DB'ye kaydet (processing)
    const docResult = await pool.query<Document>(
      `INSERT INTO documents (company_id, title, source_type, content, status, chunk_count)
       VALUES ($1, $2, $3, $4, 'processing', 0) RETURNING *`,
      [req.company.id, title, source_type, content]
    );
    const document = docResult.rows[0];

    // 2. Chunk'ları burada böl — worker'a hazır gönder
    const chunks = chunkText(content);

    // 3. Embedding işini kuyruğa ekle — hemen 202 dön
    await documentQueue.add('embed-document', {
      documentId: document.id,
      companyId: req.company.id,
      content,
      title,
      chunks,
    });

    const response: ApiResponse<Document> = { success: true, data: document };
    res.status(202).json(response); // 202 Accepted — işleniyor
  } catch (err) {
    next(err);
  }
});

// GET /documents — şirkete ait dökümanları listele
router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query<Document>(
      'SELECT * FROM documents WHERE company_id = $1 ORDER BY created_at DESC',
      [req.company.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /documents/search?q=... — semantik arama
// Not: /:id'den ÖNCE tanımlanmalı, yoksa "search" bir id olarak yorumlanır
router.get('/search', async (req, res, next) => {
  const query = req.query.q as string;
  const limit = Math.min(10, Math.max(1, parseInt(req.query.limit as string ?? '5', 10)));

  if (!query || query.trim().length < 3) {
    res.status(400).json({ success: false, error: 'q must be at least 3 characters' });
    return;
  }

  try {
    const [queryVector] = await embed([query]);

    const results = await searchVectors(req.company.id, queryVector, limit);

    res.json({
      success: true,
      data: results.map((r) => ({
        score: r.score,
        content: r.payload?.content,
        document_id: r.payload?.document_id,
        title: r.payload?.title,
        chunk_index: r.payload?.chunk_index,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /documents/:id — tek dökümanı getir
router.get('/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query<Document>(
      'SELECT * FROM documents WHERE id = $1 AND company_id = $2',
      [req.params.id, req.company.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /documents/:id — dökümanı ve Qdrant'taki vektörlerini sil
router.delete('/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query<Document>(
      'SELECT * FROM documents WHERE id = $1 AND company_id = $2',
      [req.params.id, req.company.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    // Qdrant'tan bu dökümanın tüm vektörlerini sil
    await getQdrant().deletePoints(COLLECTION, {
      wait: true,
      points: { filter: { must: [{ key: 'document_id', match: { value: req.params.id } }] } },
    });

    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

export default router;
