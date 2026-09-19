import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { runBrowserAgent } from '@/lib/computer/browser-agent';
import { ScaleOSError } from '@/lib/ai/types';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 180;

const RequestSchema = z.object({
  objective: z.string().trim().min(3).max(20_000),
  startUrl: z.string().url().max(2000).optional(),
  modelId: z.string().min(1).max(300).optional(),
  maxActions: z.number().int().min(1).max(20).default(10),
  includeScreenshot: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'browser-use', 4, 60_000);
  if (!rate.allowed) {
    return Response.json(
      {
        error: { code: 'RATE_LIMITED', message: 'Too many browser runs. Try again shortly.' },
        requestId,
      },
      {
        status: 429,
        headers: { 'x-request-id': requestId, ...rateLimitHeaders(rate) },
      },
    );
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Provide a browser objective, optional HTTP(S) start URL, and a valid action budget.',
        },
        requestId,
      },
      { status: 422, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    const result = await runBrowserAgent(parsed.data);
    return Response.json(
      { data: result, requestId },
      { headers: { 'x-request-id': requestId } },
    );
  } catch (error) {
    if (error instanceof ScaleOSError) {
      const status =
        error.code === 'MODEL_NOT_FOUND'
          ? 404
          : error.code === 'RATE_LIMITED'
            ? 429
            : error.code === 'PROVIDER_NOT_CONFIGURED' ||
                error.code === 'MODEL_UNAVAILABLE'
              ? 503
              : 502;
      return Response.json(
        { error: { code: error.code, message: error.message }, requestId },
        { status, headers: { 'x-request-id': requestId } },
      );
    }

    const message =
      error instanceof Error && process.env.NODE_ENV !== 'production'
        ? error.message
        : 'Browser Use could not complete the run.';
    return Response.json(
      { error: { code: 'BROWSER_RUN_FAILED', message }, requestId },
      { status: 502, headers: { 'x-request-id': requestId } },
    );
  }
}
