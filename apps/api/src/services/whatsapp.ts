import { config } from '../config';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

// Kullanıcıya metin mesajı gönder
export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  // Mock modda veya token yoksa sadece log at
  if (!config.whatsapp.token || !config.whatsapp.phoneId) {
    console.log(`[WhatsApp Mock] → ${to}: ${text.slice(0, 80)}...`);
    return;
  }

  const url = `${GRAPH_API}/${config.whatsapp.phoneId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${body}`);
  }
}

// ─── Webhook Payload Tipleri ──────────────────────────────────────────────────

export interface WhatsAppMessage {
  id: string;         // wamid.xxx — idempotency key
  from: string;       // telefon numarası: "905551234567"
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'interactive';
  text?: { body: string };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: WhatsAppMessage[];
        statuses?: Array<{ id: string; status: string }>;
      };
      field: string;
    }>;
  }>;
}

// Webhook payload'undan gelen mesajları çıkar
export function extractMessages(payload: WhatsAppWebhookPayload): WhatsAppMessage[] {
  const messages: WhatsAppMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value.messages ?? []) {
        messages.push(msg);
      }
    }
  }
  return messages;
}
