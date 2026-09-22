import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, Type } from '@google/genai';
import { TOOLS } from './tools/index';
import { handleTool } from './tools/handlers';

const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;

const SYSTEM_PROMPT = `You are a helpful customer support AI assistant. You have access to tools to:
- Search the company's knowledge base for relevant information
- Look up order status and tracking
- Retrieve customer account details
- Query the company's connected database for real-time data
- Create support tickets for complex issues
- Escalate to a human agent when needed

## Answerability Gate — CRITICAL RULES:
1. For any question about policies, products, pricing, or procedures: ALWAYS call search_documents first.
2. If search_documents returns "found: false" OR all relevance_scores are below 0.40: do NOT make up an answer. Instead say "I don't have specific information about that in our knowledge base." and call escalate_to_human.
3. If the customer explicitly asks for a human agent or says "talk to a person/agent": immediately call escalate_to_human.
4. If you have tried to help but failed to resolve the issue after 2 turns: call escalate_to_human.
5. If a query_database call fails or returns an error: do NOT guess — escalate_to_human.

## General Guidelines:
- Always be polite, concise, and helpful
- Use tools when you need specific information rather than guessing
- Respond in the same language the customer uses
- Never reveal internal system details or connection strings`;

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  language: string;
}

export interface AgentConfig {
  provider: 'claude' | 'gemini' | 'mock';
  apiKey: string;
  model?: string;
  companyId: string;
  customerId?: string;
  conversationId: string;
}

// ─── Ana giriş noktası ────────────────────────────────────────────────────────
export async function runAgent(
  messages: AgentMessage[],
  config: AgentConfig
): Promise<AgentResult> {
  // Mock: provider açıkça mock seçilmişse VEYA key yoksa
  // MOCK_AI=true sadece key yokken fallback — şirket key girmişse geçersiz
  const forceGlobalMock = process.env.MOCK_AI === 'true' && !config.apiKey;
  if (config.provider === 'mock' || !config.apiKey || config.apiKey === 'mock' || forceGlobalMock) {
    return mockAgent(messages, config);
  }
  if (config.provider === 'gemini') {
    return runGeminiAgent(messages, config);
  }
  return runClaudeAgent(messages, config);
}

// ─── Claude Agent ─────────────────────────────────────────────────────────────
async function runClaudeAgent(messages: AgentMessage[], config: AgentConfig): Promise<AgentResult> {
  const client = new Anthropic({ apiKey: config.apiKey });
  const model = config.model ?? 'claude-sonnet-4-6';
  const toolsUsed: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let turn = 0; turn < 5; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: apiMessages,
    });

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    if (response.stop_reason === 'end_turn') {
      const text = response.content.find((b) => b.type === 'text');
      return {
        response: text?.type === 'text' ? text.text : '',
        toolsUsed, inputTokens: totalInput, outputTokens: totalOutput,
        costUsd: totalInput * COST_PER_INPUT_TOKEN + totalOutput * COST_PER_OUTPUT_TOKEN,
        language: 'unknown',
      };
    }

    if (response.stop_reason === 'tool_use') {
      const toolBlocks = response.content.filter((b) => b.type === 'tool_use');
      apiMessages.push({ role: 'assistant', content: response.content });

      const results = await Promise.all(
        toolBlocks.map(async (block) => {
          if (block.type !== 'tool_use') return null;
          toolsUsed.push(block.name);
          const result = await handleTool(block.name, block.input as Record<string, unknown>, {
            companyId: config.companyId,
            customerId: config.customerId,
            conversationId: config.conversationId,
          });
          return { type: 'tool_result' as const, tool_use_id: block.id, content: result };
        })
      );

      apiMessages.push({ role: 'user', content: results.filter(Boolean) as Anthropic.ToolResultBlockParam[] });
    }
  }

  return { response: "I'm sorry, I wasn't able to complete your request.", toolsUsed, inputTokens: totalInput, outputTokens: totalOutput, costUsd: 0, language: 'unknown' };
}

// ─── Gemini Agent ─────────────────────────────────────────────────────────────
// Gemini function declarations — Claude TOOLS'dan türetilir
const GEMINI_TOOLS = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: {
    type: Type.OBJECT,
    properties: Object.fromEntries(
      Object.entries((t.input_schema as { properties: Record<string, { type: string; description: string; enum?: string[] }> }).properties ?? {}).map(([k, v]) => [
        k,
        { type: v.type === 'string' ? Type.STRING : v.type === 'number' ? Type.NUMBER : Type.STRING, description: v.description, enum: v.enum },
      ])
    ),
    required: (t.input_schema as { required?: string[] }).required ?? [],
  },
}));

