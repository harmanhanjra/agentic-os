import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, ok } from '@/lib/api/envelope';
import { ToolIdSchema, listTools, runTool } from '@/lib/tools/registry';
import { recordUsage } from '@/lib/usage/meter';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET() {
  const requestId = randomUUID();
  return ok({ tools: listTools() }, requestId);
}

const RunSchema = z.object({
  tool: ToolIdSchema,
  input: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const started = Date.now();
  const rate = checkRateLimit(request, 'tools', 30, 60_000);
  if (!rate.allowed) {
    return fail('RATE_LIMITED', 'Too many tool calls. Try again shortly.', 429, requestId, rateLimitHeaders(rate));
  }
  const parsed = RunSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Provide a known tool and its input.', 422, requestId);
  }
  const result = await runTool(parsed.data.tool, parsed.data.input);
  recordUsage({
    kind: 'tool',
    latencyMs: Date.now() - started,
    requestId,
    ok: result.ok,
    ...(result.ok ? {} : { errorCode: 'TOOL_RUN_FAILED' }),
  });
  if (!result.ok) {
    return fail('TOOL_RUN_FAILED', result.output, 422, requestId, rateLimitHeaders(rate));
  }
  return ok({ result }, requestId, rateLimitHeaders(rate));
}
