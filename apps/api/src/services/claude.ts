import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { TOOLS } from './tools/index';
import { handleTool } from './tools/handlers';

const client = new Anthropic({ apiKey: config.claude.apiKey });

const SYSTEM_PROMPT = `You are a helpful customer support AI assistant. You have access to tools to:
- Search the company's knowledge base for relevant information
- Look up order status and tracking
- Retrieve customer account details
- Create support tickets for complex issues

Guidelines:
- Always be polite, concise, and helpful
- Use tools when you need specific information rather than guessing
- If you cannot resolve an issue, create a support ticket
- Respond in the same language the customer uses`;

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

// claude-sonnet-4-6 fiyatı: $3/M input, $15/M output
const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;

export interface AgentResult {
  response: string;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  language: string;
}

// Agentic döngü:
// 1. Claude'a mesajları ver
// 2. Claude tool_use ile cevap verirse → tool'u çalıştır → sonucu Claude'a geri ver
// 3. Claude text cevap verene kadar döngü devam eder
// 4. Maksimum 5 tool turu — sonsuz döngü koruması
export async function runAgent(
  messages: AgentMessage[],
  context: { companyId: string; customerId?: string; conversationId: string }
): Promise<AgentResult> {
  const toolsUsed: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Anthropic SDK'nın beklediği formata çevir
  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Mock modu: ANTHROPIC_API_KEY yoksa veya test modundaysa gerçek API yerine mock döner
  if (config.claude.apiKey === 'mock' || process.env.MOCK_AI === 'true') {
    return mockAgent(messages, context);
  }

  for (let turn = 0; turn < 5; turn++) {
    const response = await client.messages.create({
      model: config.claude.model,
      max_tokens: config.claude.maxTokens,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: apiMessages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Claude text cevap verdi → döngü bitti
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      return {
        response: textBlock?.type === 'text' ? textBlock.text : '',
        toolsUsed,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costUsd: totalInputTokens * COST_PER_INPUT_TOKEN + totalOutputTokens * COST_PER_OUTPUT_TOKEN,
        language: 'unknown',
      };
    }

    // Claude tool çağırdı → tool'ları çalıştır
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

      // Claude'un tool_use mesajını konuşma geçmişine ekle
      apiMessages.push({ role: 'assistant', content: response.content });

      // Tüm tool'ları paralel çalıştır
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.type !== 'tool_use') return null;
          toolsUsed.push(block.name);

          const result = await handleTool(
            block.name,
            block.input as Record<string, unknown>,
            context
          );

          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: result,
          };
        })
      );

      // Tool sonuçlarını konuşma geçmişine ekle
      apiMessages.push({
        role: 'user',
        content: toolResults.filter(Boolean) as Anthropic.ToolResultBlockParam[],
      });

      // Döngü: Claude tool sonuçlarıyla devam edecek
    }
  }

  // 5 tur sonunda hâlâ bitmedi → güvenli fallback
  return {
    response: "I'm sorry, I wasn't able to complete your request. Please try again or contact support.",
    toolsUsed,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    costUsd: totalInputTokens * COST_PER_INPUT_TOKEN + totalOutputTokens * COST_PER_OUTPUT_TOKEN,
    language: 'unknown',
  };
}

// ─── Mock Agent ───────────────────────────────────────────────────────────────
// Gerçek API yokken tool calling akışını simüle eder
async function mockAgent(
  messages: AgentMessage[],
  context: { companyId: string; customerId?: string; conversationId: string }
): Promise<AgentResult> {
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() ?? '';
  const toolsUsed: string[] = [];
  let response = '';

  const orderMatch = lastMessage.match(/ord[-\s]?(\d+)/i);

  if (orderMatch) {
    // Mesajda sipariş numarası var — direkt sorgula
    const orderId = `ORD-${orderMatch[1]}`;
    toolsUsed.push('get_order');
    const result = await handleTool('get_order', { order_id: orderId }, context);
    const order = JSON.parse(result);
    if (order.found) {
      response = `I found your order **${order.order.id}**:\n- Product: ${order.order.product}\n- Status: **${order.order.status}**\n- Estimated delivery: ${order.order.estimated_delivery}${order.order.tracking_number ? `\n- Tracking: ${order.order.tracking_number}` : ''}`;
    } else {
      response = `I couldn't find order **${orderId}**. Please double-check the order number and try again.\n\n*(Demo orders: ORD-1234, ORD-5678)*`;
    }
  } else if (lastMessage.includes('order') || lastMessage.includes('sipariş') || lastMessage.includes('kargo')) {
    // Sipariş sözcüğü var ama numara yok — sor
    response = `I'd be happy to help with your order! Could you please provide your order number? It should look like **ORD-1234**.`;
  } else if (lastMessage.includes('ticket') || lastMessage.includes('problem') || lastMessage.includes('broken') || lastMessage.includes('sorun')) {
    toolsUsed.push('create_ticket');
    const result = await handleTool('create_ticket', {
      title: 'Customer support request',
      description: lastMessage,
      priority: 'medium',
    }, context);
    const ticket = JSON.parse(result);
    response = `I've created a support ticket for you (ID: **${ticket.ticket_id}**). Our team will follow up shortly.`;
  } else if (lastMessage.includes('return') || lastMessage.includes('iade') || lastMessage.includes('policy') || lastMessage.includes('politika')) {
    toolsUsed.push('search_documents');
    response = `Our return policy allows returns within 14 days of purchase. Items must be in original condition. Please contact support with your order number to initiate a return.\n\n*(Note: This is a mock response — connect to real knowledge base with API credits)*`;
  } else {
    response = `Hello! I'm your AI customer support assistant. I can help you with:\n- Order status and tracking\n- Return and refund policies\n- Creating support tickets\n\nHow can I assist you today?\n\n*(Running in mock mode — add Anthropic API credits for full AI responses)*`;
  }

  return { response, toolsUsed, inputTokens: 0, outputTokens: 0, costUsd: 0, language: 'unknown' };
}
