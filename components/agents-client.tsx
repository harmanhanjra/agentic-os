'use client';

import { useState } from 'react';
import { Bot, LoaderCircle, Play, RotateCcw } from 'lucide-react';

interface AgentRun {
  runId: string;
  model: string;
  plan: string[];
  steps: Array<{
    index: number;
    instruction: string;
    output: string;
    latencyMs: number;
  }>;
  final: string;
  latencyMs: number;
}

export function AgentsClient() {
  const [objective, setObjective] = useState('');
  const [maxSteps, setMaxSteps] = useState(3);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    const value = objective.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      const response = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ objective: value, maxSteps }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (body?.error?.message ?? 'Agent run failed.') +
            (body?.requestId ? ' Request: ' + body.requestId : ''),
        );
        return;
      }
      setRun(body.data);
    } catch {
      setError('Network error while starting the agent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 md:px-10">
      <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-accent">
        <Bot size={14} aria-hidden /> Agent runtime V0.2
      </p>
      <h1 className="text-3xl font-medium tracking-tight">Agents</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        Give ScaleOS an objective. The runtime creates a bounded plan, executes each reasoning
        step, then synthesizes a final result. External tools remain disabled in this security-first
        V0.2 slice.
      </p>

      <div className="mt-8 rounded-2xl border border-line bg-panel p-5 md:p-6">
        <label htmlFor="agent-objective" className="text-xs font-medium text-muted">
          Objective
        </label>
        <textarea
          id="agent-objective"
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          placeholder="Example: Design a migration plan for this application from local storage to PostgreSQL."
          className="mt-2 min-h-32 w-full resize-y rounded-xl border border-line bg-canvas px-4 py-3 text-sm leading-6 outline-none placeholder:text-faint focus:border-focus"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            Max steps
            <select
              value={maxSteps}
              onChange={(event) => setMaxSteps(Number(event.target.value))}
              className="rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs outline-none"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={start}
            disabled={busy || objective.trim().length < 3}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
            {busy ? 'Running agent…' : 'Run agent'}
          </button>
          {(run || error) && (
            <button
              type="button"
              onClick={() => {
                setRun(null);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-muted hover:border-line-strong hover:text-ink"
            >
              <RotateCcw size={12} aria-hidden /> Clear
            </button>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs leading-5 text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      {run && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Plan</h2>
              <span className="font-mono text-[10px] text-faint">
                {run.model} · {run.latencyMs}ms
              </span>
            </div>
            <ol className="mt-4 space-y-2">
              {run.plan.map((step, index) => (
                <li key={step + String(index)} className="flex gap-3 text-sm leading-6 text-muted">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-accent">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {run.steps.map((step) => (
            <div key={step.index} className="rounded-2xl border border-line bg-panel p-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-accent">
                Step {step.index + 1} · {step.latencyMs}ms
              </p>
              <h3 className="mt-2 text-sm font-medium">{step.instruction}</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{step.output}</p>
            </div>
          ))}

          <div className="rounded-2xl border border-focus/40 bg-panel p-5 md:p-6">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-accent">Final synthesis</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink">{run.final}</p>
          </div>
        </div>
      )}
    </div>
  );
}
