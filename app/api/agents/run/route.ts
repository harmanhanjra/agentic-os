import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { runAgent } from '@/lib/agents/runtime';
import { ScaleOSError } from '@/lib/ai/types';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  objective: z.string().trim().min(3).max(20_000),
  modelId: z.string().min(1).max(300).optional(),
  maxSteps: z.number().int().min(1).max(5).default(3),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'agent-run', 6, 60_000);
  if (!rate.allowed) {
    return Response.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many agent runs. Try again shortly.',
        },
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
          message: 'Provide an objective and between one and five agent steps.',
        },
        requestId,
      },
      { status: 422, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    const result = await runAgent(parsed.data);
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
            : error.code === 'MODEL_UNAVAILABLE'
              ? 503
              : 502;
      return Response.json(
        { error: { code: error.code, message: error.message }, requestId },
        { status, headers: { 'x-request-id': requestId } },
      );
    }

    return Response.json(
      {
        error: {
          code: 'AGENT_RUN_FAILED',
          message: 'The agent run could not be completed.',
        },
        requestId,
      },
      { status: 502, headers: { 'x-request-id': requestId } },
    );
  }
}
