import { isIP } from 'node:net';

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized === 'metadata.google.internal') return true;
  const version = isIP(normalized);
  if (version === 4) { const parts = normalized.split('.').map(Number); return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168); }
  if (version === 6) return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  return false;
}
export function assertSafeProviderUrl(raw: string, allowLocal = process.env.NODE_ENV !== 'production'): URL {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) provider URLs are supported');
  if (!allowLocal && isPrivateHost(url.hostname)) throw new Error('Private or local provider endpoints are blocked in hosted mode');
  if (url.username || url.password) throw new Error('Provider URLs cannot contain embedded credentials');
  return url;
}
