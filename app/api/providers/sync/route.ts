import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getProvider } from '@/lib/ai/providers';
import { effectiveAuth } from '@/lib/security/store';
import { safeProviderFetch } from '@/lib/security/fetch';
import { providerResponseError } from '@/lib/ai/dispatch';

export const runtime = 'nodejs';
const Schema = z.object({ providerId: z.string().min(1).max(50) });

function json(body: unknown, requestId: string, status = 200) {
  return Response.json(body, { status, headers: { 'x-request-id': requestId } });
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  const def = parsed.success ? getProvider(parsed.data.providerId) : undefined;

  if (!def) {
    return json(
      {
        error: { code: 'VALIDATION_ERROR', message: 'A known providerId is required.' },
        requestId,
      },
      requestId,
      422,
    );
  }

  const { auth } = effectiveAuth(def);
  if (!auth) {
    return json(
      {
        error: {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: def.displayName + ' is not configured.',
        },
        requestId,
      },
      requestId,
      503,
    );
  }

  if (def.id === 'higgsfield') {
    return json(
      {
        data: {
          models: [
            {
              id: 'higgsfield:seedream-v4',
              displayName: 'Seedream v4',
              providerId: 'higgsfield',
              capabilities: ['image-generation'],
              local: false,
            },
          ],
          source: 'curated-official-profile',
        },
        requestId,
      },
      requestId,
    );
  }

  try {
    const response = await safeProviderFetch(
      auth.baseURL + '/models',
      {
        headers: auth.apiKey ? { authorization: 'Bearer ' + auth.apiKey } : {},
        signal: AbortSignal.timeout(10_000),
      },
      def.local,
    );

    if (!response.ok) {
      const detail = await providerResponseError(response);
      return json(
        { error: { code: detail.code, message: detail.message }, requestId },
        requestId,
        response.status >= 400 && response.status < 500 ? response.status : 502,
      );
    }

    const body = (await response.json()) as {
      data?: Array<{ id?: string; owned_by?: string }>;
    };
    const models = (body.data ?? [])
      .filter((model) => typeof model.id === 'string')
      .map((model) => ({
        id: def.id + ':' + model.id,
        displayName: model.id!,
        providerId: def.id,
        capabilities: ['text'],
        local: def.local,
      }));

    return json({ data: { models, source: 'provider-api' }, requestId }, requestId);
  } catch {
    return json(
      {
        error: { code: 'NETWORK_ERROR', message: 'Could not reach ' + def.displayName + '.' },
        requestId,
      },
      requestId,
      502,
    );
  }
}
