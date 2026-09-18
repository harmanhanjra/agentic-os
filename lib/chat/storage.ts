/**
 * Conversation persistence (client slice). Conversations auto-save to
 * localStorage on every change: list, resume, delete. The storage shape
 * mirrors the future PostgreSQL `conversations` table so the server
 * repository can adopt it without a UI rewrite.
 */

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  requestId?: string;
  latencyMs?: number;
  errorCode?: string;
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
const MAX_MESSAGES = 200;

function readAll(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is Conversation =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as Conversation).id === 'string' &&
        Array.isArray((c as Conversation).messages),
    );
  } catch {
    return [];
  }
}

function writeAll(conversations: Conversation[]): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)),
    );
  } catch {
    /* storage full or unavailable: chat keeps working in memory */
  }
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
  const all = readAll();
  const idx = all.findIndex((c) => c.id === conversation.id);
  const trimmed: Conversation = {
    ...conversation,
    messages: conversation.messages.slice(-MAX_MESSAGES),
  };
  if (idx >= 0) all[idx] = trimmed;
  else all.unshift(trimmed);
  writeAll(all);
}

export function deleteConversation(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id));
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
