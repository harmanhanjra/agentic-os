'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, Moon, Search, Sparkles, Sun, X } from 'lucide-react';
import { CommandPalette } from './command-palette';
import { SidebarBody } from './sidebar';
import { useTheme } from './theme';

/**
 * Shared workspace shell: desktop sidebar, mobile drawer, header with
 * search + theme toggle, and a functional ⌘K command palette.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="hidden w-56 shrink-0 border-r border-line bg-panel md:block">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <SidebarBody />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/60"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-64 animate-rise-in overflow-y-auto border-r border-line bg-panel">
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <SidebarBody />
          </div>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-2 border-b border-line px-4 md:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink md:hidden"
          >
            <Menu size={18} aria-hidden />
          </button>
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink">
              <Sparkles size={15} aria-hidden />
            </span>
            <span className="text-sm font-semibold">ScaleOS</span>
          </Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden h-9 w-64 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-left text-xs text-faint transition hover:border-line-strong hover:text-muted md:flex"
          >
            <Search size={14} aria-hidden />
            <span>Search workspace</span>
            <kbd className="ml-auto rounded border border-line px-1.5 py-0.5 text-[10px]">
              ⌘ K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search workspace"
            className="ml-auto rounded-lg p-2 text-muted hover:bg-raised hover:text-ink md:hidden"
          >
            <Search size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="rounded-lg p-2 text-muted transition hover:bg-raised hover:text-ink"
          >
            {theme === 'dark' ? (
              <Sun size={16} aria-hidden />
            ) : (
              <Moon size={16} aria-hidden />
            )}
          </button>
          <button
            type="button"
            aria-label="Account menu"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-overlay text-xs font-medium text-accent"
          >
            AR
          </button>
        </header>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </section>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
