'use client';

import { MessageSquare, Plus, Trash2, X } from 'lucide-react';
import type { Conversation } from '@/lib/chat/storage';

function relativeDay(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ConversationHistory({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  mobileOpen,
  onCloseMobile,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const body = (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            onNew();
            onCloseMobile();
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2.5 text-xs font-medium transition hover:border-line-strong"
        >
          <Plus size={14} aria-hidden /> New chat
        </button>
      </div>
      <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
        History · saved on this device
      </p>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Conversations">
        {conversations.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-faint" role="status">
            No saved chats yet.
          </li>
        )}
        {conversations.map((c) => {
          const active = c.id === activeId;
          return (
            <li key={c.id} className="group relative">
              <button
                type="button"
                onClick={() => {
                  onSelect(c.id);
                  onCloseMobile();
                }}
                aria-current={active ? 'true' : undefined}
                title={`${c.title} · ${new Date(c.updatedAt).toLocaleString()}`}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition ${
                  active ? 'bg-overlay text-ink' : 'text-muted hover:bg-raised hover:text-ink'
                }`}
              >
                <MessageSquare size={13} aria-hidden className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{c.title}</span>
                  <span className="block text-[10px] text-faint">
                    {relativeDay(c.updatedAt)} · {c.messages.length} msgs
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(c.id)}
                aria-label={`Delete "${c.title}"`}
                className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md p-1.5 text-faint transition hover:bg-canvas hover:text-danger group-hover:block"
              >
                <Trash2 size={13} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-line bg-panel md:block">
        <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-hidden">{body}</div>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onCloseMobile} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 overflow-hidden border-r border-line bg-panel">
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close history"
                className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="h-[calc(100%-52px)]">{body}</div>
          </div>
        </div>
      )}
    </>
  );
}
