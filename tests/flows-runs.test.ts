import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FlowStepSchema } from '../lib/flows/engine';
import { RunRecordSchema, listRuns, saveRun } from '../lib/runs/store';

process.env.SCALEOS_DATA_DIR = mkdtempSync(join(tmpdir(), 'scaleos-test-'));

const { runFlow } = await import('../lib/flows/engine');

describe('Flow engine contracts', () => {
  it('validates steps before touching providers', async () => {
    expect(() => FlowStepSchema.parse({ name: '', prompt: 'hi' })).toThrow();
    await expect(runFlow({ sourceText: 'hello', steps: [] })).rejects.toThrow();
    await expect(
      runFlow({ sourceText: '   ', steps: [{ name: 's1', prompt: 'do {{input}}' }] }),
    ).rejects.toThrow();
  });

  it('persists run records for history', () => {
    saveRun({
      runId: 'run-1',
      kind: 'agent',
      createdAt: new Date().toISOString(),
      objective: 'test objective',
      status: 'completed',
    });
    expect(RunRecordSchema.parse(listRuns('agent', 10)[0]).runId).toBe('run-1');
    expect(listRuns('browser', 10)).toHaveLength(0);
  });
});
