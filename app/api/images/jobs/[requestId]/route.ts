import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { effectiveAuth } from '@/lib/security/store';
import { getProvider } from '@/lib/ai/providers';
import { safeProviderFetch } from '@/lib/security/fetch';

export const runtime = 'nodejs';
export async function GET(_request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  const requestId = randomUUID();
  const { requestId: jobId } = await context.params;
  if (!z.string().uuid().safeParse(jobId).success) return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid Higgsfield request id.' }, requestId }, { status: 422, headers: { 'x-request-id': requestId } });
  const def = getProvider('higgsfield');
  const auth = def ? effectiveAuth(def).auth : null;
  if (!auth?.apiKey) return Response.json({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Higgsfield is not configured.' }, requestId }, { status: 503, headers: { 'x-request-id': requestId } });
  try {
    const response = await safeProviderFetch(auth.baseURL + '/requests/' + jobId + '/status', { headers: { authorization: 'Key ' + auth.apiKey }, signal: AbortSignal.timeout(10_000) }, false);
    const body = await response.json().catch(() => null);
    return Response.json({ data: body, requestId }, { status: response.status, headers: { 'x-request-id': requestId } });
  } catch { return Response.json({ error: { code: 'NETWORK_ERROR', message: 'Could not reach Higgsfield.' }, requestId }, { status: 502, headers: { 'x-request-id': requestId } }); }
}
