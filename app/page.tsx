'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CircleAlert, CircleCheck } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { PromptBox, useGreeting } from '@/components/prompt-box';
import { ModelPicker } from '@/components/model-picker';
import { readSelectedModel } from '@/components/use-registry';

const EXPLORE = [
  {
    title: 'Model Arena',
    desc: 'Compare responses side by side',
    href: '/arena',
    glyph: '▦',
  },
  {
    title: 'Image Studio',
    desc: 'Turn ideas into visuals',
    href: '/image',
    glyph: '◌',
  },
  {
    title: 'Flows',
    desc: 'Compose reliable model pipelines',
    href: '/flows',
    glyph: '⌁',
  },
] as const;

function ProviderStatus() {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; connected: string[]; modelCount: number; readyCount: number }
    | { kind: 'setup' }
  >({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!alive) return;
        const providers: Array<{ id: string; displayName: string; configured: boolean }> =
          body?.data?.providers ?? [];
        const models: Array<{ providerId: string }> = body?.data?.models ?? [];
        const connected = providers.filter((p) => p.configured);
        if (!body?.data || connected.length === 0) {
          setState({ kind: 'setup' });
          return;
        }
        const configuredIds = new Set(connected.map((p) => p.id));
        setState({
          kind: 'ready',
          connected: connected.map((p) => p.displayName),
          modelCount: models.length,
          readyCount: models.filter((m) => configuredIds.has(m.providerId)).length,
        });
      })
      .catch(() => alive && setState({ kind: 'setup' }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-faint" role="status">
        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-faint" />
        Checking provider connections…
      </p>
    );
  }
  if (state.kind === 'ready') {
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <CircleCheck size={13} className="text-accent" aria-hidden />
        {state.connected.join(' · ')} connected — {state.readyCount} of{' '}
        {state.modelCount} models ready.{' '}
        <Link href="/settings" className="text-accent underline-offset-2 hover:underline">
          Manage
        </Link>
      </p>
    );
  }
  return (
    <p className="mt-3 flex items-center gap-2 text-xs text-muted">
      <CircleAlert size={13} className="text-accent" aria-hidden />
      No router connected yet.{' '}
      <Link href="/settings" className="text-accent underline-offset-2 hover:underline">
        Connect one in Settings
      </Link>
    </p>
  );
}

export default function Home() {
  const { date, greeting } = useGreeting();
  const [model, setModel] = useState('auto');

  useEffect(() => setModel(readSelectedModel()), []);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 md:px-10 md:py-14">
        <div className="mb-10 animate-rise-in">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-accent">
            {date}
          </p>
          <h1 className="text-3xl font-medium tracking-tight md:text-4xl">
            {greeting}, Alex.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted">
            Your intelligent workspace is ready. What would you like to create
            today?
          </p>
          <ProviderStatus />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <PromptBox modelId={model} />
          <ModelPicker onChange={setModel} />
        </div>

        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">Explore your workspace</h2>
            <Link
              href="/models"
              className="flex items-center gap-1 text-xs text-muted transition hover:text-accent"
            >
              View all <ArrowUpRight size={12} aria-hidden />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {EXPLORE.map(({ title, desc, href, glyph }) => (
              <Link
                key={title}
                href={href}
                className="group rounded-xl border border-line bg-panel p-4 transition hover:-translate-y-0.5 hover:border-line-strong"
              >
                <div aria-hidden className="mb-7 text-xl text-accent">
                  {glyph}
                </div>
                <div className="text-xs font-medium">{title}</div>
                <div className="mt-1 text-[11px] leading-5 text-faint">{desc}</div>
                <ArrowUpRight
                  size={14}
                  aria-hidden
                  className="mt-3 text-faint transition group-hover:text-accent"
                />
              </Link>
            ))}
          </div>
        </div>

        <footer className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-[11px] text-faint md:flex-row md:items-center md:justify-between">
          <span>ScaleOS AI · One workspace. Every AI model.</span>
          <span>
            Answering with:{' '}
            <span className="text-muted">
              {model === 'auto' ? 'Auto (best ready router)' : model}
            </span>
          </span>
        </footer>
      </div>
    </AppShell>
  );
}
