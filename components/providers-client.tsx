'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Check,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Plug,
  RotateCcw,
  Trash2,
  Zap,
} from 'lucide-react';

interface ProviderInfo {
  id: string;
  displayName: string;
  local: boolean;
  kind: string;
  keyEnv: string | null;
  configured: boolean;
  source: 'local' | 'env' | 'none';
  masked: string | null;
  baseURL: string;
  modelCount: number;
  hint: string | null;
}

const ICONS: Record<string, typeof Cpu> = {
  openai: Zap,
  nvidia: Cpu,
  anthropic: Bot,
  ollama: Activity,
  litellm: Plug,
};

function SourceLabel({ p }: { p: ProviderInfo }) {
  if (p.source === 'local') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-focus/60 px-2.5 py-1 text-[10px] font-medium text-accent">
        <Check size={11} aria-hidden /> Connected · stored locally
      </span>
    );
  }
  if (p.source === 'env') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-focus/60 px-2.5 py-1 text-[10px] font-medium text-accent">
        <Check size={11} aria-hidden /> Connected · via {p.keyEnv}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[10px] font-medium text-faint">
      Not connected
    </span>
  );
}

export function ProvidersClient() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [baseInput, setBaseInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    fetch('/api/providers')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.data?.providers) setProviders(body.data.providers);
        else setFailed(true);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openFor = (p: ProviderInfo) => {
    setOpenForm(p.id);
    setKeyInput('');
    setBaseInput('');
    setShowKey(false);
    setFormMsg(null);
  };

  const save = async (p: ProviderInfo) => {
    if (!keyInput.trim() || saving) return;
    setSaving(true);
    setFormMsg(null);
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          providerId: p.id,
          apiKey: keyInput.trim(),
          ...(baseInput.trim() ? { baseURL: baseInput.trim() } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setFormMsg({
          ok: false,
          text: `${body?.error?.message ?? 'Save failed.'}${body?.requestId ? ` (request ${body.requestId})` : ''}`,
        });
        return;
      }
      setFormMsg({ ok: true, text: `${p.displayName} key saved and encrypted.` });
      setKeyInput('');
      setBaseInput('');
      load();
    } catch {
      setFormMsg({ ok: false, text: 'Network error while saving.' });
    } finally {
      setSaving(false);
    }
  };

  const test = async (p: ProviderInfo) => {
    setTesting(p.id);
    setTestMsg((m) => ({ ...m, [p.id]: { ok: true, text: 'Testing…' } }));
    try {
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId: p.id }),
      });
      const body = await res.json().catch(() => null);
      const data = body?.data ?? body?.error;
      setTestMsg((m) => ({
        ...m,
        [p.id]: {
          ok: res.ok && data?.ok !== false,
          text: `${data?.message ?? 'No answer.'}${body?.requestId ? ` (request ${body.requestId})` : ''}`,
        },
      }));
    } catch {
      setTestMsg((m) => ({ ...m, [p.id]: { ok: false, text: 'Network error while testing.' } }));
    } finally {
      setTesting(null);
    }
  };

  const remove = async (p: ProviderInfo) => {
    if (confirming !== p.id) {
      setConfirming(p.id);
      return;
    }
    setConfirming(null);
    try {
      const res = await fetch(`/api/providers?providerId=${encodeURIComponent(p.id)}`, {
        method: 'DELETE',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setTestMsg((m) => ({
          ...m,
          [p.id]: { ok: false, text: body?.error?.message ?? 'Remove failed.' },
        }));
        return;
      }
      setTestMsg((m) => ({
        ...m,
        [p.id]: {
          ok: true,
          text: body?.data?.stillConfigured
            ? 'Local key removed — environment key still applies.'
            : 'Local key removed.',
        },
      }));
      load();
    } catch {
      setTestMsg((m) => ({ ...m, [p.id]: { ok: false, text: 'Network error.' } }));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 md:px-10">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-accent">
        Control plane
      </p>
      <h1 className="text-3xl font-medium tracking-tight">Providers</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
        Connect the routers ScaleOS may use. Keys are AES-256-GCM encrypted
        server-side and never returned — the UI only ever shows a masked shape.
      </p>

      {loading ? (
        <div className="mt-8 space-y-3" aria-busy="true" aria-label="Loading providers">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse-soft rounded-2xl border border-line bg-panel" />
          ))}
        </div>
      ) : failed ? (
        <div className="mt-8 rounded-2xl border border-line bg-panel p-6 text-center" role="alert">
          <p className="text-sm text-muted">Couldn&apos;t load provider status.</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-muted hover:border-line-strong hover:text-ink"
          >
            <RotateCcw size={12} aria-hidden /> Retry
          </button>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {providers.map((p) => {
            const Icon = ICONS[p.id] ?? KeyRound;
            const msg = testMsg[p.id];
            return (
              <li key={p.id} className="rounded-2xl border border-line bg-panel p-5 md:p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-raised text-accent">
                    <Icon size={18} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-medium">
                      {p.displayName}{' '}
                      <span className="ml-1 font-mono text-[10px] text-faint">
                        {p.modelCount} models
                      </span>
                    </h2>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-faint">
                      {p.masked ? `key ${p.masked} · ` : ''}
                      {p.baseURL}
                    </p>
                  </div>
                  <SourceLabel p={p} />
                </div>

                {!p.configured && p.hint && (
                  <p className="mt-3 text-xs leading-5 text-faint">{p.hint}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => (openForm === p.id ? setOpenForm(null) : openFor(p))}
                    className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover"
                  >
                    {p.source === 'local' ? 'Update key' : 'Add key'}
                  </button>
                  {p.configured && (
                    <button
                      type="button"
                      onClick={() => test(p)}
                      disabled={testing === p.id}
                      className="rounded-lg border border-line px-3.5 py-2 text-xs text-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
                    >
                      {testing === p.id ? 'Testing…' : 'Test connection'}
                    </button>
                  )}
                  {p.source === 'local' && (
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs transition ${
                        confirming === p.id
                          ? 'border-danger/60 text-danger'
                          : 'border-line text-muted hover:border-line-strong hover:text-ink'
                      }`}
                    >
                      <Trash2 size={12} aria-hidden />
                      {confirming === p.id ? 'Click again to confirm' : 'Remove'}
                    </button>
                  )}
                </div>

                {msg && (
                  <p
                    className={`mt-3 text-xs leading-5 ${msg.ok ? 'text-muted' : 'text-danger'}`}
                    role={msg.ok ? 'status' : 'alert'}
                  >
                    {msg.text}
                  </p>
                )}

                {openForm === p.id && (
                  <div className="mt-4 animate-rise-in rounded-xl border border-line bg-canvas p-4">
                    <label htmlFor={`key-${p.id}`} className="text-xs font-medium text-muted">
                      {p.displayName} API key
                      {p.keyEnv ? (
                        <span className="ml-1 font-mono text-[10px] text-faint">
                          (or set {p.keyEnv} and restart)
                        </span>
                      ) : (
                        <span className="ml-1 text-[10px] text-faint">(no key needed)</span>
                      )}
                    </label>
                    <div className="mt-1.5 flex gap-1.5">
                      <input
                        id={`key-${p.id}`}
                        type={showKey ? 'text' : 'password'}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder={p.keyEnv ? 'Paste key — it is encrypted on save' : 'Not required for local routers'}
                        autoComplete="off"
                        spellCheck={false}
                        className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs outline-none placeholder:font-sans placeholder:text-faint focus:border-focus"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((s) => !s)}
                        aria-label={showKey ? 'Hide key' : 'Show key'}
                        className="shrink-0 rounded-lg border border-line px-2.5 text-muted hover:border-line-strong hover:text-ink"
                      >
                        {showKey ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                      </button>
                    </div>
                    <label htmlFor={`base-${p.id}`} className="mt-3 block text-xs font-medium text-muted">
                      Base URL <span className="font-normal text-faint">(optional override)</span>
                    </label>
                    <input
                      id={`base-${p.id}`}
                      value={baseInput}
                      onChange={(e) => setBaseInput(e.target.value)}
                      placeholder={p.baseURL}
                      autoComplete="off"
                      spellCheck={false}
                      inputMode="url"
                      className="mt-1.5 w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs outline-none placeholder:text-faint focus:border-focus"
                    />
                    {formMsg && (
                      <p
                        className={`mt-2 text-xs ${formMsg.ok ? 'text-accent' : 'text-danger'}`}
                        role={formMsg.ok ? 'status' : 'alert'}
                      >
                        {formMsg.text}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => save(p)}
                        disabled={!keyInput.trim() || saving}
                        className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
                      >
                        {saving ? 'Saving…' : 'Save key'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenForm(null)}
                        className="rounded-lg border border-line px-4 py-2 text-xs text-muted hover:border-line-strong hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
