import type { ComputerAction } from './types';

export interface ComputerPolicyResult {
  allowed: boolean;
  risk:
    | 'none'
    | 'credential'
    | 'financial'
    | 'destructive'
    | 'external-communication'
    | 'account'
    | 'file';
  reason: string;
}

const CREDENTIAL =
  /\b(password|passcode|otp|one[- ]time|security\s+code|cvv|cvc|card\s+number|bank\s+account|sign\s*in|log\s*in)\b/i;
const FINANCIAL =
  /\b(buy|purchase|checkout|pay\b|transfer|withdraw|send\s+money|confirm\s+order|book\s+now)\b/i;
const DESTRUCTIVE =
  /\b(delete|erase|remove\s+account|close\s+account|factory\s+reset|format\s+drive|uninstall)\b/i;
const COMMUNICATION =
  /\b(send\s+(message|email|reply)|publish|post\b|submit\s+application|comment\b|tweet\b)\b/i;
const FILE_TRANSFER = /\b(upload|download|attach\s+file|share\s+file)\b/i;

export function evaluateComputerAction(action: ComputerAction): ComputerPolicyResult {
  if (action.type === 'done' || action.type === 'wait' || action.type === 'move') {
    return { allowed: true, risk: 'none', reason: 'Non-consequential observation/control action.' };
  }

  const description =
    action.type === 'type'
      ? [action.target, action.text].join(' ')
      : action.type === 'hotkey'
        ? [action.target, action.keys.join(' ')].join(' ')
        : 'target' in action
          ? action.target
          : '';

  if (CREDENTIAL.test(description)) {
    return {
      allowed: false,
      risk: 'credential',
      reason: 'Credential and authentication actions require an approval checkpoint.',
    };
  }
  if (FINANCIAL.test(description)) {
    return {
      allowed: false,
      risk: 'financial',
      reason: 'Financial actions require an approval checkpoint.',
    };
  }
  if (DESTRUCTIVE.test(description)) {
    return {
      allowed: false,
      risk: 'destructive',
      reason: 'Destructive actions require an approval checkpoint.',
    };
  }
  if (COMMUNICATION.test(description)) {
    return {
      allowed: false,
      risk: 'external-communication',
      reason: 'External communication requires an approval checkpoint.',
    };
  }
  if (FILE_TRANSFER.test(description)) {
    return {
      allowed: false,
      risk: 'file',
      reason: 'File transfer requires an approval checkpoint.',
    };
  }

  return { allowed: true, risk: 'none', reason: 'Action is within the current safe autonomy policy.' };
}
