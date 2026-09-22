-- ─── Full-Text Search ────────────────────────────────────────────────────────
-- Mesaj içeriğinde hızlı metin araması için GIN index
-- Vektör araması semantik, FTS ise exact keyword araması — ikisi tamamlayıcı
CREATE INDEX IF NOT EXISTS idx_messages_fts
  ON messages USING GIN (to_tsvector('english', content));

-- Çok dilli destek için unaccent + simple config (Türkçe dahil)
CREATE INDEX IF NOT EXISTS idx_messages_fts_simple
  ON messages USING GIN (to_tsvector('simple', content));

-- ─── Maliyet Takibi ───────────────────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS language    VARCHAR(10)     DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS cost_usd    NUMERIC(10, 6)  DEFAULT 0;

-- Şirket bazında toplam maliyeti hızlı hesaplamak için index
CREATE INDEX IF NOT EXISTS idx_messages_cost
  ON messages (conversation_id) INCLUDE (cost_usd, tokens_input, tokens_output);

-- ─── Konuşma başına rate limit için index ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages (conversation_id, created_at DESC);
