import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, ok, statusFor } from '@/lib/api/envelope';
import { FlowStepSchema, runFlow } from '@/lib/flows/engine';
import { ScaleOSError } from '@/lib/ai/types';
import { recordUsage } from '@/lib/usage/meter';
import { saveRun } from '@/lib/runs/store';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 180;

const RequestSchema = z.object({
  sourceText: z.string().trim().min(1).max(20000),
  steps: z.array(FlowStepSchema).min(1).max(8),
  modelId: z.string().min(1).max(300).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const started = Date.now();
  const rate = checkRateLimit(request, 'flow-run', 8, 60_000);
  if (!rate.allowed) {
    return fail('RATE_LIMITED', 'Too many flow runs. Try again shortly.', 429, requestId, rateLimitHeaders(rate));
  }
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Provide flow input text and 1–8 prompt steps.', 422, requestId);
  }
  try {
    const result = await runFlow(parsed.data);
    recordUsage({ kind: 'flow', model: result.model, latencyMs: Date.now() - started, requestId, ok: true });
    saveRun({
      runId: result.runId,
      kind: 'flow',
      createdAt: new Date().toISOString(),
      objective: parsed.data.sourceText.slice(0, 500),
      model: result.model,
      status: 'completed',
      summary: result.final.slice(0, 2000),
      latencyMs: result.latencyMs,
      requestId,
      result,
    });
    return ok({ run: result }, requestId, rateLimitHeaders(rate));
  } catch (error) {
    recordUsage({
      kind: 'flow',
      latencyMs: Date.now() - started,
      requestId,
      ok: false,
      errorCode: error instanceof ScaleOSError ? error.code : 'FLOW_RUN_FAILED',
    });
    if (error instanceof ScaleOSError) {
      return fail(error.code, error.message, statusFor(error.code), requestId);
    }
    return fail('FLOW_RUN_FAILED', 'The flow could not complete.', 502, requestId);
  }
}
