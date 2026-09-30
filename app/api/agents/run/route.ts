import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { runAgent } from '@/lib/agents/runtime';
import { ScaleOSError } from '@/lib/ai/types';
import { fail, ok, statusFor } from '@/lib/api/envelope';
import { recordUsage } from '@/lib/usage/meter';
import { saveRun } from '@/lib/runs/store';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  objective: z.string().trim().min(3).max(20_000),
  modelId: z.string().min(1).max(300).optional(),
  maxSteps: z.number().int().min(1).max(5).default(3),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const started = Date.now();
  const rate = checkRateLimit(request, 'agent-run', 6, 60_000);
  if (!rate.allowed) {
    return fail('RATE_LIMITED', 'Too many agent runs. Try again shortly.', 429, requestId, rateLimitHeaders(rate));
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Provide an objective and between one and five agent steps.', 422, requestId);
  }

  try {
    const result = await runAgent(parsed.data);
    recordUsage({ kind: 'agent', model: result.model, latencyMs: Date.now() - started, requestId, ok: true });
    saveRun({
      runId: result.runId,
      kind: 'agent',
      createdAt: new Date().toISOString(),
      objective: result.objective.slice(0, 2000),
      model: result.model,
      status: 'completed',
      summary: result.final.slice(0, 2000),
      latencyMs: result.latencyMs,
      requestId,
      result,
    });
    return ok({ run: result, data: result }, requestId, rateLimitHeaders(rate));
  } catch (error) {
    recordUsage({
      kind: 'agent',
      latencyMs: Date.now() - started,
      requestId,
      ok: false,
      errorCode: error instanceof ScaleOSError ? error.code : 'AGENT_RUN_FAILED',
    });
    if (error instanceof ScaleOSError) {
      return fail(error.code, error.message, statusFor(error.code), requestId);
    }

    return fail('AGENT_RUN_FAILED', 'The agent run could not be completed.', 502, requestId);
  }
}
