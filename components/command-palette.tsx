'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Boxes,
  Command,
  Image as ImageIcon,
  LayoutGrid,
  MessageSquare,
  Puzzle,
  Settings2,
  Workflow,
} from 'lucide-react';

interface CommandItem {
  label: string;
  hint: string;
  href: string;
  icon: typeof MessageSquare;
}

const COMMANDS: CommandItem[] = [
  { label: 'New conversation', hint: 'Chat', href: '/chat', icon: MessageSquare },
  { label: 'Open Agents', hint: 'Plan & execute', href: '/agents', icon: Bot },
  { label: 'Open Model Arena', hint: 'Compare', href: '/arena', icon: LayoutGrid },
  { label: 'Open Image Studio', hint: 'Generate', href: '/image', icon: ImageIcon },
  { label: 'Open Skills', hint: 'Detected', href: '/skills', icon: Puzzle },
  { label: 'Open Flows', hint: 'Automate', href: '/flows', icon: Workflow },
  { label: 'Open Model Registry', hint: 'Models', href: '/models', icon: Boxes },
  { label: 'Open Settings', hint: 'Providers', href: '/settings', icon: Settings2 },
  { label: 'Back to Workspace home', hint: 'Home', href: '/', icon: Command },
];

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open ]);

  useEffect(() => setCursor(0), [query]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (results.length ? (c + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) =>
        results.length ? (c - 1 + results.length) % results.length : 0,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[cursor];
      if (item) go(item.href);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-black/60 px-4 pt-[14vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg animate-rise-in overflow-hidden rounded-xl border border-line-strong bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Command size={16} className="shrink-0 text-accent" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={
              results[cursor] ? `palette-${cursor}` : undefined
            }
            aria-label="Search commands"
            placeholder="Search commands…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-faint">
            esc
          </kbd>
        </div>
        <ul id="palette-listbox" role="listbox" className="max-h-72 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-faint" role="status">
              No commands match “{query}”.
            </li>
          )}
          {results.map((item, i) => (
            <li key={item.href} role="option" aria-selected={i === cursor} id={`palette-${i}`}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(item.href)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  i === cursor ? 'bg-overlay text-ink' : 'text-muted'
                }`}
              >
                <item.icon size={15} className="shrink-0 text-faint" aria-hidden />
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-faint">
                  {item.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