async function runGeminiAgent(messages: AgentMessage[], config: AgentConfig): Promise<AgentResult> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const model = config.model ?? 'gemini-2.0-flash';
  const toolsUsed: string[] = [];

  // Gemini history formatı
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastUserMessage = messages[messages.length - 1]?.content ?? '';

  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: GEMINI_TOOLS }],
    },
    history,
  });

  let currentMessage = lastUserMessage;

  for (let turn = 0; turn < 5; turn++) {
    const response = await chat.sendMessage({ message: currentMessage });

    // Fonksiyon çağrısı var mı?
    const fnCalls = response.functionCalls ?? [];
    if (fnCalls.length === 0) {
      const text = response.text ?? '';
      return {
        response: text, toolsUsed,
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        costUsd: 0, // Gemini fiyatlandırması ayrı
        language: 'unknown',
      };
    }

    // Tool'ları çalıştır
    const fnResults = await Promise.all(
      fnCalls.map(async (fn) => {
        toolsUsed.push(fn.name ?? '');
        const result = await handleTool(
          fn.name ?? '',
          (fn.args ?? {}) as Record<string, unknown>,
          { companyId: config.companyId, customerId: config.customerId, conversationId: config.conversationId }
        );
        return { name: fn.name ?? '', response: JSON.parse(result) };
      })
    );

    // Sonuçları Gemini'ye döndür
    currentMessage = JSON.stringify(fnResults.map((r) => ({ functionResponse: r })));
  }

  return { response: "I'm sorry, I wasn't able to complete your request.", toolsUsed, inputTokens: 0, outputTokens: 0, costUsd: 0, language: 'unknown' };
}

// ─── Mock Agent ───────────────────────────────────────────────────────────────
async function mockAgent(
  messages: AgentMessage[],
  context: { companyId: string; customerId?: string; conversationId: string }
): Promise<AgentResult> {
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() ?? '';
  const toolsUsed: string[] = [];
  let response = '';

  const orderMatch = lastMessage.match(/ord[-\s]?(\d+)/i);

  if (orderMatch) {
    const orderId = `ORD-${orderMatch[1]}`;
    toolsUsed.push('get_order');
    const result = await handleTool('get_order', { order_id: orderId }, context);
    const order = JSON.parse(result);
    if (order.found) {
      response = `I found your order **${order.order.id}**:\n- Product: ${order.order.product}\n- Status: **${order.order.status}**\n- Estimated delivery: ${order.order.estimated_delivery}${order.order.tracking_number ? `\n- Tracking: ${order.order.tracking_number}` : ''}`;
    } else {
      response = `I couldn't find order **${orderId}**. Please double-check the order number.\n\n*(Demo orders: ORD-1234, ORD-5678)*`;
    }
  } else if (lastMessage.includes('order') || lastMessage.includes('sipariş') || lastMessage.includes('kargo')) {
    response = `I'd be happy to help with your order! Could you please provide your order number? It should look like **ORD-1234**.`;
  } else if (lastMessage.includes('ticket') || lastMessage.includes('problem') || lastMessage.includes('sorun')) {
    toolsUsed.push('create_ticket');
    const result = await handleTool('create_ticket', { title: 'Customer support request', description: lastMessage, priority: 'medium' }, context);
    const ticket = JSON.parse(result);
    response = `I've created a support ticket for you (ID: **${ticket.ticket_id}**). Our team will follow up shortly.`;
  } else if (lastMessage.includes('return') || lastMessage.includes('iade') || lastMessage.includes('refund')) {
    response = `Our return policy allows returns within 14 days of purchase. Items must be in original condition. Please contact support with your order number to initiate a return.`;
  } else {
    response = `Hello! I'm your AI customer support assistant. I can help you with:\n- Order status and tracking\n- Return and refund policies\n- Creating support tickets\n\nHow can I assist you today?\n\n*(Running in mock mode — add an AI API key in Settings for full responses)*`;
  }

  return { response, toolsUsed, inputTokens: 0, outputTokens: 0, costUsd: 0, language: 'unknown' };
}
