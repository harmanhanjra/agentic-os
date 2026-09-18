import { assertSafeProviderUrlResolved } from './url';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export async function safeProviderFetch(
  rawUrl: string,
  init: RequestInit = {},
  allowLocal = false,
): Promise<Response> {
  const url = await assertSafeProviderUrlResolved(rawUrl, allowLocal);
  const response = await fetch(url, { ...init, redirect: 'manual' });
  if (REDIRECTS.has(response.status)) {
    throw new Error('Provider redirects are blocked to prevent SSRF redirect bypasses.');
  }
  return response;
}
