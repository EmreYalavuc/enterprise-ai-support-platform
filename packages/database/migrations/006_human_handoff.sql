-- Human Handoff & Agent Workspace için schema değişiklikleri

-- messages.role'a 'agent' ekle (insan temsilcinin yazdığı mesajlar)
ALTER TABLE messages DROP CONSTRAINT messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check
  CHECK (role IN ('user', 'assistant', 'system', 'tool', 'agent'));

-- conversations: kim üstlendi, ne zaman escalate edildi
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS assigned_to  UUID        REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_to);
