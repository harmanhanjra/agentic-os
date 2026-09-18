'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CircleAlert, RotateCcw, Timer } from 'lucide-react';
import { StatusChip } from './model-menu';
import { isModelReady, useRegistry } from './use-registry';

interface ArenaResult {
  modelId?: string;
  providerId?: string;
  content?: string;
  latencyMs?: number;
  error?: string;
}

export function ArenaClient() {
  const { models, providers, loading, failed, reload } = useRegistry();
  const [prompt, setPrompt] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ArenaResult[] | null>(null);
  const [meta, setMeta] = useState<{ latencyMs: number; requestId: string } | null>(null);
  const [failure, setFailure] = useState<{ message: string; code?: string; requestId?: string } | null>(null);

  const nameOf = (id: string) =>
    models.find((m) => m.id === id)?.displayName ?? id;

  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id].slice(0, 4),
    );

  const readyPicked = useMemo(
    () =>
      picked.filter((id) => {
        const m = models.find((x) => x.id === id);
        return m && isModelReady(m, providers);
      }),
    [picked, models, providers],
  );

  const valid = prompt.trim().length > 0 && picked.length >= 2;

  const run = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setFailure(null);
    setResults(null);
    try {
      const res = await fetch('/api/arena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), modelIds: picked }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setFailure({
          message: body?.error?.message ?? 'The arena run could not start.',
          code: body?.error?.code,
          requestId: body?.requestId ?? res.headers.get('x-request-id'),
        });
        return;
      }
      setResults(body.data ?? []);
      setMeta({
        latencyMs: body.latencyMs ?? 0,
        requestId: body.requestId ?? res.headers.get('x-request-id') ?? '',
      });
    } catch {
      setFailure({ message: 'Network error while reaching the arena endpoint.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 md:px-10">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-accent">
        Compare outputs
      </p>
      <h1 className="text-3xl font-medium tracking-tight">Model Arena</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
        Run one prompt across two to four registry models and inspect latency
        side by side. Models without a connected router report an error instead
        of fake output.
      </p>

      <div className="mt-8 rounded-2xl border border-line bg-panel p-5 md:p-6">
        <label htmlFor="arena-prompt" className="text-xs font-medium text-muted">
          Prompt
        </label>
        <textarea
          id="arena-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A question every model should answer…"
          rows={3}
          maxLength={20_000}
          className="mt-2 w-full resize-none rounded-xl border border-line bg-canvas p-4 text-sm outline-none placeholder:text-faint focus:border-focus"
        />

        {loading ? (
          <div className="mt-4 flex gap-2" aria-busy="true" aria-label="Loading models">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 w-32 animate-pulse-soft rounded-full bg-raised" />
            ))}
          </div>
        ) : failed ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-canvas p-3" role="alert">
            <p className="flex-1 text-xs text-muted">Couldn&apos;t load the model registry.</p>
            <button
              type="button"
              onClick={reload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-line-strong hover:text-ink"
            >
              <RotateCcw size={12} aria-hidden /> Retry
            </button>
          </div>
        ) : (
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-muted">
              Models <span className="text-faint">(pick 2–4, any router)</span>
            </legend>
            <div className="mt-2 space-y-3">
              {providers.map((p) => {
                const items = models.filter((m) => m.providerId === p.id);
                if (items.length === 0) return null;
                return (
                  <div key={p.id}>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                      {p.displayName} · {p.configured ? 'connected' : 'not connected'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((m) => {
                        const on = picked.includes(m.id);
                        const ready = isModelReady(m, providers);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggle(m.id)}
                            aria-pressed={on}
                            title={ready ? m.id : `${m.displayName} — ${p.hint ?? 'needs a key'}`}
                            className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs transition ${
                              on
                                ? 'border-focus bg-overlay text-ink'
                                : 'border-line text-muted hover:border-line-strong'
                            }`}
                          >
                            <span
                              aria-hidden
                              className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-accent' : 'bg-faint'}`}
                            />
                            {m.displayName}
                            <StatusChip ready={ready} local={m.local} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-faint" role="status">
            {picked.length < 2
              ? `Select at least ${2 - picked.length} more model${picked.length === 1 ? '' : 's'}.`
              : `${picked.length} selected · ${readyPicked.length} ready · ${picked.length - readyPicked.length} need a key`}
          </p>
          <button
            type="button"
            onClick={run}
            disabled={!valid || busy || loading}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? 'Running…' : 'Run comparison'} <ArrowUpRight size={14} aria-hidden />
          </button>
        </div>
      </div>

      {failure && (
        <div className="mt-4 rounded-2xl border border-line bg-panel p-5" role="alert">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleAlert size={15} className="text-danger" aria-hidden />
            {failure.code === 'PROVIDER_NOT_CONFIGURED' ? 'No provider connected' : 'Arena run failed'}
          </p>
          <p className="mt-1.5 text-[13px] text-muted">{failure.message}</p>
          {failure.code === 'PROVIDER_NOT_CONFIGURED' && (
            <Link
              href="/settings"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
            >
              Open provider settings <ArrowUpRight size={14} aria-hidden />
            </Link>
          )}
          {failure.requestId && (
            <p className="mt-2 font-mono text-[10px] text-faint">request {failure.requestId}</p>
          )}
        </div>
      )}

      {busy && (
        <div className="mt-4 grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Running comparison">
          {picked.map((id) => (
            <div key={id} className="h-44 animate-pulse-soft rounded-2xl border border-line bg-panel" />
          ))}
        </div>
      )}

      {results && !busy && (
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] text-faint">
            <Timer size={12} aria-hidden />
            Finished in {(meta?.latencyMs ?? 0).toLocaleString()} ms
            {meta?.requestId ? <span className="font-mono">· request {meta.requestId}</span> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {results.map((r, i) => (
              <article key={r.modelId ?? i} className="rounded-2xl border border-line bg-panel p-5">
                <header className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="truncate text-xs font-medium">
                    {r.modelId ? nameOf(r.modelId) : `Model ${i + 1}`}
                  </h2>
                  {typeof r.latencyMs === 'number' && (
                    <span className="shrink-0 font-mono text-[10px] text-faint">
                      {r.latencyMs.toLocaleString()} ms
                    </span>
                  )}
                </header>
                {r.error || !r.content ? (
                  <p className="flex items-center gap-2 text-xs text-muted" role="status">
                    <CircleAlert size={13} className="text-danger" aria-hidden />
                    {r.error === 'MODEL_UNAVAILABLE' || r.error === 'PROVIDER_ERROR'
                      ? 'Router not connected — no output fabricated.'
                      : `This model did not return output (${r.error ?? 'empty'}).`}
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap text-[13px] leading-6 text-ink/90">{r.content}</p>
                )}
                {r.providerId && (
                  <p className="mt-3 font-mono text-[10px] text-faint">{r.providerId}</p>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
