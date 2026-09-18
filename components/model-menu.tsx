'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, Bot, ChevronDown, Cpu, Sparkles, Zap } from 'lucide-react';
import {
  AUTO_ID,
  isModelReady,
  labelForSelection,
  useRegistry,
  writeSelectedModel,
  type RegistryModel,
} from './use-registry';

const PROVIDER_ICONS: Record<string, typeof Cpu> = {
  openai: Zap,
  nvidia: Cpu,
  anthropic: Bot,
  ollama: Activity,
  litellm: Sparkles,
};

export function StatusChip({ ready, local }: { ready: boolean; local?: boolean }) {
  if (ready) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-focus/60 px-2 py-0.5 text-[10px] font-medium text-accent">
        <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
        {local ? 'Local · Ready' : 'Ready'}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-faint">
      <span aria-hidden className="h-1 w-1 rounded-full bg-faint" />
      Needs key
    </span>
  );
}

export function CapabilityBadges({ capabilities }: { capabilities: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {capabilities.slice(0, 4).map((c) => (
        <span
          key={c}
          className="rounded border border-line bg-raised px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-muted"
        >
          {c === 'json' ? 'JSON' : c}
        </span>
      ))}
    </span>
  );
}

function providerName(providers: { id: string; displayName: string }[], id: string) {
  return providers.find((p) => p.id === id)?.displayName ?? id;
}

/**
 * Compact model switcher: an explicit button showing exactly which router
 * will answer, opening a grouped menu with per-model readiness.
 */
export function ModelMenu({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { models, providers, loading } = useRegistry();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const pick = (id: string) => {
    writeSelectedModel(id);
    onChange(id);
    setOpen(false);
    setShowCustom(false);
  };

  const current: RegistryModel | undefined = models.find((m) => m.id === value);
  const currentReady = current ? isModelReady(current, providers) : value === AUTO_ID;

  const submitCustom = () => {
    const id = custom.trim();
    if (!id) return;
    pick(id.startsWith('litellm:') ? id : `litellm:${id}`);
    setCustom('');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Answering model: ${labelForSelection(value, models)}. Change model`}
        className="flex max-w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs transition hover:border-line-strong"
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${currentReady ? 'bg-accent' : 'bg-faint'}`}
        />
        <span className="truncate font-medium">
          {loading ? 'Loading models…' : labelForSelection(value, models)}
        </span>
        {!currentReady && !loading && (
          <span className="shrink-0 text-[10px] text-faint">needs key</span>
        )}
        <ChevronDown size={13} aria-hidden className="shrink-0 text-faint" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-line-strong bg-panel p-2 shadow-2xl">
          <button
            type="button"
            role="option"
            aria-selected={value === AUTO_ID}
            onClick={() => pick(AUTO_ID)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition hover:bg-raised ${
              value === AUTO_ID ? 'bg-overlay' : ''
            }`}
          >
            <Sparkles size={14} aria-hidden className="shrink-0 text-accent" />
            <span className="flex-1">
              <span className="block font-medium">Auto</span>
              <span className="block text-[10px] text-faint">
                Best ready router for the task
              </span>
            </span>
          </button>

          {providers.map((p) => {
            const items = models.filter((m) => m.providerId === p.id);
            if (items.length === 0) return null;
            const Icon = PROVIDER_ICONS[p.id] ?? Cpu;
            return (
              <div key={p.id} className="mt-1">
                <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                  <Icon size={11} aria-hidden /> {p.displayName}
                  <span className={p.configured ? 'text-accent' : ''}>
                    · {p.configured ? 'connected' : 'not connected'}
                  </span>
                </p>
                {items.map((m) => {
                  const ready = isModelReady(m, providers);
                  const active = value === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pick(m.id)}
                      title={ready ? m.displayName : `${m.displayName} — ${p.hint ?? 'needs a key'}`}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition hover:bg-raised ${
                        active ? 'bg-overlay' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.displayName}</span>
                        <span className="block truncate text-[10px] text-faint">
                          {m.id}
                        </span>
                      </span>
                      <StatusChip ready={ready} local={m.local} />
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div className="mt-2 border-t border-line p-2">
            {!showCustom ? (
              <button
                type="button"
                onClick={() => setShowCustom(true)}
                className="w-full rounded-lg px-2 py-2 text-left text-[11px] text-muted transition hover:bg-raised hover:text-ink"
              >
                + Use any other router via LiteLLM gateway…
              </button>
            ) : (
              <div>
                <label htmlFor="menu-custom-model" className="px-1 text-[10px] text-faint">
                  Gateway model id (e.g. openrouter/deepseek-r1)
                </label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    id="menu-custom-model"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitCustom();
                    }}
                    placeholder="provider/model-name"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs outline-none placeholder:text-faint focus:border-focus"
                  />
                  <button
                    type="button"
                    onClick={submitCustom}
                    disabled={!custom.trim()}
                    className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-40"
                  >
                    Use
                  </button>
                </div>
              </div>
            )}
            <Link
              href="/settings"
              className="mt-1 block rounded-lg px-2 py-2 text-[11px] text-faint transition hover:bg-raised hover:text-muted"
            >
              Manage providers in Settings →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export { providerName };
