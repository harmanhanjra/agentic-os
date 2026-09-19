import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireProviderAdmin } from '@/lib/security/admin';
import { developmentModels } from '@/lib/ai/registry';
import { getProvider, isProviderConfigured, providers } from '@/lib/ai/providers';
import { ScaleOSError } from '@/lib/ai/types';
import {
  effectiveAuth,
  listPublicCredentials,
  removeProviderCredential,
  saveProviderCredential,
} from '@/lib/security/store';

export const runtime = 'nodejs';

const SaveSchema = z.object({
  providerId: z.string().min(1).max(50),
  apiKey: z.string().min(1).max(2000),
  baseURL: z.string().max(500).optional(),
});

function scaleError(err: unknown, requestId: string): Response {
  if (err instanceof ScaleOSError) {
    const status =
      err.code === 'MODEL_NOT_FOUND'
        ? 404
        : err.code === 'VALIDATION_ERROR'
          ? 422
          : 503;
    return Response.json(
      { error: { code: err.code, message: err.message }, requestId },
      { status, headers: { 'x-request-id': requestId } },
    );
  }
  return Response.json(
    {
      error: { code: 'PROVIDER_ERROR', message: 'Could not save the credential.' },
      requestId,
    },
    { status: 500, headers: { 'x-request-id': requestId } },
  );
}

/** Masked inventory: what is configured, from where — never plaintext. */
export async function GET() {
  const requestId = randomUUID();
  const stored = new Map(listPublicCredentials().map((c) => [c.providerId, c]));
  return Response.json(
    {
      data: {
        providers: providers.map((def) => {
          const cred = stored.get(def.id);
          const { auth } = effectiveAuth(def);
          return {
            id: def.id,
            displayName: def.displayName,
            local: def.local,
            kind: def.kind,
            keyEnv: def.keyEnv,
            configured: auth !== null,
            source: cred?.source ?? 'none',
            masked: cred?.masked ?? null,
            baseURL: cred?.baseURL ?? auth?.baseURL ?? def.defaultBaseURL,
            modelCount: developmentModels.filter((m) => m.providerId === def.id).length,
            hint: auth ? null : def.setupHint,
          };
        }),
      },
      requestId,
    },
    { headers: { 'x-request-id': requestId } },
  );
}

/** Save (or replace) a provider credential into the encrypted local store. */
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const denied = requireProviderAdmin(request, requestId);
  if (denied) return denied;
  const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'providerId and apiKey are required.',
        },
        requestId,
      },
      { status: 422, headers: { 'x-request-id': requestId } },
    );
  }
  try {
    const saved = saveProviderCredential(
      parsed.data.providerId,
      parsed.data.apiKey,
      parsed.data.baseURL,
    );
    return Response.json(
      { data: saved, requestId },
      { headers: { 'x-request-id': requestId } },
    );
  } catch (err) {
    return scaleError(err, requestId);
  }
}

/** Remove the locally stored credential (env config is untouched). */
export async function DELETE(request: NextRequest) {
  const requestId = randomUUID();
  const denied = requireProviderAdmin(request);
  if (denied) return denied;
  const providerId = new URL(request.url).searchParams.get('providerId') ?? '';
  if (!getProvider(providerId)) {
    return Response.json(
      {
        error: { code: 'MODEL_NOT_FOUND', message: `Unknown provider "${providerId}"` },
        requestId,
      },
      { status: 404, headers: { 'x-request-id': requestId } },
    );
  }
  try {
    const removed = removeProviderCredential(providerId);
    if (!removed) {
      return Response.json(
        {
          error: {
            code: 'MODEL_NOT_FOUND',
            message: 'No locally stored credential for this provider.',
          },
          requestId,
        },
        { status: 404, headers: { 'x-request-id': requestId } },
      );
    }
    const def = getProvider(providerId);
    return Response.json(
      {
        data: {
          removed: true,
          // Removing local storage may reveal env config underneath.
          stillConfigured: def ? isProviderConfigured(def) : false,
        },
        requestId,
      },
      { headers: { 'x-request-id': requestId } },
    );
  } catch (err) {
    return scaleError(err, requestId);
  }
}
