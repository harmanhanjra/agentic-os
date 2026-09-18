import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getProvider } from '@/lib/ai/providers';
import { effectiveAuth } from '@/lib/security/store';
import { providerResponseError } from '@/lib/ai/dispatch';
import { safeProviderFetch } from '@/lib/security/fetch';

export const runtime = 'nodejs';

const TestSchema = z.object({ providerId: z.string().min(1).max(50) });

/**
 * Live connection check without spending anything: hits the provider's
 * free model/tag listing with a short timeout. Never returns the key.
 */
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const parsed = TestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !getProvider(parsed.data.providerId)) {
    return Response.json(
      {
        error: { code: 'VALIDATION_ERROR', message: 'A known providerId is required.' },
        requestId,
      },
      { status: 422, headers: { 'x-request-id': requestId } },
    );
  }
  const def = getProvider(parsed.data.providerId)!;
  const { auth } = effectiveAuth(def);
  if (!auth) {
    return Response.json(
      {
        error: {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: `Save a credential for ${def.displayName} first. ${def.setupHint}`,
        },
        requestId,
      },
      { status: 503, headers: { 'x-request-id': requestId } },
    );
  }
  const probe =
    def.id === 'ollama'
      ? `${auth.baseURL.replace(/\/v1$/, '')}/api/tags`
      : def.id === 'higgsfield'
        ? `${auth.baseURL}/health`
        : `${auth.baseURL}/models`;
  try {
    const authorization =
      auth.apiKey
        ? def.id === 'higgsfield'
          ? 'Key ' + auth.apiKey
          : 'Bearer ' + auth.apiKey
        : null;
    const res = await safeProviderFetch(
      probe,
      {
        headers: authorization ? { authorization } : {},
        signal: AbortSignal.timeout(10_000),
      },
      def.local,
    );
    if (!res.ok) {
      const detail = await providerResponseError(res);
      return Response.json(
        { data: { ok: false, code: detail.code, message: detail.message }, requestId },
        { status: res.status >= 400 && res.status < 500 ? res.status : 502, headers: { 'x-request-id': requestId } },
      );
    }
    const body = (await res.json().catch(() => null)) as {
      data?: unknown[];
      models?: unknown[];
    } | null;
    const count = Array.isArray(body?.data)
      ? body.data.length
      : Array.isArray(body?.models)
        ? body.models.length
        : null;
    return Response.json(
      {
        data: {
          ok: true,
          message:
            count === null
              ? `${def.displayName} answered successfully.`
              : `${def.displayName} answered successfully — ${count} models visible.`,
          modelCount: count,
        },
        requestId,
      },
      { headers: { 'x-request-id': requestId } },
    );
  } catch {
    return Response.json(
      {
        data: {
          ok: false,
          code: 'NETWORK_ERROR',
          message: `Could not reach ${auth.baseURL}. Check the base URL and your network.`,
        },
        requestId,
      },
      { headers: { 'x-request-id': requestId } },
    );
  }
}
