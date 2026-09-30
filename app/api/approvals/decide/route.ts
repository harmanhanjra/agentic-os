import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, ok } from '@/lib/api/envelope';
import { decideApproval } from '@/lib/permissions/kernel';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  id: z.string().min(1).max(100),
  decision: z.enum(['approved', 'denied']),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'approvals', 20, 60_000);
  if (!rate.allowed) {
    return fail('RATE_LIMITED', 'Too many approval requests. Try again shortly.', 429, requestId, rateLimitHeaders(rate));
  }
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Provide an approval id and decision.', 422, requestId);
  }
  try {
    const approval = decideApproval(parsed.data.id, parsed.data.decision);
    return ok({ approval }, requestId, rateLimitHeaders(rate));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approval decision failed.';
    const code = /not configured/i.test(message) ? 'CREDENTIAL_STORE_UNAVAILABLE' : 'APPROVAL_INVALID';
    return fail(code, message, code === 'CREDENTIAL_STORE_UNAVAILABLE' ? 503 : 422, requestId);
  }
}
