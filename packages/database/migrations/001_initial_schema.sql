-- Migration: 001_initial_schema
-- Bu SQL dosyası production'a çıkacak şekilde tasarlandı.
-- Her tablo kendi bölümünde, index'ler en sonda.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Companies ────────────────────────────────────────────────────────────────
-- Multi-tenant mimari: bir platform, birden fazla şirket.
-- api_key_hash: Asla plain-text API key saklamayız. Hash saklarız, karşılaştırırız.
-- settings: Her şirketin farklı LLM modeli, farklı token limiti olabilir.
CREATE TABLE companies (
    id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           VARCHAR(255) NOT NULL,
    api_key_hash   VARCHAR(255) UNIQUE NOT NULL,
    settings       JSONB        NOT NULL DEFAULT '{}',
    is_active      BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Customers ────────────────────────────────────────────────────────────────
-- Şirketin müşterileri. external_id: şirketin kendi sistemindeki müşteri ID'si.
-- (company_id, external_id) unique: Aynı şirkette aynı external_id olamaz.
-- WhatsApp'tan gelen kullanıcılar phone ile eşleştirilir.
CREATE TABLE customers (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id   UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    external_id  VARCHAR(255),
    email        VARCHAR(255),
    name         VARCHAR(255),
    phone        VARCHAR(50),
    metadata     JSONB        NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, external_id)
);

-- ─── Conversations ────────────────────────────────────────────────────────────
-- Her destek oturumu bir conversation. Web'den, WhatsApp'tan, API'den gelebilir.
-- status: active → resolved/escalated. Escalated = insan temsilciye devir.
-- metadata: kanal'a özel veriler. WhatsApp için wa_message_id gibi.
CREATE TABLE conversations (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id  UUID        REFERENCES customers(id) ON DELETE SET NULL,
    channel      VARCHAR(50) NOT NULL DEFAULT 'web',
    status       VARCHAR(50) NOT NULL DEFAULT 'active',
    metadata     JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT conversations_channel_check
        CHECK (channel IN ('web', 'whatsapp', 'api')),
    CONSTRAINT conversations_status_check
        CHECK (status IN ('active', 'resolved', 'escalated'))
);

-- ─── Messages ────────────────────────────────────────────────────────────────
-- Bir conversation içindeki her mesaj. LLM'e gönderilecek history buradan gelir.
-- role: user/assistant/system/tool — Claude API'nin beklediği formatla birebir.
-- metadata: tool_calls, tool_results, model_version gibi audit verisi.
-- tokens_input/output: maliyet takibi için kritik.
CREATE TABLE messages (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id  UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role             VARCHAR(20) NOT NULL,
    content          TEXT        NOT NULL,
    metadata         JSONB       NOT NULL DEFAULT '{}',
    tokens_input     INTEGER,
    tokens_output    INTEGER,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT messages_role_check
        CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);

-- ─── Documents ───────────────────────────────────────────────────────────────
-- Knowledge Base: şirkete ait dökümanlar (PDF, URL, metin).
-- RAG pipeline bu tabloyu kullanır.
-- status akışı: pending → processing → indexed (ya da failed)
-- chunk_count: kaç parçaya bölündüğü — Qdrant'ta kaç vector var?
CREATE TABLE documents (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id   UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title        VARCHAR(500) NOT NULL,
    source_type  VARCHAR(50)  NOT NULL,
    source_url   TEXT,
    content      TEXT,
    status       VARCHAR(50)  NOT NULL DEFAULT 'pending',
    chunk_count  INTEGER      NOT NULL DEFAULT 0,
    metadata     JSONB        NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT documents_source_type_check
        CHECK (source_type IN ('pdf', 'url', 'text', 'csv')),
    CONSTRAINT documents_status_check
        CHECK (status IN ('pending', 'processing', 'indexed', 'failed'))
);

-- ─── Document Chunks ─────────────────────────────────────────────────────────
-- Döküman büyük olabilir; 500-1000 token'lık parçalara bölünür.
-- Her chunk'ın vektörü Qdrant'ta, metadata'sı burada saklanır.
-- qdrant_point_id: Qdrant'taki UUID ile eşleşir. Hybrid search için.
CREATE TABLE document_chunks (
    id               UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id      UUID    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content          TEXT    NOT NULL,
    chunk_index      INTEGER NOT NULL,
    qdrant_point_id  UUID,
    metadata         JSONB   NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tickets ─────────────────────────────────────────────────────────────────
-- Agent tool calling ile oluşturulan destek biletleri.
-- external_ticket_id: gerçek şirketin Jira/Zendesk ID'si (mock'ta simüle edilir).
CREATE TABLE tickets (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id         UUID         REFERENCES customers(id) ON DELETE SET NULL,
    conversation_id     UUID         REFERENCES conversations(id) ON DELETE SET NULL,
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    status              VARCHAR(50)  NOT NULL DEFAULT 'open',
    priority            VARCHAR(20)  NOT NULL DEFAULT 'medium',
    external_ticket_id  VARCHAR(255),
    metadata            JSONB        NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT tickets_status_check
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    CONSTRAINT tickets_priority_check
        CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

-- ─── Webhook Events ───────────────────────────────────────────────────────────
-- Idempotency için: aynı webhook iki kez gelirse sadece bir kez işle.
-- idempotency_key UNIQUE constraint = veritabanı seviyesinde garanti.
-- Race condition burada oluşabilir: aynı key için iki worker eş zamanlı
-- INSERT yaparsa biri "unique violation" alır → sadece biri işler.
CREATE TABLE webhook_events (
    id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key   VARCHAR(255) UNIQUE NOT NULL,
    source            VARCHAR(50)  NOT NULL,
    event_type        VARCHAR(100),
    payload           JSONB        NOT NULL DEFAULT '{}',
    status            VARCHAR(50)  NOT NULL DEFAULT 'received',
    processed_at      TIMESTAMPTZ,
    error_message     TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT webhook_events_status_check
        CHECK (status IN ('received', 'processing', 'processed', 'failed'))
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- Index olmadan: PostgreSQL tüm tabloyu tarar (full table scan) = yavaş.
-- Bu sorgu pattern'lerine göre index seçtik:
--   "bu şirketin konuşmalarını getir" → company_id index
--   "bu konuşmanın mesajlarını getir" → conversation_id index
--   "bu webhook daha önce işlendi mi?" → idempotency_key (zaten UNIQUE)

CREATE INDEX idx_customers_company_id        ON customers(company_id);
CREATE INDEX idx_conversations_company_id    ON conversations(company_id);
CREATE INDEX idx_conversations_customer_id   ON conversations(customer_id);
CREATE INDEX idx_conversations_status        ON conversations(status);
CREATE INDEX idx_messages_conversation_id    ON messages(conversation_id);
CREATE INDEX idx_messages_created_at         ON messages(created_at);
CREATE INDEX idx_documents_company_id        ON documents(company_id);
CREATE INDEX idx_documents_status            ON documents(status);
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_tickets_company_id          ON tickets(company_id);
CREATE INDEX idx_tickets_customer_id         ON tickets(customer_id);
CREATE INDEX idx_tickets_status              ON tickets(status);
