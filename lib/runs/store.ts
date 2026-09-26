import { z } from 'zod';
import { insertRow, readCollection } from '../store/json-store';

export const RunRecordSchema = z.object({
  runId: z.string().min(1),
  kind: z.enum(['agent', 'browser', 'computer', 'flow']),
  createdAt: z.string().datetime(),
  objective: z.string().max(20000),
  model: z.string().max(300).optional(),
  status: z.string().max(60),
  summary: z.string().max(20000).optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  requestId: z.string().max(100).optional(),
  result: z.unknown().optional(),
});

export type RunRecord = z.infer<typeof RunRecordSchema>;

const COLLECTION = 'runs';

export function saveRun(record: RunRecord): RunRecord {
  const parsed = RunRecordSchema.parse(record);
  insertRow(COLLECTION, parsed, 300);
  return parsed;
}

export function listRuns(kind?: RunRecord['kind'], limit = 30): RunRecord[] {
  const rows = readCollection<RunRecord>(COLLECTION, []);
  return rows
    .filter((r) => (kind ? r.kind === kind : true))
    .slice(0, limit);
}
