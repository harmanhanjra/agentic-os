import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, ok } from '@/lib/api/envelope';
import { RiskSchema, requestApproval } from '@/lib/permissions/kernel';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  risk: RiskSchema.refine((r) => r !== 'none', { message: 'Only consequential risks need approval.' }),
  action: z.string().trim().min(1).max(200),
  detail: z.string().trim().min(1).max(4000),
  context: z.record(z.string(), z.string().max(1000)).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'approvals', 20, 60_000);
  if (!rate.allowed) {
    return fail('RATE_LIMITED', 'Too many approval requests. Try again shortly.', 429, requestId, rateLimitHeaders(rate));
  }
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Provide a risk class, action, and detail for approval.', 422, requestId);
  }
  try {
    const approval = requestApproval(parsed.data);
    return ok({ approval }, requestId, rateLimitHeaders(rate));
  } catch (error) {
    return fail('VALIDATION_ERROR', error instanceof Error ? error.message : 'Approval request failed.', 422, requestId);
  }
}
