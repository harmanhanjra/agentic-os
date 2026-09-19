import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  JevRequestSchema,
  estimateJevInputTokens,
  isJevConfigured,
  requestJevDecision,
} from '@/lib/ai/jev';
import { ScaleOSError } from '@/lib/ai/types';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  state: JevRequestSchema.shape.state,
  questions: JevRequestSchema.shape.questions,
});

/**
 * Configuration probe without secrets: tells the Jev tab whether the
 * server-side EXPERIENTIAL_API_KEY is present. Never returns the key.
 */
export async function GET() {
  const requestId = randomUUID();
  return Response.json(
    {
      data: {
        configured: isJevConfigured(),
        model: 'jev-latest',
        hint: isJevConfigured()
          ? null
          : 'Set EXPERIENTIAL_API_KEY locally (server environment or .env.local).',
      },
      requestId,
    },
    { headers: { 'x-request-id': requestId } },
  );
}

/**
 * Decision helper endpoint. Each call maps to exactly one gateway request;
 * there are no retries, so clients must confirm before resending after an
 * unknown outcome. Returned decisions are advisory — this route never
 * executes, merges, or auto-applies them.
 */
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'jev', 6, 60_000);
  if (!rate.allowed) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many Jev requests. Try again shortly.' }, requestId },
      { status: 429, headers: { 'x-request-id': requestId, ...rateLimitHeaders(rate) } },
    );
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Provide state plus 1–32 independent questions (choice: 2–64 options, score: 2–10 levels).',
        },
        requestId,
      },
      { status: 422, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    const decision = await requestJevDecision(parsed.data);
    return Response.json(
      {
        data: {
          ...decision,
          inputTokens: estimateJevInputTokens(parsed.data),
          advisory: true,
        },
        requestId,
      },
      { headers: { 'x-request-id': requestId } },
    );
  } catch (error) {
    if (error instanceof ScaleOSError) {
      const status =
        error.code === 'VALIDATION_ERROR'
          ? 422
          : error.code === 'INVALID_API_KEY'
            ? 401
            : error.code === 'PROVIDER_NOT_CONFIGURED'
              ? 503
              : error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR'
                ? 502
                : 502;
      return Response.json(
        { error: { code: error.code, message: error.message }, requestId },
        { status, headers: { 'x-request-id': requestId } },
      );
    }
    return Response.json(
      { error: { code: 'PROVIDER_ERROR', message: 'The Jev request could not be completed.' }, requestId },
      { status: 502, headers: { 'x-request-id': requestId } },
    );
  }
}
