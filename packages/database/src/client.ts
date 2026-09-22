import { Pool } from 'pg';

// Singleton pattern: uygulama boyunca tek bir pool instance.
// Her çağrıda yeni pool oluşturulmaz.
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,                   // Maksimum eş zamanlı bağlantı
      idleTimeoutMillis: 30_000, // 30s boş kalan bağlantıyı kapat
      connectionTimeoutMillis: 3_000, // 3s'de bağlanamaz → hata fırlat
    });

    // Pool seviyesindeki hataları yakala (idle connection beklenmedik kopar)
    // Bu olmadan process crash eder.
    pool.on('error', (err) => {
      console.error('[Database] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
