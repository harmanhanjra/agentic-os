import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { computerWorkerConfigured, runComputerWorker } from '@/lib/computer/worker';
import { fail, ok } from '@/lib/api/envelope';
import { recordUsage } from '@/lib/usage/meter';
import { saveRun } from '@/lib/runs/store';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 180;

const RequestSchema = z.object({
  objective: z.string().trim().min(3).max(20_000),
  maxActions: z.number().int().min(1).max(30).default(15),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const started = Date.now();
  const rate = checkRateLimit(request, 'computer-use', 4, 60_000);
  if (!rate.allowed) {
    return fail('RATE_LIMITED', 'Too many computer runs. Try again shortly.', 429, requestId, rateLimitHeaders(rate));
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Provide a computer objective and valid action budget.', 422, requestId);
  }

  if (!computerWorkerConfigured()) {
    return fail(
      'COMPUTER_WORKER_NOT_CONFIGURED',
      'Desktop Computer Use requires SCALEOS_COMPUTER_WORKER_URL. Browser Use works independently through BROWSER_CDP_URL.',
      503,
      requestId,
    );
  }

  try {
    const result = await runComputerWorker(parsed.data);
    recordUsage({ kind: 'computer', latencyMs: Date.now() - started, requestId, ok: true });
    saveRun({
      runId: (typeof result.runId === 'string' && result.runId) || requestId,
      kind: 'computer',
      createdAt: new Date().toISOString(),
      objective: parsed.data.objective.slice(0, 2000),
      status: typeof result.status === 'string' ? result.status : 'completed',
      summary: typeof result.summary === 'string' ? result.summary.slice(0, 2000) : undefined,
      latencyMs: Date.now() - started,
      requestId,
      result,
    });
    return ok({ data: result }, requestId, rateLimitHeaders(rate));
  } catch (error) {
    recordUsage({ kind: 'computer', latencyMs: Date.now() - started, requestId, ok: false, errorCode: 'COMPUTER_RUN_FAILED' });
    return fail(
      'COMPUTER_RUN_FAILED',
      error instanceof Error && process.env.NODE_ENV !== 'production'
        ? error.message
        : 'Computer Use worker could not complete the run.',
      502,
      requestId,
    );
  }
}
