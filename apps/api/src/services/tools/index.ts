import type Anthropic from '@anthropic-ai/sdk';

// Claude'a verilen tool tanımları — JSON Schema formatında
// Claude bu şemaları okuyarak hangi argümanlarla çağırabileceğini öğrenir

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_documents',
    description:
      'Search the company knowledge base for relevant information. Use this when the customer asks about policies, procedures, products, or anything that might be documented.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant documents',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (1-5)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_order',
    description:
      'Retrieve order information for a customer. Use when the customer asks about their order status, tracking, or delivery.',
    input_schema: {
      type: 'object' as const,
      properties: {
        order_id: {
          type: 'string',
          description: 'The order ID to look up',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'get_customer_info',
    description:
      'Get customer account information. Use when you need to verify customer details or understand their account status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: {
          type: 'string',
          description: 'The customer ID to look up',
        },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'create_ticket',
    description:
      'Create a support ticket for issues that cannot be resolved immediately. Use when the customer has a complex problem requiring follow-up.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Brief title of the issue',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the problem',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Priority level of the ticket',
        },
      },
      required: ['title', 'description', 'priority'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Transfer this conversation to a human support agent. Use when: (1) the customer asks to speak to a human, (2) you cannot find relevant information in the knowledge base, (3) the issue is too complex to resolve automatically, or (4) after 2 failed attempts to help.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description: 'Why this conversation is being escalated (shown to the human agent)',
        },
        summary: {
          type: 'string',
          description: 'Brief summary of the conversation so far for the agent',
        },
      },
      required: ['reason'],
    },
  },
  {
    name: 'query_database',
    description:
      'Run a SELECT query against the company\'s connected database to look up real data (orders, customers, products, inventory, etc.). Only use when the company has a database connected. For MongoDB use JSON format: {"collection":"orders","filter":{"status":"pending"},"limit":10}. For SQL databases use standard SELECT syntax.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'SQL SELECT statement or MongoDB JSON query',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'http_request',
    description:
      'Make an HTTP request to an external API or webhook. Use when you need to fetch real-time data (inventory, pricing, bookings) or trigger actions in the company\'s own systems.',
    input_schema: {
      type: 'object' as const,
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH'],
          description: 'HTTP method',
        },
        url: {
          type: 'string',
          description: 'Full URL to call (must be https://)',
        },
        headers: {
          type: 'object',
          description: 'Optional HTTP headers (e.g. Authorization)',
          additionalProperties: { type: 'string' },
        },
        body: {
          type: 'object',
          description: 'Request body for POST/PUT/PATCH',
        },
      },
      required: ['method', 'url'],
    },
  },
];
