import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function keyFromSecret(secret: string): Buffer { return createHash('sha256').update(secret).digest(); }
export function encryptSecret(value: string, secret = process.env.CREDENTIAL_ENCRYPTION_KEY): string {
  if (!secret) throw new Error('CREDENTIAL_ENCRYPTION_KEY is not configured');
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decryptSecret(payload: string, secret = process.env.CREDENTIAL_ENCRYPTION_KEY): string {
  if (!secret) throw new Error('CREDENTIAL_ENCRYPTION_KEY is not configured');
  const [iv, tag, data] = payload.split('.');
  if (!iv || !tag || !data) throw new Error('Invalid encrypted credential');
  const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
export function maskSecret(value: string): string { return value.length <= 6 ? '••••••' : `${value.slice(0, 3)}${'•'.repeat(Math.min(8, Math.max(4, value.length - 5)))}${value.slice(-2)}`; }
