'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { developmentModels } from '@/lib/ai/registry';
import { CapabilityBadges } from './model-menu';
import { AUTO_ID } from './use-registry';

const MAX_LENGTH = 20_000;

function CapabilityLine({ modelId }: { modelId: string }) {
  if (modelId === AUTO_ID) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
        <span>Auto-routing across every connected router.</span>
        <CapabilityBadges capabilities={['text', 'reasoning', 'tools', 'vision']} />
      </p>
    );
  }
  if (modelId.startsWith('litellm:')) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
        <span>
          Custom gateway model{' '}
          <span className="font-mono text-muted">{modelId.slice('litellm:'.length)}</span>
        </span>
      </p>
    );
  }
  const model = developmentModels.find((m) => m.id === modelId);
  if (!model) {
    return (
      <p className="text-[11px] text-faint">
        Unknown model id — sending will return an honest error, not a guess.
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
      <span>
        {model.displayName} · {model.local ? 'runs on this machine' : `via ${model.providerId}`}
      </span>
      <CapabilityBadges capabilities={[...model.capabilities]} />
    </p>
  );
}

/** Entry prompt: collecting text here, generation happens in /chat. */
export function PromptBox({ modelId }: { modelId: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');

  const send = () => {
    const value = prompt.trim();
    if (!value) return;
    router.push(`/chat?prompt=${encodeURIComponent(value.slice(0, MAX_LENGTH))}`);
  };

  return (
    <section
      aria-labelledby="prompt-heading"
      className="rounded-2xl border border-line bg-panel p-5 md:p-6"
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 id="prompt-heading" className="text-sm font-medium">
            Start a conversation
          </h2>
          <p className="mt-1 text-xs text-faint">
            Ask anything or describe what you want to make.
          </p>
        </div>
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised text-muted"
        >
          ✎
        </span>
      </div>

      <label htmlFor="home-prompt" className="sr-only">
        What can I help you with?
      </label>
      <textarea
        id="home-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="What can I help you with? (Enter to send, Shift+Enter for a new line)"
        maxLength={MAX_LENGTH}
        rows={4}
        className="w-full resize-none rounded-xl border border-line bg-canvas p-4 text-sm outline-none placeholder:text-faint focus:border-focus"
      />

      <div className="mt-4 flex flex-col gap-3">
        <CapabilityLine modelId={modelId} />
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={send}
            disabled={!prompt.trim()}
            className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
          >
            Send <ArrowUpRight size={14} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

export function useGreeting() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  if (!now) return { date: '…', greeting: 'Hello' };
  const hour = now.getHours();
  return {
    date: new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(now),
    greeting:
      hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
  };
}
