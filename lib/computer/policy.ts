import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPrivateAddress } from '../security/url';
import type { BrowserAction, BrowserSnapshot } from './types';

export interface ActionPolicyResult {
  allowed: boolean;
  reason: string;
  risk:
    | 'none'
    | 'credential'
    | 'financial'
    | 'destructive'
    | 'external-communication'
    | 'account'
    | 'file';
}

const HIGH_RISK_TEXT =
  /\b(buy\s*now|purchase|place\s+order|pay\b|checkout|transfer|withdraw|send\s+money|delete|remove\s+account|close\s+account|publish|post\b|send\b|submit\s+application|confirm\s+order|book\s+now|sign\s*in|log\s*in|create\s+account)\b/i;
const CREDENTIAL_TEXT =
  /\b(password|passcode|otp|one[- ]time|security\s+code|cvv|cvc|card\s+number|credit\s+card|debit\s+card|bank\s+account|routing\s+number)\b/i;

export async function assertSafeBrowserUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Browser navigation supports only HTTP(S) URLs.');
  }
  if (url.username || url.password) {
    throw new Error('URLs with embedded credentials are blocked.');
  }

  const allowPrivate =
    process.env.NODE_ENV !== 'production' &&
    process.env.SCALEOS_BROWSER_ALLOW_PRIVATE === 'true';

  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isPrivateAddress(host)) {
      throw new Error('Private and local network targets are blocked.');
    }
    if (!isIP(host)) {
      const records = await lookup(host, { all: true, verbatim: true });
      if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
        throw new Error('Browser target resolves to a private or reserved address.');
      }
    }
  }

  return url;
}

function elementFor(action: BrowserAction, snapshot: BrowserSnapshot) {
  if (!('ref' in action) || !action.ref) return null;
  return snapshot.elements.find((element) => element.ref === action.ref) ?? null;
}

export function evaluateBrowserAction(
  action: BrowserAction,
  snapshot: BrowserSnapshot,
): ActionPolicyResult {
  if (action.type === 'navigate' || action.type === 'scroll' || action.type === 'extract' || action.type === 'done') {
    return { allowed: true, reason: 'Read/navigation action.', risk: 'none' };
  }

  if (action.type === 'press') {
    if (action.key === 'Enter') {
      return {
        allowed: false,
        reason: 'Enter can submit an unknown form. Use a clearly labeled safe button instead.',
        risk: 'external-communication',
      };
    }
    return { allowed: true, reason: 'Non-submitting keyboard action.', risk: 'none' };
  }

  const element = elementFor(action, snapshot);
  if (!element) {
    return { allowed: false, reason: 'The referenced element is stale or missing.', risk: 'none' };
  }

  const descriptor = [element.text, element.type ?? '', element.role].join(' ');
  if (element.type === 'password' || CREDENTIAL_TEXT.test(descriptor)) {
    return {
      allowed: false,
      reason: 'Credential and financial-secret entry is blocked in V0.3 alpha.',
      risk: 'credential',
    };
  }
  if (element.type === 'file') {
    return {
      allowed: false,
      reason: 'File upload requires the permission kernel.',
      risk: 'file',
    };
  }
  if (HIGH_RISK_TEXT.test(descriptor)) {
    const lower = descriptor.toLowerCase();
    const risk = /buy|purchase|order|pay|checkout|transfer|withdraw|money/.test(lower)
      ? 'financial'
      : /delete|remove|close/.test(lower)
        ? 'destructive'
        : /sign|login|account/.test(lower)
          ? 'account'
          : 'external-communication';
    return {
      allowed: false,
      reason: 'This action can cause an external, account, financial, or destructive side effect.',
      risk,
    };
  }

  return { allowed: true, reason: 'Safe browser interaction.', risk: 'none' };
}
