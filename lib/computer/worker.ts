import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { safeProviderFetch } from '../security/fetch';
import type { ComputerAction } from './types';
import {
  ComputerWorkerHealthSchema,
  ComputerWorkerStateSchema,
  type ComputerWorkerHealth,
  type ComputerWorkerState,
} from './types';

const ActionResponseSchema = z.object({
  requestId: z.string(),
  frameId: z.string(),
  results: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      type: z.string(),
      status: z.enum(['completed', 'blocked', 'failed']),
      message: z.string(),
      target: z.string(),
    }),
  ),
});

function workerBase(): { url: string; token: string | null; allowLocal: boolean } {
  const raw = process.env.SCALEOS_COMPUTER_WORKER_URL?.trim();
  if (!raw) throw new Error('SCALEOS_COMPUTER_WORKER_URL is not configured.');
  const token = process.env.SCALEOS_COMPUTER_WORKER_TOKEN?.trim() || null;
  const allowLocal =
    process.env.NODE_ENV !== 'production' &&
    process.env.SCALEOS_COMPUTER_ALLOW_PRIVATE === 'true';
  return { url: raw, token, allowLocal };
}

function workerHeaders(token: string | null) {
  return {
    ...(token ? { authorization: 'Bearer ' + token } : {}),
  };
}

export function computerWorkerConfigured(): boolean {
  return Boolean(process.env.SCALEOS_COMPUTER_WORKER_URL?.trim());
}

export async function getComputerWorkerHealth(): Promise<ComputerWorkerHealth> {
  const { url, token, allowLocal } = workerBase();
  const endpoint = new URL('/health', url).toString();
  const response = await safeProviderFetch(
    endpoint,
    {
      headers: workerHeaders(token),
      signal: AbortSignal.timeout(5000),
    },
    allowLocal,
  );
  if (!response.ok) throw new Error('Computer worker health check returned HTTP ' + response.status + '.');
  return ComputerWorkerHealthSchema.parse(await response.json());
}

export async function probeComputerWorker(): Promise<{
  reachable: boolean;
  health?: ComputerWorkerHealth;
}> {
  if (!computerWorkerConfigured()) return { reachable: false };
  try {
    return { reachable: true, health: await getComputerWorkerHealth() };
  } catch {
    return { reachable: false };
  }
}

export async function getComputerWorkerState(): Promise<ComputerWorkerState> {
  const { url, token, allowLocal } = workerBase();
  const endpoint = new URL('/v1/state', url).toString();
  const response = await safeProviderFetch(
    endpoint,
    {
      headers: workerHeaders(token),
      signal: AbortSignal.timeout(15_000),
    },
    allowLocal,
  );
  if (!response.ok) throw new Error('Computer worker state returned HTTP ' + response.status + '.');
  return ComputerWorkerStateSchema.parse(await response.json());
}

export async function executeComputerWorkerActions(input: {
  frameId: string;
  actions: ComputerAction[];
  policy?: {
    allowFinancial?: boolean;
    allowDestructive?: boolean;
    allowExternalCommunication?: boolean;
    allowCredentials?: boolean;
    allowFileUpload?: boolean;
  };
}) {
  const { url, token, allowLocal } = workerBase();
  const endpoint = new URL('/v1/actions', url).toString();
  const executable = input.actions.filter((action) => action.type !== 'done');
  if (executable.length === 0) {
    return { requestId: randomUUID(), frameId: input.frameId, results: [] };
  }

  const response = await safeProviderFetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...workerHeaders(token),
      },
      body: JSON.stringify({
        requestId: randomUUID(),
        frameId: input.frameId,
        actions: executable,
        policy: {
          allowFinancial: false,
          allowDestructive: false,
          allowExternalCommunication: false,
          allowCredentials: false,
          allowFileUpload: false,
          ...input.policy,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
    allowLocal,
  );

  if (!response.ok) {
    throw new Error('Computer worker action endpoint returned HTTP ' + response.status + '.');
  }
  return ActionResponseSchema.parse(await response.json());
}
