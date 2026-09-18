import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function isPrivateAddress(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized === 'metadata.google.internal'
  ) {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    return isPrivateAddress(normalized.slice('::ffff:'.length));
  }

  const version = isIP(normalized);
  if (version === 4) {
    const [a, b, c] = normalized.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  if (version === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:')
    );
  }

  return false;
}

export function assertSafeProviderUrl(
  raw: string,
  allowLocal = process.env.NODE_ENV !== 'production',
): URL {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) provider URLs are supported');
  }
  if (url.username || url.password) {
    throw new Error('Provider URLs cannot contain embedded credentials');
  }
  if (!allowLocal && isPrivateAddress(url.hostname)) {
    throw new Error('Private or local provider endpoints are blocked in hosted mode');
  }
  return url;
}

/**
 * Resolve hostnames immediately before dispatch so a public hostname cannot
 * resolve to loopback/private infrastructure and bypass the string-level check.
 */
export async function assertSafeProviderUrlResolved(
  raw: string,
  allowLocal = process.env.NODE_ENV !== 'production',
): Promise<URL> {
  const url = assertSafeProviderUrl(raw, allowLocal);
  if (allowLocal || isIP(url.hostname.replace(/^\[|\]$/g, ''))) return url;

  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('Provider hostname resolves to a private or reserved address');
  }
  return url;
}
