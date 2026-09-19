import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ScaleOSError } from '@/lib/ai/types';
import { runComputerAgent } from '@/lib/computer/desktop-agent';
import { computerWorkerConfigured } from '@/lib/computer/worker';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RequestSchema = z.object({
  objective: z.string().trim().min(3).max(20_000),
  modelId: z.string().min(1).max(300).optional(),
  maxActions: z.number().int().min(1).max(30).default(15),
  includeScreenshot: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'computer-use', 3, 60_000);
  if (!rate.allowed) {
    return Response.json(
      {
        error: { code: 'RATE_LIMITED', message: 'Too many computer runs. Try again shortly.' },
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
          message: 'Provide a computer objective, optional vision model, and valid action budget.',
        },
        requestId,
      },
      { status: 422, headers: { 'x-request-id': requestId } },
    );
  }

  if (!computerWorkerConfigured()) {
    return Response.json(
      {
        error: {
          code: 'COMPUTER_WORKER_NOT_CONFIGURED',
          message:
            'Full Computer Use requires SCALEOS_COMPUTER_WORKER_URL and a running computer_worker service.',
        },
        requestId,
      },
      { status: 503, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    const result = await runComputerAgent(parsed.data);
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
            : error.code === 'MODEL_UNAVAILABLE' ||
                error.code === 'PROVIDER_NOT_CONFIGURED'
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
          code: 'COMPUTER_RUN_FAILED',
          message:
            error instanceof Error && process.env.NODE_ENV !== 'production'
              ? error.message
              : 'Full Computer Use could not complete the run.',
        },
        requestId,
      },
      { status: 502, headers: { 'x-request-id': requestId } },
    );
  }
}
