import { Client as PgClient } from 'pg';
import { decrypt } from './encryption';

export type DbType = 'postgresql' | 'mysql' | 'mongodb';

// SELECT olmayan sorgular reddedilir
function assertSelectOnly(sql: string): void {
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith('SELECT') && !normalized.startsWith('SHOW') && !normalized.startsWith('DESCRIBE')) {
    throw new Error('Only SELECT / SHOW / DESCRIBE queries are allowed.');
  }
  // DROP / DELETE / UPDATE / INSERT / TRUNCATE kelimelerini blokla
  const dangerous = /\b(DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i;
  if (dangerous.test(sql)) {
    throw new Error('Query contains forbidden keywords.');
  }
}

// ─── Bağlantı testi ──────────────────────────────────────────────────────────
export async function testConnection(
  dbType: DbType,
  connectionString: string
): Promise<{ ok: boolean; message: string }> {
  try {
    if (dbType === 'postgresql') {
      const client = new PgClient({ connectionString, connectionTimeoutMillis: 5000 });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return { ok: true, message: 'PostgreSQL connection successful.' };
    }

    if (dbType === 'mysql') {
      const mysql = await import('mysql2/promise');
      const conn = await mysql.createConnection(connectionString);
      await conn.query('SELECT 1');
      await conn.end();
      return { ok: true, message: 'MySQL connection successful.' };
    }

    if (dbType === 'mongodb') {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(connectionString, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      await client.db().command({ ping: 1 });
      await client.close();
      return { ok: true, message: 'MongoDB connection successful.' };
    }

    return { ok: false, message: `Unknown database type: ${dbType}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

// ─── Sorgu çalıştır ──────────────────────────────────────────────────────────
// encryptedConn: şifreli bağlantı string'i (DB'den gelir)
export async function runQuery(
  dbType: DbType,
  encryptedConn: string,
  sql: string
): Promise<{ rows: unknown[]; fields?: string[] }> {
  assertSelectOnly(sql);

  const connectionString = decrypt(encryptedConn);

  if (dbType === 'postgresql') {
    const client = new PgClient({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
      const result = await client.query({ text: sql, rowMode: 'array' });
      const fields = result.fields.map((f) => f.name);
      const rows = result.rows.slice(0, 100); // max 100 satır
      return { rows, fields };
    } finally {
      await client.end();
    }
  }

  if (dbType === 'mysql') {
    const mysql = await import('mysql2/promise');
    const conn = await mysql.createConnection(connectionString);
    try {
      const [rows, fields] = await conn.query(sql);
      const fieldNames = (fields as { name: string }[]).map((f) => f.name);
      const limited = (rows as unknown[]).slice(0, 100);
      return { rows: limited, fields: fieldNames };
    } finally {
      await conn.end();
    }
  }

  if (dbType === 'mongodb') {
    // MongoDB için sql yerine JSON parse edilir: { collection, filter, projection, limit }
    let parsed: { collection: string; filter?: object; projection?: object; limit?: number };
    try {
      parsed = JSON.parse(sql);
    } catch {
      throw new Error('MongoDB queries must be JSON: { "collection": "...", "filter": {}, "limit": 10 }');
    }
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(connectionString, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    try {
      const docs = await client
        .db()
        .collection(parsed.collection)
        .find(parsed.filter ?? {}, { projection: parsed.projection })
        .limit(Math.min(parsed.limit ?? 20, 100))
        .toArray();
      return { rows: docs };
    } finally {
      await client.close();
    }
  }

  throw new Error(`Unsupported database type: ${dbType}`);
}
