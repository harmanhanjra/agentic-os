import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { runBrowserAgent } from '@/lib/computer/browser-agent';
import { ScaleOSError } from '@/lib/ai/types';
import { fail, ok, statusFor } from '@/lib/api/envelope';
import { recordUsage } from '@/lib/usage/meter';
import { saveRun } from '@/lib/runs/store';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 180;

const RequestSchema = z.object({
  objective: z.string().trim().min(3).max(20_000),
  startUrl: z.string().url().max(2000).optional(),
  modelId: z.string().min(1).max(300).optional(),
  maxActions: z.number().int().min(1).max(20).default(10),
  includeScreenshot: z.boolean().default(true),
  approvalTokens: z.array(z.string().min(1).max(2000)).max(10).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const started = Date.now();
  const rate = checkRateLimit(request, 'browser-use', 4, 60_000);
  if (!rate.allowed) {
    return fail('RATE_LIMITED', 'Too many browser runs. Try again shortly.', 429, requestId, rateLimitHeaders(rate));
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Provide a browser objective, optional HTTP(S) start URL, and a valid action budget.', 422, requestId);
  }

  try {
    const result = await runBrowserAgent({ ...parsed.data, signal: request.signal });
    recordUsage({
      kind: 'browser',
      model: result.model,
      latencyMs: Date.now() - started,
      requestId,
      ok: result.status === 'completed',
      ...(result.status === 'completed' ? {} : { errorCode: `BROWSER_${result.status.toUpperCase()}` }),
    });
    saveRun({
      runId: result.runId,
      kind: 'browser',
      createdAt: new Date().toISOString(),
      objective: result.objective.slice(0, 2000),
      model: result.model,
      status: result.status,
      summary: result.summary.slice(0, 2000),
      latencyMs: result.latencyMs,
      requestId,
      result,
    });
    return ok({ run: result, data: result }, requestId, rateLimitHeaders(rate));
  } catch (error) {
    recordUsage({
      kind: 'browser',
      latencyMs: Date.now() - started,
      requestId,
      ok: false,
      errorCode: error instanceof ScaleOSError ? error.code : 'BROWSER_RUN_FAILED',
    });
    if (error instanceof ScaleOSError) {
      return fail(error.code, error.message, statusFor(error.code), requestId);
    }

    const message =
      error instanceof Error && process.env.NODE_ENV !== 'production'
        ? error.message
        : 'Browser Use could not complete the run.';
    return fail('BROWSER_RUN_FAILED', message, 502, requestId);
  }
}
