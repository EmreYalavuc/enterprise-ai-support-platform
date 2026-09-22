import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// 32-byte key: env var yoksa JWT secret'tan türet
function getKey(): Buffer {
  const raw = process.env.DB_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'fallback-key-change-in-prod';
  return createHash('sha256').update(raw).digest(); // her zaman 32 byte
}

// AES-256-GCM ile şifrele → "iv:ciphertext:tag" formatında base64 string
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // GCM için 12 byte IV
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), encrypted.toString('base64'), tag.toString('base64')].join(':');
}

// "iv:ciphertext:tag" formatından çöz
export function decrypt(encoded: string): string {
  const [ivB64, encB64, tagB64] = encoded.split(':');
  if (!ivB64 || !encB64 || !tagB64) throw new Error('Invalid encrypted format');
  const iv = Buffer.from(ivB64, 'base64');
  const encrypted = Buffer.from(encB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
