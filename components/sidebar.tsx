'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  Boxes,
  Image as ImageIcon,
  LayoutGrid,
  MessageSquare,
  Puzzle,
  Settings2,
  Sparkles,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavEntry {
  label: string;
  icon: LucideIcon;
  href?: string;
  soon?: boolean;
}

export const workspaceNav: NavEntry[] = [
  { label: 'Chat', icon: MessageSquare, href: '/chat' },
  { label: 'Arena', icon: LayoutGrid, href: '/arena' },
  { label: 'Image Studio', icon: ImageIcon, href: '/image' },
  { label: 'Skills', icon: Puzzle, href: '/skills' },
  { label: 'Agents', icon: Bot, href: '/agents' },
  { label: 'Flows', icon: Workflow, href: '/flows' },
  { label: 'Files', icon: Boxes, soon: true },
];

export const controlNav: NavEntry[] = [
  { label: 'Usage', icon: Activity, href: '/settings' },
  { label: 'Models', icon: Boxes, href: '/models' },
  { label: 'Settings', icon: Settings2, href: '/settings' },
];

function NavLink({ entry }: { entry: NavEntry }) {
  const pathname = usePathname();
  const { label, icon: Icon, href, soon } = entry;
  const active = href !== undefined && pathname === href;
  const classes = `group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition ${
    active
      ? 'bg-overlay text-accent'
      : 'text-muted hover:bg-raised hover:text-ink'
  }`;
  const body = (
    <>
      <Icon size={16} strokeWidth={1.8} aria-hidden />
      <span className="flex-1">{label}</span>
      {soon && (
        <span className="text-[9px] font-medium uppercase tracking-wider text-faint">
          Soon
        </span>
      )}
    </>
  );
  if (!href) {
    return (
      <button
        type="button"
        disabled
        title={`${label} is coming soon`}
        aria-disabled="true"
        className={`${classes} cursor-not-allowed opacity-70`}
      >
        {body}
      </button>
    );
  }
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={classes}>
      {body}
    </Link>
  );
}

export function SidebarBody() {
  return (
    <div className="flex h-full flex-col px-3 py-5">
      <Link href="/" className="mb-9 flex items-center gap-2 px-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink">
          <Sparkles size={15} strokeWidth={2.5} aria-hidden />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">
          ScaleOS <span className="text-muted">AI</span>
        </span>
      </Link>

      <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
        Workspace
      </p>
      <nav className="space-y-1" aria-label="Workspace">
        {workspaceNav.map((entry) => (
          <NavLink key={entry.label} entry={entry} />
        ))}
      </nav>

      <p className="mb-3 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
        Control plane
      </p>
      <nav className="space-y-1" aria-label="Control plane">
        {controlNav.map((entry) => (
          <NavLink key={entry.label} entry={entry} />
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-line bg-panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] text-muted">Monthly usage</span>
          <span className="text-[11px] font-medium text-accent">$0.00</span>
        </div>
        <div
          className="h-1 overflow-hidden rounded-full bg-track"
          role="progressbar"
          aria-valuenow={4}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Monthly usage"
        >
          <div className="h-full w-[4%] rounded-full bg-accent" />
        </div>
        <p className="mt-2 text-[10px] leading-4 text-faint">
          Connect a provider to begin.{' '}
          <Link href="/settings" className="text-muted underline-offset-2 hover:underline">
            Open settings
          </Link>
        </p>
      </div>
    </div>
  );
}
