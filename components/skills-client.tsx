'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Puzzle, RotateCcw, Search } from 'lucide-react';
import { useSkills } from './use-skills';

export function SkillsClient() {
  const { skills, enabled, disabled, sources, loading, failed, reload, toggle } =
    useSkills();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter(
      (s) =>
        (source === 'all' || s.source === source) &&
        (!q ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)),
    );
  }, [skills, query, source]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 md:px-10">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-accent">
        Auto-detected
      </p>
      <h1 className="text-3xl font-medium tracking-tight">Skills on this machine</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
        ScaleOS scans your host skill directories on every load — nothing is
        uploaded. Enabled skills are offered to the model as chat context;
        disabled ones are hidden from it.
      </p>
      <p className="mt-2 text-xs text-faint" role="status">
        {loading
          ? 'Scanning host directories…'
          : `${skills.length} detected · ${enabled.length} enabled for chat`}
      </p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-panel px-3">
          <Search size={14} aria-hidden className="shrink-0 text-faint" />
          <label htmlFor="skills-search" className="sr-only">
            Search skills
          </label>
          <input
            id="skills-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or description…"
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Filter by source">
          <button
            type="button"
            onClick={() => setSource('all')}
            aria-pressed={source === 'all'}
            className={`rounded-full border px-3 py-2 text-[11px] font-medium transition ${
              source === 'all'
                ? 'border-focus bg-overlay text-ink'
                : 'border-line text-muted hover:border-line-strong'
            }`}
          >
            All
          </button>
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              aria-pressed={source === s}
              className={`rounded-full border px-3 py-2 text-[11px] font-medium transition ${
                source === s
                  ? 'border-focus bg-overlay text-ink'
                  : 'border-line text-muted hover:border-line-strong'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Scanning skills">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse-soft rounded-2xl border border-line bg-panel" />
          ))}
        </div>
      ) : failed ? (
        <div className="mt-4 rounded-2xl border border-line bg-panel p-6 text-center" role="alert">
          <p className="text-sm text-muted">Couldn&apos;t scan host skill directories.</p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-muted hover:border-line-strong hover:text-ink"
          >
            <RotateCcw size={12} aria-hidden /> Rescan
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-panel p-8 text-center" role="status">
          <Puzzle size={22} aria-hidden className="mx-auto text-faint" />
          <h2 className="mt-3 text-sm font-medium">
            {skills.length === 0 ? 'No skills found on this machine' : 'No skills match'}
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-faint">
            {skills.length === 0
              ? 'Install skills into ~/.agents/skills, ~/.claude/skills, or ~/.config/opencode/skills (or set SCALEOS_SKILLS_DIRS) and rescan.'
              : 'Try a different search term or source filter.'}
          </p>
          {skills.length === 0 && (
            <button
              type="button"
              onClick={reload}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-muted hover:border-line-strong hover:text-ink"
            >
              <RotateCcw size={12} aria-hidden /> Rescan
            </button>
          )}
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {visible.map((s) => {
            const on = !disabled.includes(s.id);
            return (
              <li
                key={s.id}
                className={`flex flex-col rounded-2xl border bg-panel p-5 transition ${
                  on ? 'border-line' : 'border-line opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-medium">{s.name}</h2>
                    <p className="mt-0.5 font-mono text-[10px] text-faint">
                      {s.source} · {s.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? 'Disable' : 'Enable'} skill ${s.name} for chat context`}
                    onClick={() => toggle(s.id)}
                    className={`relative h-[22px] w-10 shrink-0 rounded-full transition ${
                      on ? 'bg-accent' : 'bg-track'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${
                        on ? 'left-[22px] bg-accent-ink' : 'left-[3px] bg-white/70'
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted">
                  {s.description || 'No description provided.'}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`text-[10px] font-medium uppercase tracking-wider ${on ? 'text-accent' : 'text-faint'}`}>
                    {on ? 'In chat context' : 'Hidden from chat'}
                  </span>
                  <Link
                    href={`/chat?prompt=${encodeURIComponent(`Explain what the "${s.name}" skill does and when I should invoke it.`)}`}
                    className="flex items-center gap-1 text-[11px] text-muted transition hover:text-accent"
                  >
                    Ask about it <ArrowUpRight size={12} aria-hidden />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
