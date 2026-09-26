import { randomUUID } from 'node:crypto';
import { fail, ok } from '@/lib/api/envelope';
import { summarizeUsage } from '@/lib/usage/meter';

export const runtime = 'nodejs';

export async function GET() {
  const requestId = randomUUID();
  try {
    return ok(summarizeUsage(), requestId);
  } catch {
    return fail('PROVIDER_ERROR', 'Usage is unavailable right now.', 502, requestId);
  }
}
