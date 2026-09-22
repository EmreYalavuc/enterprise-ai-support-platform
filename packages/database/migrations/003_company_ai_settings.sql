-- Şirket başına AI provider ayarları
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ai_provider  VARCHAR(20)  DEFAULT 'claude',
  ADD COLUMN IF NOT EXISTS ai_api_key   TEXT,
  ADD COLUMN IF NOT EXISTS ai_model     VARCHAR(50);
