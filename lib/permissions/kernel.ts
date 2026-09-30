import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { insertRow, readCollection, writeCollection } from '../store/json-store';

export const RiskSchema = z.enum([
  'none',
  'credential',
  'financial',
  'destructive',
  'external-communication',
  'account',
  'file',
]);
export type ApprovalRisk = z.infer<typeof RiskSchema>;

export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'denied', 'expired', 'consumed']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  risk: RiskSchema,
  action: z.string().max(200),
  detail: z.string().max(4000),
  context: z.record(z.string(), z.string()).optional(),
  status: ApprovalStatusSchema,
  token: z.string().min(1).optional(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

const COLLECTION = 'approvals';
const TTL_MS = 15 * 60 * 1000;

function signingSecret(): string | null {
  return (
    process.env.CREDENTIAL_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    null
  );
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function all(): Approval[] {
  return readCollection<Approval>(COLLECTION, []);
}

function save(rows: Approval[]): void {
  writeCollection(COLLECTION, rows.slice(0, 300));
}

function sweep(rows: Approval[]): Approval[] {
  const now = Date.now();
  let changed = false;
  const next = rows.map((row) => {
    if (
      (row.status === 'pending' || row.status === 'approved') &&
      Date.parse(row.expiresAt) <= now
    ) {
      changed = true;
      return { ...row, status: 'expired' as const, token: undefined };
    }
    return row;
  });
  if (changed) save(next);
  return next;
}

export function requestApproval(input: {
  risk: ApprovalRisk;
  action: string;
  detail: string;
  context?: Record<string, string>;
}): Approval {
  const parsed = z
    .object({
      risk: RiskSchema,
      action: z.string().trim().min(1).max(200),
      detail: z.string().trim().min(1).max(4000),
      context: z.record(z.string(), z.string().max(1000)).optional(),
    })
    .parse(input);
  if (parsed.risk === 'none') {
    throw new Error('Only consequential actions require approval.');
  }
  const now = new Date();
  const approval: Approval = {
    id: randomUUID(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    risk: parsed.risk,
    action: parsed.action,
    detail: parsed.detail,
    ...(parsed.context ? { context: parsed.context } : {}),
    status: 'pending',
  };
  insertRow(COLLECTION, approval, 300);
  return approval;
}

export function decideApproval(id: string, decision: 'approved' | 'denied'): Approval {
  const secret = signingSecret();
  if (!secret) {
    throw new Error('Set CREDENTIAL_ENCRYPTION_KEY (or AUTH_SECRET) before approving actions.');
  }
  const rows = sweep(all());
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error('Approval not found.');
  const current = rows[idx];
  if (current.status !== 'pending') throw new Error(`Approval is ${current.status}.`);
  if (decision === 'denied') {
    const denied: Approval = { ...current, status: 'denied', token: undefined };
    rows[idx] = denied;
    save(rows);
    return denied;
  }
  const payload = `${current.id}.${current.risk}.${current.expiresAt}`;
  const approved: Approval = {
    ...current,
    status: 'approved',
    token: `${payload}.${sign(payload, secret)}`,
  };
  rows[idx] = approved;
  save(rows);
  return approved;
}

/** Single-use: verify then consume, so an approval cannot be replayed. */
export function verifyApprovalToken(token: string, expectedRisk?: ApprovalRisk): Approval {
  const secret = signingSecret();
  if (!secret) throw new Error('Approval signing is not configured.');
  const parts = token.split('.');
  if (parts.length < 5) throw new Error('Approval token is malformed.');
  const sig = parts.at(-1) ?? '';
  const payload = parts.slice(0, -1).join('.');
  const [id, risk] = parts;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Approval token is invalid.');
  }
  const rows = sweep(all());
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error('Approval not found.');
  if (found.status === 'consumed') throw new Error('Approval was already used.');
  if (found.status !== 'approved') throw new Error(`Approval is ${found.status}.`);
  if (expectedRisk && found.risk !== expectedRisk && risk !== expectedRisk) {
    throw new Error('Approval does not cover this risk class.');
  }
  if (found.risk !== (risk as ApprovalRisk)) throw new Error('Approval risk mismatch.');
  const consumed: Approval = { ...found, status: 'consumed', token: undefined };
  save(rows.map((r) => (r.id === found.id ? consumed : r)));
  return consumed;
}

export function listApprovals(limit = 50): Approval[] {
  return sweep(all())
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit)
    .map((row) => (row.status === 'approved' ? row : { ...row, token: undefined }));
}
