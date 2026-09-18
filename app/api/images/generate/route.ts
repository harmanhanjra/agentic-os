import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { submitHiggsfieldImage } from '@/lib/ai/dispatch';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
const Schema = z.object({ modelId: z.string().startsWith('higgsfield:'), prompt: z.string().trim().min(1).max(10_000), aspectRatio: z.string().max(20).optional(), resolution: z.string().max(20).optional() });
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'image-generation', 8, 60_000);
  if (!rate.allowed) return Response.json(
    { error: { code: 'RATE_LIMITED', message: 'Too many image requests. Try again shortly.' }, requestId },
    { status: 429, headers: { 'x-request-id': requestId, ...rateLimitHeaders(rate) } },
  );
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'A Higgsfield model and prompt are required.' }, requestId }, { status: 422 });
  try {
    const result = await submitHiggsfieldImage({ ...parsed.data, modelId: parsed.data.modelId.slice('higgsfield:'.length) });
    return Response.json({ data: result, requestId }, { headers: { 'x-request-id': requestId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Higgsfield could not start this generation.';
    return Response.json({ error: { code: 'PROVIDER_ERROR', message }, requestId }, { status: 502, headers: { 'x-request-id': requestId } });
  }
}
