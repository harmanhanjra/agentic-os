import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { runAgent, type AgentType } from '@/lib/agents/index';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';
import { recordUsage } from '@/lib/usage/meter';

export const runtime = 'nodejs';

const AgentRequestSchema = z.object({
  agent: z.enum(['react', 'planner', 'digest', 'research', 'code']),
  input: z.string().min(1).max(10_000),
  context: z.string().max(5_000).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'chat', 20, 60_000);
  if (!rate.allowed) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many agent requests. Try again shortly.' }, requestId },
      { status: 429, headers: { 'x-request-id': requestId, ...rateLimitHeaders(rate) } },
    );
  }

  const parsed = AgentRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid agent request. Need agent (react|planner|digest|research|code) and input.' }, requestId },
      { status: 422, headers: { 'x-request-id': requestId } },
    );
  }

  try {
    const result = await runAgent({
      agent: parsed.data.agent as AgentType,
      input: parsed.data.input,
      context: parsed.data.context,
    });

    recordUsage({ kind: 'chat', model: result.model ?? 'agent', requestId, ok: true });

    return Response.json(
      {
        requestId,
        agent: result.agent,
        output: result.output,
        data: result.data,
        model: result.model,
        latencyMs: result.latencyMs,
      },
      {
        headers: {
          'x-request-id': requestId,
          'x-scaleos-model': result.model ?? 'agent',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Agent execution failed.';
    recordUsage({ kind: 'chat', model: 'agent', requestId, ok: false, errorCode: 'AGENT_ERROR' });
    return Response.json(
      { error: { code: 'AGENT_ERROR', message }, requestId },
      { status: 500, headers: { 'x-request-id': requestId } },
    );
  }
}
