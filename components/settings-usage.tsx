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
      </div>
    </section>
  );
}

export function SettingsUsage() {
  return <UsageSummary />;
}
