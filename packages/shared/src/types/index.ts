// ─── Domain Enums ─────────────────────────────────────────────────────────────

export type Channel = 'web' | 'whatsapp' | 'api';
export type ConversationStatus = 'active' | 'resolved' | 'escalated';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'failed';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type WebhookStatus = 'received' | 'processing' | 'processed' | 'failed';

// ─── Database Row Types ────────────────────────────────────────────────────────
// Bu tipler DB'den gelen ham satırları temsil eder.
// snake_case: PostgreSQL convention'ı.

export interface Company {
  id: string;
  name: string;
  api_key_hash: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Customer {
  id: string;
  company_id: string;
  external_id: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface Conversation {
  id: string;
  company_id: string;
  customer_id: string | null;
  channel: Channel;
  status: ConversationStatus;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  // Tool call sonuçları, model parametreleri gibi ek veriler için
  metadata: Record<string, unknown>;
  tokens_input: number | null;
  tokens_output: number | null;
  created_at: Date;
}

export interface Ticket {
  id: string;
  company_id: string;
  customer_id: string | null;
  conversation_id: string | null;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  external_ticket_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface Document {
  id: string;
  company_id: string;
  title: string;
  source_type: 'pdf' | 'url' | 'text' | 'csv';
  source_url: string | null;
  content: string | null;
  status: DocumentStatus;
  chunk_count: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  qdrant_point_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface WebhookEvent {
  id: string;
  idempotency_key: string;
  source: string;
  event_type: string | null;
  payload: Record<string, unknown>;
  status: WebhookStatus;
  processed_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

// ─── API Response Types ────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface HealthCheck {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  checks: {
    database: 'ok' | 'error' | 'unconfigured';
    redis: 'ok' | 'error' | 'unconfigured';
    qdrant: 'ok' | 'error' | 'unconfigured';
  };
}
