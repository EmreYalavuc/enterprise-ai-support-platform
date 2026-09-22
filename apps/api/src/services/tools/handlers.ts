import { getPool } from '@ai-support/database';
import { embed } from '../embedder';
import { searchVectors } from '../qdrant';
import { runQuery, type DbType } from '../dbConnector';

interface ToolInput {
  [key: string]: unknown;
}

// Tool sonuçları her zaman string döner — Claude bunu okur
export async function handleTool(
  toolName: string,
  input: ToolInput,
  context: { companyId: string; customerId?: string; conversationId: string }
): Promise<string> {
  switch (toolName) {
    case 'search_documents':
      return searchDocuments(input as { query: string; limit?: number }, context.companyId);

    case 'get_order':
      return getOrder(input as { order_id: string });

    case 'get_customer_info':
      return getCustomerInfo(input as { customer_id: string }, context.companyId);

    case 'create_ticket':
      return createTicket(
        input as { title: string; description: string; priority: string },
        context
      );

    case 'escalate_to_human':
      return escalateToHuman(
        input as { reason: string; summary?: string },
        context.conversationId
      );

    case 'query_database':
      return queryDatabase(input as { query: string }, context.companyId);

    case 'http_request':
      return httpRequest(input as { method: string; url: string; headers?: Record<string, string>; body?: object });

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─── search_documents ─────────────────────────────────────────────────────────
async function searchDocuments(
  input: { query: string; limit?: number },
  companyId: string
): Promise<string> {
  try {
    const [queryVector] = await embed([input.query]);
    const results = await searchVectors(companyId, queryVector, Math.min(input.limit ?? 3, 5));

    if (results.length === 0) {
      return JSON.stringify({ found: false, message: 'No relevant documents found.' });
    }

    return JSON.stringify({
      found: true,
      results: results.map((r) => ({
        title: r.payload?.title,
        content: r.payload?.content,
        relevance_score: Math.round((r.score as number) * 100) / 100,
      })),
    });
  } catch {
    // Embedding servisi henüz hazır değilse boş sonuç dön
    return JSON.stringify({ found: false, message: 'Knowledge base search temporarily unavailable.' });
  }
}

// ─── get_order ────────────────────────────────────────────────────────────────
// Mock servis — Phase 6'da gerçek sipariş sistemi API'siyle değiştirilecek
async function getOrder(input: { order_id: string }): Promise<string> {
  const mockOrders: Record<string, object> = {
    'ORD-1234': {
      id: 'ORD-1234',
      status: 'shipped',
      product: 'Wireless Headphones',
      quantity: 1,
      total: 149.99,
      estimated_delivery: '2026-09-25',
      tracking_number: 'TRK-987654321',
      carrier: 'FedEx',
    },
    'ORD-5678': {
      id: 'ORD-5678',
      status: 'processing',
      product: 'USB-C Hub',
      quantity: 2,
      total: 59.98,
      estimated_delivery: '2026-09-28',
    },
  };

  const order = mockOrders[input.order_id.toUpperCase()];
  if (!order) {
    return JSON.stringify({ found: false, message: `Order ${input.order_id} not found.` });
  }

  return JSON.stringify({ found: true, order });
}

// ─── get_customer_info ────────────────────────────────────────────────────────
async function getCustomerInfo(
  input: { customer_id: string },
  companyId: string
): Promise<string> {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, name, email, phone, created_at FROM customers WHERE id = $1 AND company_id = $2',
      [input.customer_id, companyId]
    );

    if (result.rows.length === 0) {
      return JSON.stringify({ found: false, message: 'Customer not found.' });
    }

    return JSON.stringify({ found: true, customer: result.rows[0] });
  } catch {
    return JSON.stringify({ error: 'Could not retrieve customer information.' });
  }
}

// ─── escalate_to_human ────────────────────────────────────────────────────────
async function escalateToHuman(
  input: { reason: string; summary?: string },
  conversationId: string
): Promise<string> {
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE conversations
       SET status = 'escalated', escalated_at = NOW(), updated_at = NOW(),
           metadata = metadata || $1
       WHERE id = $2`,
      [JSON.stringify({ escalation_reason: input.reason, escalation_summary: input.summary ?? '' }), conversationId]
    );
    return JSON.stringify({
      success: true,
      message: 'Conversation escalated to human agent. A support representative will be with you shortly.',
    });
  } catch {
    return JSON.stringify({ error: 'Could not escalate conversation.' });
  }
}

// ─── query_database ───────────────────────────────────────────────────────────
async function queryDatabase(
  input: { query: string },
  companyId: string
): Promise<string> {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT db_type, db_conn_enc FROM companies WHERE id = $1',
      [companyId]
    );
    const row = result.rows[0];

    if (!row?.db_type || !row?.db_conn_enc) {
      return JSON.stringify({ error: 'No database connected. Ask the company admin to connect a database in Settings.' });
    }

    const data = await runQuery(row.db_type as DbType, row.db_conn_enc, input.query);
    return JSON.stringify({ success: true, row_count: data.rows.length, fields: data.fields, rows: data.rows });
  } catch (err) {
    return JSON.stringify({ error: `Database query failed: ${(err as Error).message}` });
  }
}

// ─── http_request ─────────────────────────────────────────────────────────────
// SSRF koruması: özel IP aralıkları ve iç hostlar engellenir
const BLOCKED_HOSTS = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1)/i;

async function httpRequest(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: object;
}): Promise<string> {
  try {
    const url = new URL(input.url);

    // Sadece HTTPS — HTTP'de man-in-the-middle riski var
    if (url.protocol !== 'https:') {
      return JSON.stringify({ error: 'Only https:// URLs are allowed.' });
    }

    // İç ağ adreslerine istek engelle
    if (BLOCKED_HOSTS.test(url.hostname)) {
      return JSON.stringify({ error: 'Requests to internal addresses are not allowed.' });
    }

    const res = await fetch(input.url, {
      method: input.method,
      headers: { 'Content-Type': 'application/json', ...input.headers },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(8000), // 8 saniye timeout
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text.slice(0, 500); // JSON değilse ilk 500 karakter
    }

    return JSON.stringify({ status: res.status, ok: res.ok, data });
  } catch (err) {
    return JSON.stringify({ error: `Request failed: ${(err as Error).message}` });
  }
}

// ─── create_ticket ────────────────────────────────────────────────────────────
async function createTicket(
  input: { title: string; description: string; priority: string },
  context: { companyId: string; customerId?: string; conversationId: string }
): Promise<string> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO tickets (company_id, customer_id, conversation_id, title, description, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open') RETURNING id`,
      [
        context.companyId,
        context.customerId ?? null,
        context.conversationId,
        input.title,
        input.description,
        input.priority,
      ]
    );

    return JSON.stringify({
      success: true,
      ticket_id: result.rows[0].id,
      message: `Support ticket created with priority: ${input.priority}`,
    });
  } catch {
    return JSON.stringify({ error: 'Could not create ticket.' });
  }
}
