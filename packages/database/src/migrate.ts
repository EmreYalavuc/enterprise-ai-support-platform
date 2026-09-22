import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Monorepo kökündeki .env'i yükle
// __dirname = packages/database/src → ../../../ = proje kökü
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function migrate(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Migration geçmişini tutan tablo. İlk çalıştırmada oluşturulur.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id          SERIAL       PRIMARY KEY,
        filename    VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // 001_, 002_, ... sırasıyla

    for (const file of files) {
      const { rows } = await pool.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [file]
      );

      if (rows.length > 0) {
        console.log(`  → skip  ${file}`);
        continue;
      }

      console.log(`  → run   ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      // Transaction içinde çalıştır: SQL başarısız olursa tüm migration rollback.
      // Yarı uygulanmış schema = en kötü senaryo.
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`  ✓ done  ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    }

    console.log('\n✅ All migrations completed.\n');
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
