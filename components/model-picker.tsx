'use client';

import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { CapabilityBadges, StatusChip } from './model-menu';
import {
  AUTO_ID,
  isModelReady,
  readSelectedModel,
  useRegistry,
  writeSelectedModel,
} from './use-registry';

/** Full model + router picker for the home page. */
export function ModelPicker({ onChange }: { onChange?: (modelId: string) => void }) {
  const { models, providers, loading, failed, reload } = useRegistry();
  const [selected, setSelected] = useState<string>(AUTO_ID);
  const [filter, setFilter] = useState<string>('all');
  const [custom, setCustom] = useState('');

  useEffect(() => {
    setSelected(readSelectedModel());
  }, []);

  const pick = (id: string) => {
    setSelected(id);
    writeSelectedModel(id);
    onChange?.(id);
  };

  const visible = useMemo(
    () => (filter === 'all' ? models : models.filter((m) => m.providerId === filter)),
    [models, filter],
  );
  const readyCount = useMemo(
    () => models.filter((m) => isModelReady(m, providers)).length,
    [models, providers],
  );

  const submitCustom = () => {
    const id = custom.trim();
    if (!id) return;
    pick(id.startsWith('litellm:') ? id : `litellm:${id}`);
    setCustom('');
    setFilter('all');
  };

  return (
    <section aria-labelledby="model-heading" className="rounded-2xl border border-line bg-panel p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 id="model-heading" className="text-sm font-medium">
            Choose a model
          </h2>
          <p className="mt-1 text-xs text-faint">
            {loading
              ? 'Loading routers…'
              : `${readyCount} of ${models.length} ready · Auto picks a ready one`}
          </p>
        </div>
        <Sparkles size={17} className="text-accent" aria-hidden />
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading models">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse-soft rounded-lg bg-raised" />
          ))}
        </div>
      ) : failed ? (
        <div className="rounded-xl border border-line bg-canvas p-4 text-center" role="alert">
          <p className="text-xs text-muted">Couldn&apos;t load the model registry.</p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-line-strong hover:text-ink"
          >
            <RotateCcw size={12} aria-hidden /> Retry
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by provider">
            <button
              type="button"
              onClick={() => setFilter('all')}
              aria-pressed={filter === 'all'}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                filter === 'all'
                  ? 'border-focus bg-overlay text-ink'
                  : 'border-line text-muted hover:border-line-strong'
              }`}
            >
              All · {models.length}
            </button>
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setFilter(p.id)}
                aria-pressed={filter === p.id}
                title={p.configured ? `${p.displayName} connected` : p.hint ?? `${p.displayName} not connected`}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                  filter === p.id
                    ? 'border-focus bg-overlay text-ink'
                    : 'border-line text-muted hover:border-line-strong'
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${p.configured ? 'bg-accent' : 'bg-faint'}`}
                />
                {p.displayName} · {p.modelCount}
              </button>
            ))}
          </div>

          <div role="radiogroup" aria-label="Model selection" className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            <button
              type="button"
              role="radio"
              aria-checked={selected === AUTO_ID}
              onClick={() => pick(AUTO_ID)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                selected === AUTO_ID ? 'border-focus bg-overlay' : 'border-transparent hover:bg-raised'
              }`}
            >
              <Sparkles size={15} aria-hidden className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">Auto</span>
                <span className="block truncate text-[10px] text-faint">
                  Best ready router for this task
                </span>
              </span>
              {selected === AUTO_ID && (
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              )}
            </button>

            {visible.map((m) => {
              const ready = isModelReady(m, providers);
              const active = selected === m.id;
              const provider = providers.find((p) => p.id === m.providerId);
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pick(m.id)}
                  title={ready ? m.id : `${m.displayName} — ${provider?.hint ?? 'needs a key'}`}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                    active ? 'border-focus bg-overlay' : 'border-transparent hover:bg-raised'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{m.displayName}</span>
                    <span className="mt-1 block">
                      <CapabilityBadges capabilities={m.capabilities} />
                    </span>
                  </span>
                  <StatusChip ready={ready} local={m.local} />
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <label htmlFor="picker-custom-model" className="text-[11px] font-medium text-muted">
              Any other router via LiteLLM gateway
            </label>
            <div className="mt-1.5 flex gap-1.5">
              <input
                id="picker-custom-model"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitCustom();
                }}
                placeholder="e.g. openrouter/deepseek-r1"
                className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-xs outline-none placeholder:text-faint focus:border-focus"
              />
              <button
                type="button"
                onClick={submitCustom}
                disabled={!custom.trim()}
                className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
              >
                Use
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
