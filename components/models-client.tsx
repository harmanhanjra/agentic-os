'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, RotateCcw, Search } from 'lucide-react';
import { AppShell } from './app-shell';
import { CapabilityBadges, StatusChip } from './model-menu';
import { isModelReady, useRegistry } from './use-registry';

const CAPABILITY_OPTIONS = ['text', 'vision', 'reasoning', 'tools', 'json', 'image-generation'] as const;

export function ModelsClient() {
  const { models, providers, loading, failed, reload } = useRegistry();
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [capability, setCapability] = useState('all');
  const [readyOnly, setReadyOnly] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (providerFilter !== 'all' && m.providerId !== providerFilter) return false;
      if (capability !== 'all' && !m.capabilities.includes(capability)) return false;
      if (readyOnly && !isModelReady(m, providers)) return false;
      if (q && !`${m.displayName} ${m.id}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [models, providers, query, providerFilter, capability, readyOnly]);

  const syncMessages = useMemo(
    () => Object.entries(syncMsg).filter(([, v]) => v),
    [syncMsg],
  );

  const readyCount = useMemo(
    () => models.filter((m) => isModelReady(m, providers)).length,
    [models, providers],
  );

  const sync = async (providerId: string) => {
    setSyncing(providerId);
    try {
      const res = await fetch('/api/providers/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setSyncMsg((m) => ({
          ...m,
          [providerId]: { ok: false, text: body?.error?.message ?? 'Sync failed.' },
        }));
        return;
      }
      const count = body?.data?.models?.length ?? 0;
      setSyncMsg((m) => ({
        ...m,
        [providerId]: { ok: true, text: `Discovered ${count} model${count === 1 ? '' : 's'} from provider API.` },
      }));
      reload();
    } catch {
      setSyncMsg((m) => ({ ...m, [providerId]: { ok: false, text: 'Network error while syncing.' } }));
    } finally {
      setSyncing(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 md:px-10">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-accent">
          Capability control
        </p>
        <h1 className="text-3xl font-medium tracking-tight">Model Registry</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          Registered models are discovered from your providers and filtered by capabilities,
          availability, and local status — never hard-coded names.
        </p>
        <p className="mt-2 text-xs text-faint" role="status">
          {loading ? 'Loading registry…' : `${readyCount} of ${models.length} ready`}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-panel px-3">
            <Search size={14} aria-hidden className="shrink-0 text-faint" />
            <label htmlFor="models-search" className="sr-only">Search models</label>
            <input
              id="models-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or id…"
              className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs text-muted">
            <input
              type="checkbox"
              checked={readyOnly}
              onChange={(e) => setReadyOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-current"
            />
            Ready only
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by provider">
          <button
            type="button"
            onClick={() => setProviderFilter('all')}
            aria-pressed={providerFilter === 'all'}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
              providerFilter === 'all' ? 'border-focus bg-overlay text-ink' : 'border-line text-muted hover:border-line-strong'
            }`}
          >
            All · {models.length}
          </button>
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProviderFilter(p.id)}
              aria-pressed={providerFilter === p.id}
              title={p.configured ? `${p.displayName} connected` : (p.hint ?? `${p.displayName} not connected`)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                providerFilter === p.id ? 'border-focus bg-overlay text-ink' : 'border-line text-muted hover:border-line-strong'
              }`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${p.configured ? 'bg-accent' : 'bg-faint'}`} />
              {p.displayName} · {p.modelCount}
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filter by capability">
          {['all', ...CAPABILITY_OPTIONS].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCapability(c)}
              aria-pressed={capability === c}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                capability === c ? 'border-focus bg-overlay text-ink' : 'border-line text-muted hover:border-line-strong'
              }`}
            >
              {c === 'all' ? 'Any capability' : c}
            </button>
          ))}
        </div>

        {syncMessages.length > 0 && !loading && !failed && (
          <div className="mt-4 space-y-1.5" aria-live="polite">
            {syncMessages.map(([providerId, msg]) => (
              <p
                key={providerId}
                className={`rounded-lg border border-line bg-panel px-3 py-2 text-[11px] ${msg.ok ? 'text-muted' : 'text-danger'}`}
                role={msg.ok ? 'status' : 'alert'}
              >
                <span className="font-mono">{providerId}</span>: {msg.text}
              </p>
            ))}
          </div>
        )}

        {loading ? (
          <div className="mt-4 space-y-2" aria-busy="true" aria-label="Loading models">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse-soft rounded-xl border border-line bg-panel" />
            ))}
          </div>
        ) : failed ? (
          <div className="mt-4 rounded-2xl border border-line bg-panel p-6 text-center" role="alert">
            <p className="text-sm text-muted">Couldn&apos;t load the model registry.</p>
            <button
              type="button"
              onClick={reload}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-muted hover:border-line-strong hover:text-ink"
            >
              <RotateCcw size={12} aria-hidden /> Retry
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-line bg-panel p-8 text-center" role="status">
            <p className="text-sm font-medium">No models match these filters</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-faint">
              Try a different search term, or connect a provider in Settings to unlock more routers.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-focus px-4 py-2 text-xs font-medium text-accent transition hover:bg-overlay"
            >
              Open provider settings <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {visible.map((m) => {
              const ready = isModelReady(m, providers);
              const provider = providers.find((p) => p.id === m.providerId);
              return (
                <li key={m.id} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-medium">{m.displayName}</h2>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-faint">{m.id}</p>
                      <div className="mt-1.5">
                        <CapabilityBadges capabilities={m.capabilities} />
                      </div>
                      {!ready && (
                        <p className="mt-1.5 text-[11px] text-faint">
                          {provider?.hint ?? 'Needs a provider key.'}{' '}
                          <Link href="/settings" className="text-accent underline-offset-2 hover:underline">
                            Connect
                          </Link>
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusChip ready={ready} local={m.local} />
                      {provider?.configured && (
                        <button
                          type="button"
                          onClick={() => sync(m.providerId)}
                          disabled={syncing === m.providerId}
                          className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
                        >
                          {syncing === m.providerId ? 'Syncing…' : 'Sync'}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
