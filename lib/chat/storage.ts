/**
 * Conversation persistence (client slice). Conversations auto-save to
 * localStorage on every change: list, resume, delete. The storage shape
 * mirrors the future PostgreSQL `conversations` table so the server
 * repository can adopt it without a UI rewrite.
 */

import { z } from 'zod';

export interface StoredJudgment {
  score: number;
  label: string;
  confidence: number;
  requestId: string;
}

export interface StoredBrowserTask {
  status: 'completed' | 'blocked' | 'awaiting_approval' | 'max_actions' | 'failed' | 'cancelled';
  finalUrl: string;
  finalTitle: string;
  actions: Array<{ index: number; type: string; status: string; message: string }>;
  extracted: string[];
  pendingApproval?: { id: string; risk: string; action: string; detail: string; expiresAt: string };
}

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  requestId?: string;
  latencyMs?: number;
  errorCode?: string;
  judgment?: StoredJudgment;
  plan?: string;
  browserTask?: StoredBrowserTask;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

const STORAGE_KEY = 'scaleos-conversations-v1';
const MAX_CONVERSATIONS = 100;
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  model: z.string().optional(),
  requestId: z.string().optional(),
  latencyMs: z.number().nonnegative().optional(),
  errorCode: z.string().optional(),
  judgment: z.object({
    score: z.number(), label: z.string(), confidence: z.number(), requestId: z.string(),
  }).optional(),
  plan: z.string().optional(),
  browserTask: z.object({
    status: z.enum(['completed', 'blocked', 'awaiting_approval', 'max_actions', 'failed', 'cancelled']),
    finalUrl: z.string(),
    finalTitle: z.string(),
    actions: z.array(z.object({ index: z.number(), type: z.string(), status: z.string(), message: z.string() })),
    extracted: z.array(z.string()),
    pendingApproval: z.object({
      id: z.string(), risk: z.string(), action: z.string(), detail: z.string(), expiresAt: z.string(),
    }).optional(),
  }).optional(),
  createdAt: z.number().nonnegative(),
}).passthrough();

const ConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  modelId: z.string(),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  messages: z.array(MessageSchema),
}).passthrough();

function readAll(strict = false): Conversation[] {
  if (typeof window === 'undefined') {
    if (strict) throw new Error('Browser storage is unavailable.');
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (strict) return z.array(ConversationSchema).parse(parsed);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const result = ConversationSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
  } catch {
    if (strict) throw new Error('Saved history could not be read. Existing data has not been overwritten.');
    return [];
  }
}

function writeAll(conversations: Conversation[]): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(conversations.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS)),
  );
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function autoTitle(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return 'New conversation';
  const text = first.content.trim().replace(/\s+/g, ' ');
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

export function listConversations(): Conversation[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveConversation(conversation: Conversation): void {
  const validated = ConversationSchema.parse(conversation);
  const all = readAll(true);
  const idx = all.findIndex((c) => c.id === conversation.id);
  if (idx >= 0) all[idx] = validated;
  else all.unshift(validated);
  writeAll(all);
}

export function deleteConversation(id: string): void {
  writeAll(readAll(true).filter((c) => c.id !== id));
}

export function blankConversation(modelId: string): Conversation {
  const now = Date.now();
  return {
    id: newId(),
    title: 'New conversation',
    modelId,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}
