import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { computerWorkerConfigured, runComputerWorker } from '@/lib/computer/worker';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 180;

const RequestSchema = z.object({
  objective: z.string().trim().min(3).max(20_000),
  maxActions: z.number().int().min(1).max(30).default(15),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'computer-use', 4, 60_000);
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
        error: { code: 'VALIDATION_ERROR', message: 'Provide a computer objective and valid action budget.' },
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
            'Desktop Computer Use requires SCALEOS_COMPUTER_WORKER_URL. Browser Use works independently through BROWSER_CDP_URL.',
        },
        requestId,
      },
      { status: 503, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    const result = await runComputerWorker(parsed.data);
    return Response.json(
      { data: result, requestId },
      { headers: { 'x-request-id': requestId } },
    );
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'COMPUTER_RUN_FAILED',
          message:
            error instanceof Error && process.env.NODE_ENV !== 'production'
              ? error.message
              : 'Computer Use worker could not complete the run.',
        },
        requestId,
      },
      { status: 502, headers: { 'x-request-id': requestId } },
    );
  }
}
