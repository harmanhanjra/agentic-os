'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { AppShell } from './app-shell';
import { ModelMenu } from './model-menu';
import { AUTO_ID, readSelectedModel, writeSelectedModel } from './use-registry';

interface FlowStep {
  id: string;
  name: string;
  prompt: string;
}

const STORAGE_KEY = 'scaleos-flows';

function loadFlows(): FlowStep[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is FlowStep => typeof s === 'object' && s !== null && typeof (s as FlowStep).name === 'string')
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function FlowsClient() {
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [modelSel, setModelSel] = useState<string>(AUTO_ID);
  const [sourceText, setSourceText] = useState('');
  const [busy, setBusy] = useState(false);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<string | null>(null);

  useEffect(() => {
    setSteps(loadFlows());
    setModelSel(readSelectedModel());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
    } catch {
      /* storage unavailable */
    }
  }, [steps]);

  const valid = useMemo(
    () => sourceText.trim().length > 0 && steps.length > 0 && steps.every((s) => s.prompt.trim().length > 0),
    [sourceText, steps],
  );

  const addStep = () => {
    if (steps.length >= 8) return;
    setSteps((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, name: `Step ${prev.length + 1}`, prompt: '' }]);
  };

  const run = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setOutputs({});
    setLastMeta(null);
    const controller = new AbortController();
    const modelId = modelSel === AUTO_ID ? undefined : modelSel;
    try {
      // Server-side runner: one metered request, per-step results, run history.
      const response = await fetch('/api/flows/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceText: sourceText.trim(),
          steps: steps.map((s) => ({ name: s.name || 'Step', prompt: s.prompt })),
          ...(modelId ? { modelId } : {}),
        }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          (body?.error?.message ?? 'The flow could not complete.') +
            (body?.requestId ? ` Request: ${body.requestId}` : ''),
        );
      }
      const run = body?.data?.run as {
        runId: string;
        model: string;
        latencyMs: number;
        steps: Array<{ name: string; output: string }>;
      };
      const next: Record<string, string> = {};
      run.steps.forEach((stepResult, i) => {
        const step = steps[i];
        if (step) next[step.id] = stepResult.output;
      });
      setOutputs(next);
      setLastMeta(`${run.model} · ${(run.latencyMs / 1000).toFixed(1)}s · run ${run.runId.slice(0, 8)}`);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'The flow could not complete.');
    } finally {
      setBusy(false);
    }
  };

  const pickModel = (id: string) => {
    setModelSel(id);
    writeSelectedModel(id);
  };

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 md:px-10">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-accent">
          Workflow foundation
        </p>
        <h1 className="text-3xl font-medium tracking-tight">Flows</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          Compose a reliable Input → Prompt → Model → Output path. Each step runs against your
          configured provider — nothing is fabricated. Use <code className="font-mono text-xs">{'{{input}}'}</code> to
          place the previous output.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-faint">Answering with</span>
          <ModelMenu value={modelSel} onChange={pickModel} />
          <button
            type="button"
            onClick={addStep}
            disabled={steps.length >= 8}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-muted transition hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            <Plus size={13} aria-hidden /> Add step
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <label htmlFor="flow-input" className="text-xs font-medium text-muted">
              Flow input
            </label>
            <textarea
              id="flow-input"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste the source text every step will transform…"
              rows={5}
              maxLength={20_000}
              className="mt-2 w-full resize-y rounded-xl border border-line bg-canvas p-4 text-sm outline-none placeholder:text-faint focus:border-focus"
            />
            {steps.length === 0 ? (
              <div className="mt-4 rounded-xl border border-line bg-canvas p-5 text-center" role="status">
                <p className="text-sm font-medium">No steps yet</p>
                <p className="mt-1 text-xs leading-5 text-faint">
                  Add your first prompt step to build an Input → Prompt → Model → Output pipeline.
                </p>
              </div>
            ) : (
              <ol className="mt-4 space-y-3">
                {steps.map((step, i) => (
                  <li key={step.id} className="rounded-xl border border-line bg-canvas p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-muted">
                        {i + 1}
                      </span>
                      <input
                        value={step.name}
                        onChange={(e) =>
                          setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, name: e.target.value.slice(0, 80) } : s)))
                        }
                        aria-label={`Step ${i + 1} name`}
                        className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none placeholder:text-faint"
                        placeholder={`Step ${i + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))}
                        aria-label={`Remove ${step.name}`}
                        className="rounded-md p-1.5 text-faint transition hover:bg-raised hover:text-ink"
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>
                    <label htmlFor={`flow-step-${step.id}`} className="sr-only">
                      {step.name} prompt
                    </label>
                    <textarea
                      id={`flow-step-${step.id}`}
                      value={step.prompt}
                      onChange={(e) =>
                        setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, prompt: e.target.value.slice(0, 20_000) } : s)))
                      }
                      placeholder="Summarize {{input}} in three bullets…"
                      rows={3}
                      className="mt-2 w-full resize-y rounded-lg border border-line bg-panel p-3 text-[13px] leading-6 outline-none placeholder:text-faint focus:border-focus"
                    />
                    {outputs[step.id] && (
                      <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-overlay p-3 text-xs leading-5 text-muted">
                        {outputs[step.id]}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={run}
                disabled={!valid || busy}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
              >
                <Play size={13} aria-hidden /> {busy ? 'Running…' : 'Run flow'}
              </button>
              {(Object.keys(outputs).length > 0 || error) && !busy && (
                <button
                  type="button"
                  onClick={() => {
                    setOutputs({});
                    setError(null);
                    setLastMeta(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-muted hover:border-line-strong hover:text-ink"
                >
                  <RotateCcw size={12} aria-hidden /> Clear
                </button>
              )}
              {lastMeta && (
                <span className="font-mono text-[10px] text-faint">{lastMeta}</span>
              )}
            </div>
            {error && (
              <p className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs leading-5 text-danger" role="alert">
                {error}{' '}
                <Link href="/settings" className="underline underline-offset-2">
                  Open provider settings
                </Link>
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-panel p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">What unlocks</h2>
            <ul className="mt-4 space-y-3">
              {[
                'Compose Input → Prompt → Model → Output pipelines',
                'Steps persist on this device and rerun any time',
                'Server-side runner with per-step results, usage metering, and run history',
              ].map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5 text-[13px] leading-5 text-muted">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {bullet}
                </li>
              ))}
            </ul>
            <ol className="mt-6 space-y-2 border-t border-line pt-5 text-xs text-faint">
              {['Add a credential in Settings', 'Add prompt steps here', 'Run the flow to work'].map((step, i) => (
                <li key={step} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-muted">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <Link
              href="/settings"
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-focus px-4 py-2 text-xs font-medium text-accent transition hover:bg-overlay"
            >
              Open provider settings <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
