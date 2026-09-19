import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertSafeProviderUrlResolved } from '../security/url';
import type { ComputerWorkerResult } from './types';

const ResultSchema = z
  .object({
    runId: z.string().optional(),
    status: z.string().min(1),
    summary: z.string().optional(),
    actions: z.array(z.record(z.string(), z.unknown())).optional(),
    screenshotDataUrl: z.string().optional(),
  })
  .passthrough();

export function computerWorkerConfigured(): boolean {
  return Boolean(process.env.SCALEOS_COMPUTER_WORKER_URL?.trim());
}

export async function runComputerWorker(input: {
  objective: string;
  maxActions: number;
}): Promise<ComputerWorkerResult> {
  const raw = process.env.SCALEOS_COMPUTER_WORKER_URL?.trim();
  if (!raw) throw new Error('SCALEOS_COMPUTER_WORKER_URL is not configured.');

  const allowLocal =
    process.env.NODE_ENV !== 'production' &&
    process.env.SCALEOS_BROWSER_ALLOW_PRIVATE === 'true';
  const base = await assertSafeProviderUrlResolved(raw, allowLocal);
  const endpoint = new URL('/v1/tasks/run', base);
  const token = process.env.SCALEOS_COMPUTER_WORKER_TOKEN?.trim();

  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({
      requestId: randomUUID(),
      objective: input.objective,
      maxActions: input.maxActions,
      policy: {
        allowFinancial: false,
        allowDestructive: false,
        allowExternalCommunication: false,
        allowCredentials: false,
        allowFileUpload: false,
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error('Computer worker returned HTTP ' + String(response.status) + '.');
  }

  return ResultSchema.parse(await response.json());
}
