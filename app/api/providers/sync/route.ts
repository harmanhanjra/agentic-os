import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getProvider, getProviderAuth } from '@/lib/ai/providers';
import { providerResponseError } from '@/lib/ai/dispatch';

export const runtime = 'nodejs';
const Schema = z.object({ providerId: z.string().min(1).max(50) });

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  const def = parsed.success ? getProvider(parsed.data.providerId) : undefined;
  if (!def) return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'A known providerId is required.' }, requestId }, { status: 422 });
  const auth = getProviderAuth(def);
  if (!auth) return Response.json({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: `${def.displayName} is not configured.` }, requestId }, { status: 503 });
  if (def.id === 'higgsfield') return Response.json({ data: { models: [{ id: 'higgsfield:seedream-v4', displayName: 'Seedream v4', providerId: 'higgsfield', capabilities: ['image-generation'], local: false }], source: 'curated-official-profile' }, requestId });
  try {
    const response = await fetch(`${auth.baseURL}/models`, { headers: auth.apiKey ? { authorization: `Bearer ${auth.apiKey}` } : {}, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { const detail = await providerResponseError(response); return Response.json({ error: { code: detail.code, message: detail.message }, requestId }, { status: response.status >= 400 && response.status < 500 ? response.status : 502 }); }
    const body = await response.json() as { data?: Array<{ id?: string; owned_by?: string }> };
    const models = (body.data ?? []).filter((m) => typeof m.id === 'string').map((m) => ({ id: `${def.id}:${m.id}`, displayName: m.id!, providerId: def.id, capabilities: ['text'], local: def.local }));
    return Response.json({ data: { models, source: 'provider-api' }, requestId });
  } catch { return Response.json({ error: { code: 'NETWORK_ERROR', message: `Could not reach ${def.displayName}.` }, requestId }, { status: 502 }); }
}
