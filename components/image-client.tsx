'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { AppShell } from './app-shell';

interface JobSubmitted {
  requestId: string;
  statusUrl: string;
  modelId: string;
}

type JobState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'polling'; job: JobSubmitted; status: string }
  | { kind: 'ready'; job: JobSubmitted; result: unknown }
  | { kind: 'failed'; message: string; requestId?: string };

/** Image Studio: submit to Higgsfield, then poll the job endpoint until it resolves. */
export function ImageClient() {
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<JobState>({ kind: 'idle' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const poll = useCallback(
    async (job: JobSubmitted) => {
      try {
        const res = await fetch(`/api/images/jobs/${encodeURIComponent(job.requestId)}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setState({
            kind: 'failed',
            message: body?.error?.message ?? 'Could not read the job status.',
            requestId: body?.requestId ?? undefined,
          });
          stopPolling();
          return;
        }
        const data = body?.data as { status?: string } | null;
        const status = typeof data?.status === 'string' ? data.status : 'processing';
        if (status === 'completed' || status === 'succeeded' || status === 'success') {
          setState({ kind: 'ready', job, result: body.data });
          stopPolling();
          return;
        }
        if (status === 'failed' || status === 'error' || status === 'cancelled') {
          setState({ kind: 'failed', message: `Higgsfield reported the job as ${status}.`, requestId: body?.requestId });
          stopPolling();
          return;
        }
        setState({ kind: 'polling', job, status });
      } catch {
        setState({ kind: 'failed', message: 'Network error while polling the job status.' });
        stopPolling();
      }
    },
    [stopPolling],
  );

  const generate = async () => {
    if (!prompt.trim() || state.kind === 'submitting') return;
    stopPolling();
    setState({ kind: 'submitting' });
    try {
      const response = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelId: 'higgsfield:seedream-v4',
          prompt: prompt.trim(),
          aspectRatio: '16:9',
          resolution: '2K',
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setState({
          kind: 'failed',
          message: body?.error?.message ?? 'Generation could not start.',
          requestId: body?.requestId ?? undefined,
        });
        return;
      }
      const job = body.data as JobSubmitted;
      setState({ kind: 'polling', job, status: 'queued' });
      void poll(job);
      timer.current = setInterval(() => void poll(job), 5000);
    } catch {
      setState({ kind: 'failed', message: 'Network error while submitting the generation.' });
    }
  };

  const reset = () => {
    stopPolling();
    setState({ kind: 'idle' });
  };

  const busy = state.kind === 'submitting' || state.kind === 'polling';

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 md:px-10">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-accent">
          Creative workspace
        </p>
        <h1 className="text-3xl font-medium tracking-tight">Image Studio</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          Generate images with the official Higgsfield API. Jobs are asynchronous and never
          reported as complete until the provider returns a result.
        </p>

        <section className="mt-10 rounded-2xl border border-line bg-panel p-5 md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-raised text-accent">
              <ImageIcon size={18} aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-medium">New generation</h2>
              <p className="text-xs text-faint">Higgsfield · Seedream v4 · 16:9 · 2K</p>
            </div>
          </div>
          <label htmlFor="image-prompt" className="sr-only">
            Image prompt
          </label>
          <textarea
            id="image-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Describe the image you want to create…"
            className="w-full resize-none rounded-xl border border-line bg-canvas p-4 text-sm outline-none placeholder:text-faint focus:border-focus"
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-faint">
              Requires HF_KEY or an encrypted Higgsfield credential.{' '}
              <Link href="/settings" className="text-accent underline-offset-2 hover:underline">
                Connect it in Settings
              </Link>
            </span>
            <div className="flex gap-2">
              {(state.kind === 'ready' || state.kind === 'failed') && (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-muted transition hover:border-line-strong hover:text-ink"
                >
                  <RotateCcw size={12} aria-hidden /> New
                </button>
              )}
              <button
                type="button"
                onClick={generate}
                disabled={!prompt.trim() || busy}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink disabled:opacity-40"
              >
                {state.kind === 'submitting' ? 'Submitting…' : state.kind === 'polling' ? 'Polling…' : 'Generate'}
                <ArrowUpRight size={14} aria-hidden />
              </button>
            </div>
          </div>

          {state.kind === 'failed' && (
            <p role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs leading-5 text-danger">
              {state.message}
              {state.requestId ? <span className="font-mono"> (request {state.requestId})</span> : null}
            </p>
          )}

          {state.kind === 'polling' && (
            <div className="mt-4 rounded-lg border border-focus/50 bg-overlay p-4 text-xs text-muted" role="status">
              Job submitted. Request ID: <code className="font-mono text-accent">{state.job.requestId}</code>
              <br />
              <span className="text-faint">
                Status: {state.status} — checking again every 5 seconds. This page never marks the
                job complete until Higgsfield does.
              </span>
            </div>
          )}

          {state.kind === 'ready' && (
            <div className="mt-4 rounded-lg border border-focus/50 bg-overlay p-4 text-xs text-muted" role="status">
              <p>
                Job complete. Request ID:{' '}
                <code className="font-mono text-accent">{state.job.requestId}</code>
              </p>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-canvas p-3 font-mono text-[10px] leading-4 text-faint">
                {JSON.stringify(state.result, null, 2)?.slice(0, 8000)}
              </pre>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
