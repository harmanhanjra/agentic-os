import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { ChatClient } from '@/components/chat-client';

function ChatSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-8"
      aria-busy="true"
      aria-label="Loading conversation"
    >
      {[70, 45, 85].map((w) => (
        <div
          key={w}
          style={{ width: `${w}%` }}
          className="h-14 animate-pulse-soft rounded-2xl bg-raised"
        />
      ))}
    </div>
  );
}

export default function ChatPage() {
  return (
    <AppShell>
      <Suspense fallback={<ChatSkeleton />}>
        <ChatClient />
      </Suspense>
    </AppShell>
  );
}
