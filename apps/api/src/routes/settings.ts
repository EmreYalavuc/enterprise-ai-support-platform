import { Router } from 'express';
import { getPool } from '@ai-support/database';
import { encrypt } from '../services/encryption';
import { testConnection, type DbType } from '../services/dbConnector';

const router = Router();
const VALID_DB_TYPES: DbType[] = ['postgresql', 'mysql', 'mongodb'];

// GET /settings — şirket ayarlarını getir (hassas bilgiler gizlenir)
router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ai_provider, ai_model,
              ai_api_key IS NOT NULL AND ai_api_key != '' as has_ai_key,
              db_type, db_label,
              db_conn_enc IS NOT NULL as has_db
       FROM companies WHERE id = $1`,
      [req.company.id]
    );
    const row = result.rows[0] ?? {};
    res.json({
      success: true,
      data: {
        ai_provider: row.ai_provider ?? 'mock',
        ai_model: row.ai_model ?? '',
        has_ai_key: row.has_ai_key ?? false,
        db_type: row.db_type ?? null,
        db_label: row.db_label ?? '',
        has_db: row.has_db ?? false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /settings — AI provider, model ve key güncelle
router.patch('/', async (req, res, next) => {
  const { ai_provider, ai_model, ai_api_key } = req.body;

  const validProviders = ['claude', 'gemini', 'mock'];
  if (ai_provider && !validProviders.includes(ai_provider)) {
    res.status(400).json({ success: false, error: `ai_provider must be one of: ${validProviders.join(', ')}` });
    return;
  }

  try {
    const pool = getPool();
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (ai_provider !== undefined) { fields.push(`ai_provider = $${i++}`); values.push(ai_provider); }
    if (ai_model !== undefined)    { fields.push(`ai_model = $${i++}`);    values.push(ai_model || null); }
    if (ai_api_key !== undefined)  { fields.push(`ai_api_key = $${i++}`);  values.push(ai_api_key || null); }

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' });
      return;
    }

    values.push(req.company.id);
    await pool.query(
      `UPDATE companies SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
      values
    );

    res.json({ success: true, data: { message: 'Settings updated' } });
  } catch (err) {
    next(err);
  }
});

// POST /settings/db/test — bağlantı string'ini kaydetmeden test et
router.post('/db/test', async (req, res, next) => {
  const { db_type, connection_string } = req.body;

  if (!db_type || !VALID_DB_TYPES.includes(db_type)) {
    res.status(400).json({ success: false, error: `db_type must be one of: ${VALID_DB_TYPES.join(', ')}` });
    return;
  }
  if (!connection_string || typeof connection_string !== 'string') {
    res.status(400).json({ success: false, error: 'connection_string is required' });
    return;
  }

  try {
    const result = await testConnection(db_type as DbType, connection_string);
    res.json({ success: result.ok, data: { message: result.message } });
  } catch (err) {
    next(err);
  }
});

// PATCH /settings/db — DB bağlantısını kaydet (şifreli)
router.patch('/db', async (req, res, next) => {
  const { db_type, db_label, connection_string } = req.body;

  if (db_type && !VALID_DB_TYPES.includes(db_type)) {
    res.status(400).json({ success: false, error: `db_type must be one of: ${VALID_DB_TYPES.join(', ')}` });
    return;
  }

  try {
    const pool = getPool();

    if (connection_string === null || connection_string === '') {
      // Bağlantıyı sil
      await pool.query(
        'UPDATE companies SET db_type = NULL, db_label = NULL, db_conn_enc = NULL, updated_at = NOW() WHERE id = $1',
        [req.company.id]
      );
    } else {
      const fields: string[] = [];
      const values: unknown[] = [];
      let i = 1;

      if (db_type !== undefined)          { fields.push(`db_type = $${i++}`);     values.push(db_type); }
      if (db_label !== undefined)         { fields.push(`db_label = $${i++}`);    values.push(db_label || null); }
      if (connection_string !== undefined) {
        fields.push(`db_conn_enc = $${i++}`);
        values.push(encrypt(connection_string));
      }

      if (fields.length === 0) {
        res.status(400).json({ success: false, error: 'No fields to update' });
        return;
      }

      values.push(req.company.id);
      await pool.query(
        `UPDATE companies SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
        values
      );
    }

    res.json({ success: true, data: { message: 'Database connection saved' } });
  } catch (err) {
    next(err);
  }
});

export default router;
