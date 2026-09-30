import { z } from 'zod';
import { insertRow, readCollection } from '../store/json-store';

export const UsageEventSchema = z.object({
  id: z.string().min(1).max(100),
  at: z.string().datetime(),
  kind: z.enum(['chat', 'arena', 'agent', 'browser', 'computer', 'flow', 'image', 'tool']),
  model: z.string().max(300).optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  requestId: z.string().max(100).optional(),
  ok: z.boolean().default(true),
  errorCode: z.string().max(100).optional(),
});

export type UsageEvent = z.infer<typeof UsageEventSchema>;

const COLLECTION = 'usage-events';

export function recordUsage(event: Omit<UsageEvent, 'id' | 'at'> & { id?: string; at?: string }): UsageEvent {
  const row: UsageEvent = {
    id: event.id ?? `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    at: event.at ?? new Date().toISOString(),
    kind: event.kind,
    ...(event.model ? { model: event.model } : {}),
    ...(typeof event.latencyMs === 'number' ? { latencyMs: event.latencyMs } : {}),
    ...(event.requestId ? { requestId: event.requestId } : {}),
    ok: event.ok ?? true,
    ...(event.errorCode ? { errorCode: event.errorCode } : {}),
  };
  const parsed = UsageEventSchema.parse(row);
  insertRow(COLLECTION, parsed, 1000);
  return parsed;
}

export interface UsageSummary {
  totals: { runs: number; errors: number; avgLatencyMs: number | null };
  byKind: Record<string, { runs: number; errors: number; avgLatencyMs: number | null }>;
  recent: UsageEvent[];
}

function avg(rows: UsageEvent[]): number | null {
  const lat = rows.map((r) => r.latencyMs).filter((v): v is number => typeof v === 'number');
  if (lat.length === 0) return null;
  return Math.round(lat.reduce((a, b) => a + b, 0) / lat.length);
}

export function summarizeUsage(limit = 25): UsageSummary {
  const rows = readCollection<UsageEvent>(COLLECTION, []).slice(0, 500);
  const byKind: UsageSummary['byKind'] = {};
  for (const row of rows) {
    const slot = (byKind[row.kind] ??= { runs: 0, errors: 0, avgLatencyMs: null });
    slot.runs += 1;
    if (!row.ok) slot.errors += 1;
  }
  for (const kind of Object.keys(byKind)) {
    byKind[kind].avgLatencyMs = avg(rows.filter((r) => r.kind === kind));
  }
  return {
    totals: {
      runs: rows.length,
      errors: rows.filter((r) => !r.ok).length,
      avgLatencyMs: avg(rows),
    },
    byKind,
    recent: rows.slice(0, limit),
  };
}
