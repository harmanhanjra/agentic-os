import { randomUUID } from 'node:crypto';
import { fail, ok } from '@/lib/api/envelope';
import { listApprovals } from '@/lib/permissions/kernel';

export const runtime = 'nodejs';

export async function GET() {
  const requestId = randomUUID();
  try {
    return ok({ approvals: listApprovals() }, requestId);
  } catch {
    return fail('PROVIDER_ERROR', 'Approvals are unavailable right now.', 502, requestId);
  }
}
