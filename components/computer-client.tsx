'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Globe2,
  LoaderCircle,
  Monitor,
  MousePointer2,
  Play,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

interface StatusPayload {
  browser: { configured: boolean; reachable: boolean; mode: string };
  computer: {\n    configured: boolean;\n    reachable: boolean;\n    healthy: boolean;\n    mode: string;\n    platform: string | null;\n    capabilities: string[];\n  };
  policy: Record<string, boolean>;
}

interface BrowserRun {
  runId: string;
  status: 'completed' | 'blocked' | 'max_actions' | 'failed';
  model: string;
  finalUrl: string;
  finalTitle: string;
  summary: string;
  latencyMs: number;
  screenshotDataUrl?: string;
  actions: Array<{
    index: number;
    action: { type: string; [key: string]: unknown };
    status: string;
    message: string;
    url?: string;
    title?: string;
  }>;
  extracted: string[];
}

interface ComputerRun {
  status: string;
  summary?: string;
  screenshotDataUrl?: string;
  actions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function ReadyBadge({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ' +
        (ready
          ? 'border-focus/60 text-accent'
          : 'border-line text-faint')
      }
    >
      {ready ? <CheckCircle2 size={11} aria-hidden /> : <TriangleAlert size={11} aria-hidden />}
      {label}
    </span>
  );
}

