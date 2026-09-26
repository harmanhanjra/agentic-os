import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-only-32-plus-character-secret-key!';
process.env.SCALEOS_DATA_DIR = mkdtempSync(join(tmpdir(), 'scaleos-test-'));

const { requestApproval, decideApproval, verifyApprovalToken, listApprovals } = await import(
  '../lib/permissions/kernel'
);
const { runTool, listTools } = await import('../lib/tools/registry');
const { recordUsage, summarizeUsage } = await import('../lib/usage/meter');
const { statusFor } = await import('../lib/api/envelope');

describe('Permission kernel', () => {
  it('mints, approves, and single-use consumes approvals', () => {
    const created = requestApproval({
      risk: 'financial',
      action: 'click Buy now',
      detail: 'Test checkpoint',
    });
    expect(created.status).toBe('pending');

    const approved = decideApproval(created.id, 'approved');
    expect(approved.status).toBe('approved');
    expect(approved.token).toBeTruthy();

    const consumed = verifyApprovalToken(approved.token as string, 'financial');
    expect(consumed.id).toBe(created.id);

    expect(() => verifyApprovalToken(approved.token as string, 'financial')).toThrow(
      /already used/i,
    );
  });

  it('denies consequential actions without a replayable token', () => {
    const created = requestApproval({
      risk: 'destructive',
      action: 'click Delete',
      detail: 'Test checkpoint',
    });
    decideApproval(created.id, 'denied');
    expect(listApprovals().find((a) => a.id === created.id)?.status).toBe('denied');
    expect(() => verifyApprovalToken('bogus.token.here', 'destructive')).toThrow();
  });

  it('refuses non-consequential approval requests', () => {
    expect(() =>
      requestApproval({ risk: 'none', action: 'scroll', detail: 'noop' }),
    ).toThrow();
  });
});

describe('Tool registry', () => {
  it('exposes only allowlisted tools', () => {
    const ids = listTools().map((t) => t.id).sort();
    expect(ids).toEqual(['calculator', 'datetime', 'text_stats', 'web_fetch']);
  });

  it('evaluates arithmetic without code execution', async () => {
    const ok = await runTool('calculator', { expression: '2 + 3 * (4 - 1)' });
    expect(ok.ok).toBe(true);
    expect(ok.output).toBe('11');
    const evil = await runTool('calculator', { expression: 'process.exit(1)' });
    expect(evil.ok).toBe(false);
  });

  it('reports deterministic text stats', async () => {
    const result = await runTool('text_stats', { text: 'hello world\nsecond line' });
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.output)).toMatchObject({ words: 4, lines: 2 });
  });
});

describe('Usage meter', () => {
  beforeEach(() => {
    process.env.SCALEOS_DATA_DIR = mkdtempSync(join(tmpdir(), 'scaleos-test-'));
  });

  it('summarizes runs by kind', () => {
    recordUsage({ kind: 'chat', latencyMs: 120, requestId: 'r1', ok: true });
    recordUsage({ kind: 'chat', latencyMs: 80, requestId: 'r2', ok: false, errorCode: 'PROVIDER_ERROR' });
    const summary = summarizeUsage();
    expect(summary.totals.runs).toBe(2);
    expect(summary.totals.errors).toBe(1);
    expect(summary.byKind.chat?.runs).toBe(2);
    expect(summary.byKind.chat?.avgLatencyMs).toBe(100);
  });
});

describe('API envelope', () => {
  it('maps codes to HTTP status', () => {
    expect(statusFor('VALIDATION_ERROR')).toBe(422);
    expect(statusFor('RATE_LIMITED')).toBe(429);
    expect(statusFor('APPROVAL_REQUIRED')).toBe(403);
    expect(statusFor('SOMETHING_ELSE')).toBe(502);
  });
});
