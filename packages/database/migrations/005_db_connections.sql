-- Şirketlerin kendi veritabanlarını bağlayabilmesi için
-- Bağlantı string'i AES-256-GCM ile şifreli saklanır

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS db_type       VARCHAR(20),   -- 'postgresql' | 'mysql' | 'mongodb'
  ADD COLUMN IF NOT EXISTS db_label      VARCHAR(100),  -- kullanıcının verdiği isim, ör. "Sipariş DB"
  ADD COLUMN IF NOT EXISTS db_conn_enc   TEXT;          -- AES-256-GCM şifreli bağlantı string'i