export function ComputerClient() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [browserObjective, setBrowserObjective] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [browserActions, setBrowserActions] = useState(10);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [browserRun, setBrowserRun] = useState<BrowserRun | null>(null);

  const [computerObjective, setComputerObjective] = useState('');
  const [computerActions, setComputerActions] = useState(15);
  const [computerBusy, setComputerBusy] = useState(false);
  const [computerError, setComputerError] = useState<string | null>(null);
  const [computerRun, setComputerRun] = useState<ComputerRun | null>(null);

  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const response = await fetch('/api/computer/status', { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      setStatus(response.ok ? body?.data ?? null : null);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const runBrowser = async () => {
    if (!browserObjective.trim() || browserBusy) return;
    setBrowserBusy(true);
    setBrowserError(null);
    setBrowserRun(null);
    try {
      const response = await fetch('/api/computer/browser/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          objective: browserObjective.trim(),
          ...(startUrl.trim() ? { startUrl: startUrl.trim() } : {}),
          maxActions: browserActions,
          includeScreenshot: true,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setBrowserError(
          (body?.error?.message ?? 'Browser run failed.') +
            (body?.requestId ? ' Request: ' + body.requestId : ''),
        );
        return;
      }
      setBrowserRun(body.data);
    } catch {
      setBrowserError('Network error while running Browser Use.');
    } finally {
      setBrowserBusy(false);
    }
  };

  const runComputer = async () => {
    if (!computerObjective.trim() || computerBusy) return;
    setComputerBusy(true);
    setComputerError(null);
    setComputerRun(null);
    try {
      const response = await fetch('/api/computer/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          objective: computerObjective.trim(),
          maxActions: computerActions,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setComputerError(
          (body?.error?.message ?? 'Computer run failed.') +
            (body?.requestId ? ' Request: ' + body.requestId : ''),
        );
        return;
      }
      setComputerRun(body.data);
    } catch {
      setComputerError('Network error while running Computer Use.');
    } finally {
      setComputerBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-10 md:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-accent">
            <MousePointer2 size={14} aria-hidden /> V0.3 execution layer
          </p>
          <h1 className="text-3xl font-medium tracking-tight">Computer + Browser Use</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            ScaleOS can operate a real browser through Chrome DevTools Protocol and delegate
            desktop tasks to a permissioned computer worker. Browser runs are DOM-first for
            speed and token efficiency, with screenshots used as evidence instead of the
            primary control surface.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={statusLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-xs text-muted hover:border-line-strong hover:text-ink disabled:opacity-50"
        >
          <RefreshCcw size={13} className={statusLoading ? 'animate-spin' : ''} aria-hidden />
          Refresh status
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <ReadyBadge
          ready={Boolean(status?.browser.reachable)}
          label={
            status?.browser.reachable
              ? 'Browser worker ready'
              : status?.browser.configured
                ? 'Browser configured · unreachable'
                : 'Browser not configured'
          }
        />
        <ReadyBadge
          ready={Boolean(status?.computer.reachable && status?.computer.healthy)}
          label={
            status?.computer.reachable && status?.computer.healthy
              ? `Desktop ready · ${status.computer.platform ?? status.computer.mode}`
              : status?.computer.configured
                ? 'Desktop configured · unreachable'
                : 'Desktop worker not configured'
          }
        />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[10px] text-faint">
          <ShieldCheck size={11} aria-hidden /> Consequential actions blocked
        </span>
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-panel p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                <Globe2 size={14} aria-hidden /> Browser Use
              </p>
              <h2 className="mt-2 text-lg font-medium">Autonomous web operator</h2>
            </div>
            <span className="font-mono text-[10px] text-faint">CDP · DOM-first</span>
          </div>

          <label htmlFor="browser-url" className="mt-5 block text-xs font-medium text-muted">
            Start URL <span className="font-normal text-faint">(optional)</span>
          </label>
          <input
            id="browser-url"
            value={startUrl}
            onChange={(event) => setStartUrl(event.target.value)}
            placeholder="https://example.com"
            inputMode="url"
            className="mt-1.5 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-focus"
          />

          <label htmlFor="browser-objective" className="mt-4 block text-xs font-medium text-muted">
            Objective
          </label>
          <textarea
            id="browser-objective"
            value={browserObjective}
            onChange={(event) => setBrowserObjective(event.target.value)}
            placeholder="Research the pricing page, compare the plans, and extract the important differences."
            className="mt-1.5 min-h-28 w-full resize-y rounded-xl border border-line bg-canvas px-3 py-3 text-sm leading-6 outline-none placeholder:text-faint focus:border-focus"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              Action budget
              <select
                value={browserActions}
                onChange={(event) => setBrowserActions(Number(event.target.value))}
                className="rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs outline-none"
              >
                {[5, 10, 15, 20].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={runBrowser}
              disabled={
                browserBusy ||
                browserObjective.trim().length < 3 ||
                !status?.browser.reachable
              }
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
            >
              {browserBusy ? (
                <LoaderCircle size={14} className="animate-spin" aria-hidden />
              ) : (
                <Play size={14} aria-hidden />
              )}
              {browserBusy ? 'Operating browser…' : 'Run browser agent'}
            </button>
          </div>

          {browserError && (
            <p className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs leading-5 text-danger" role="alert">
              {browserError}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-panel p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                <Monitor size={14} aria-hidden /> Computer Use
              </p>
              <h2 className="mt-2 text-lg font-medium">Full visual desktop agent</h2>
            </div>
            <span className="font-mono text-[10px] text-faint">vision · mouse · keyboard</span>
          </div>

          <p className="mt-4 text-xs leading-5 text-faint">
            The agent sees the current screen, chooses precise coordinates/actions, controls the
            mouse and keyboard, captures a fresh screen, and repeats. Financial, destructive,
            credential, file-transfer, and external-communication actions remain approval-gated.
          </p>

          <label htmlFor="computer-objective" className="mt-5 block text-xs font-medium text-muted">
            Objective
          </label>
          <textarea
            id="computer-objective"
            value={computerObjective}
            onChange={(event) => setComputerObjective(event.target.value)}
            placeholder="Open the Start menu, launch Calculator, calculate 42 × 19, and report the visible result."
            className="mt-1.5 min-h-28 w-full resize-y rounded-xl border border-line bg-canvas px-3 py-3 text-sm leading-6 outline-none placeholder:text-faint focus:border-focus"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              Action budget
              <select
                value={computerActions}
                onChange={(event) => setComputerActions(Number(event.target.value))}
                className="rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs outline-none"
              >
                {[5, 10, 15, 20, 30].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={runComputer}
              disabled={
                computerBusy ||
                computerObjective.trim().length < 3 ||
                !status?.computer.reachable
              }
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
            >
              {computerBusy ? (
                <LoaderCircle size={14} className="animate-spin" aria-hidden />
              ) : (
                <Play size={14} aria-hidden />
              )}
              {computerBusy ? 'Operating computer…' : 'Run computer agent'}
            </button>
          </div>

          {computerError && (
            <p className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs leading-5 text-danger" role="alert">
              {computerError}
            </p>
          )}
          {computerRun && (
            <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-accent">{computerRun.status}</p>
                <span className="font-mono text-[10px] text-faint">
                  {[computerRun.model, computerRun.activeWindow, computerRun.latencyMs ? `${computerRun.latencyMs}ms` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {computerRun.summary && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                  {computerRun.summary}
                </p>
              )}
              {computerRun.actions && computerRun.actions.length > 0 && (
                <ol className="mt-4 space-y-2">
                  {computerRun.actions.map((entry, index) => (
                    <li key={index} className="rounded-lg border border-line px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px] uppercase text-accent">
                          {index + 1}. {entry.action?.type ?? 'action'}
                        </span>
                        <span className="text-[10px] text-faint">{entry.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {entry.action?.target ?? entry.message ?? 'Desktop action'}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
              {computerRun.screenshotDataUrl && (
                <img
                  src={computerRun.screenshotDataUrl}
                  alt="Final computer-use screenshot"
                  className="mt-4 w-full rounded-lg border border-line"
                />
              )}
            </div>
          )}
        </section>
      </div>

      {browserRun && (
        <section className="mt-6 rounded-2xl border border-line bg-panel p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                Browser run result
              </p>
              <h2 className="mt-2 text-lg font-medium">{browserRun.finalTitle || browserRun.finalUrl}</h2>
              <p className="mt-1 break-all font-mono text-[10px] text-faint">{browserRun.finalUrl}</p>
            </div>
            <div className="text-right font-mono text-[10px] text-faint">
              <p>{browserRun.status}</p>
              <p>{browserRun.model}</p>
              <p>{browserRun.latencyMs}ms</p>
            </div>
          </div>

          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">{browserRun.summary}</p>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">Action trace</h3>
              <ol className="mt-3 space-y-2">
                {browserRun.actions.map((entry) => (
                  <li key={entry.index} className="rounded-xl border border-line bg-canvas p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase text-accent">
                        {entry.index + 1}. {entry.action.type}
                      </span>
                      <span className="text-[10px] text-faint">{entry.status}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted">{entry.message}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              {browserRun.screenshotDataUrl ? (
                <img
                  src={browserRun.screenshotDataUrl}
                  alt="Final Browser Use screenshot"
                  className="w-full rounded-xl border border-line"
                />
              ) : (
                <div className="flex min-h-48 items-center justify-center rounded-xl border border-line bg-canvas text-xs text-faint">
                  No screenshot requested
                </div>
              )}
              {browserRun.extracted.length > 0 && (
                <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">Extracted content</h3>
                  <p className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-muted">
                    {browserRun.extracted.join('\n\n').slice(0, 20000)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
