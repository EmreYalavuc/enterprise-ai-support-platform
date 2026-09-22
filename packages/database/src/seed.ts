import * as crypto from 'crypto';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { rows } = await pool.query('SELECT id FROM companies LIMIT 1');
    if (rows.length > 0) {
      console.log('⚠️  Database already seeded. Run with FORCE=true to re-seed.');
      return;
    }

    // API key üretimi:
    // - Gerçek key: prefix + 48 hex karakter (yüksek entropi)
    // - DB'ye sadece SHA-256 hash'ini saklarız
    // - Gerçek key bir kez gösterilir, bir daha alınamaz (tıpkı GitHub token gibi)
    const rawApiKey = `sk_test_${crypto.randomBytes(24).toString('hex')}`;
    const apiKeyHash = crypto
      .createHash('sha256')
      .update(rawApiKey)
      .digest('hex');

    const { rows: [company] } = await pool.query<{ id: string; name: string }>(
      `INSERT INTO companies (name, api_key_hash, settings)
       VALUES ($1, $2, $3)
       RETURNING id, name`,
      [
        'Acme Corp',
        apiKeyHash,
        JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 4096,
          rag_top_k: 5,
        }),
      ]
    );

    // Test müşterisi
    await pool.query(
      `INSERT INTO customers (company_id, external_id, email, name, phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [company.id, 'CUST-001', 'test@example.com', 'Test Kullanıcı', '+905551234567']
    );

    console.log('\n✅ Seed completed!\n');
    console.log('─'.repeat(60));
    console.log(`Company : ${company.name}`);
    console.log(`ID      : ${company.id}`);
    console.log('\n🔑 API Key (bu anahtarı kaydet, bir daha gösterilmez):');
    console.log(`\n  ${rawApiKey}\n`);
    console.log('─'.repeat(60));
    console.log('\nKullanım: X-API-Key header\'ına ekle.\n');
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
