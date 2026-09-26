'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';

interface StatusProvider {
  id: string;
  displayName: string;
  local: boolean;
  configured: boolean;
  source: string;
  modelCount: number;
  hint: string | null;
}

function UsageSummary() {
  const [providers, setProviders] = useState<StatusProvider[]>([]);
  const [modelCount, setModelCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [meter, setMeter] = useState<{
    totals: { runs: number; errors: number; avgLatencyMs: number | null };
    byKind: Record<string, { runs: number; errors: number; avgLatencyMs: number | null }>;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!alive) return;
        if (body?.data) {
          setProviders(body.data.providers ?? []);
          setModelCount(body.data.models?.length ?? 0);
        }
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    fetch('/api/usage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (alive && body?.data) setMeter(body.data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const connected = providers.filter((p) => p.configured);
  const readyModels = providers.reduce(
    (sum, p) => sum + (p.configured ? p.modelCount : 0),
    0,
  );

  return (
    <section
      id="usage"
      aria-label="Usage overview"
      className="mx-auto w-full max-w-5xl scroll-mt-20 px-5 pt-10 md:px-10"
    >
      <div className="rounded-2xl border border-line bg-panel p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Activity size={15} aria-hidden className="text-accent" /> Usage overview
        </h2>
        {!loaded ? (
          <p className="mt-2 text-xs text-faint" role="status">
            Loading workspace status…
          </p>
        ) : connected.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-muted">
            No router connected yet — add a provider key below to unlock {modelCount} registered
            models.{' '}
            <Link href="/models" className="text-accent underline-offset-2 hover:underline">
              Browse the registry
            </Link>
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span role="status">
              {connected.length} of {providers.length} providers connected
            </span>
            <span role="status">
              {readyModels} of {modelCount} models ready
            </span>
            <span className="text-faint">{connected.map((p) => p.displayName).join(' · ')}</span>
          </div>
        )}
        {meter && meter.totals.runs > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-xs text-muted" role="status">
              {meter.totals.runs} workspace runs
              {meter.totals.errors > 0 ? ` · ${meter.totals.errors} failed` : ' · all succeeded'}
              {typeof meter.totals.avgLatencyMs === 'number'
                ? ` · avg ${(meter.totals.avgLatencyMs / 1000).toFixed(1)}s`
                : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(meter.byKind).map(([kind, stats]) => (
                <span
                  key={kind}
                  className="rounded-full border border-line bg-canvas px-2.5 py-1 font-mono text-[10px] text-faint"
                  title={`${stats.errors} failed`}
                >
                  {kind} · {stats.runs}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function SettingsUsage() {
  return <UsageSummary />;
}
