import * as dotenv from 'dotenv';
import * as path from 'path';

// Monorepo kökündeki .env dosyasını yükle
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    // Startup'ta patlat. Silent failure'dan infinitely daha iyidir.
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  env: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
  port: parseInt(process.env.PORT ?? '3000', 10),

  database: {
    url: requireEnv('DATABASE_URL'),
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },

  qdrant: {
    url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  },

  claude: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    model: process.env.CLAUDE_MODEL ?? 'claude-opus-4-8',
    maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS ?? '4096', 10),
  },

  auth: {
    jwtSecret: requireEnv('JWT_SECRET'),
  },

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? '',
    phoneId: process.env.WHATSAPP_PHONE_ID ?? '',
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET ?? 'dev-secret',
    companyId: process.env.WHATSAPP_COMPANY_ID ?? '',
  },
} as const;
