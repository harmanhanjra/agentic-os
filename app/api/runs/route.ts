import { randomUUID } from 'node:crypto';
import { fail, ok } from '@/lib/api/envelope';
import { listRuns } from '@/lib/runs/store';

export const runtime = 'nodejs';

export async function GET() {
  const requestId = randomUUID();
  try {
    return ok({ runs: listRuns(undefined, 40) }, requestId);
  } catch {
    return fail('PROVIDER_ERROR', 'Run history is unavailable right now.', 502, requestId);
  }
}
