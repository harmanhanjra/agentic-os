import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  Check,
  Image as ImageIcon,
  LayoutGrid,
  MessageSquare,
  Settings2,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { AppShell } from './app-shell';

const icons = {
  chat: MessageSquare,
  arena: LayoutGrid,
  image: ImageIcon,
  models: Boxes,
  settings: Settings2,
  flows: Workflow,
} as const;

export type WorkspaceKind = keyof typeof icons;

/** Honest per-surface guidance: what unlocks once a provider is connected. */
const KIND_DETAILS: Record<
  WorkspaceKind,
  { bullets: string[]; actionHref: string }
> = {
  chat: {
    bullets: [
      'Stream responses through your chosen model and provider',
      'Auto-routing picks a capable model when you leave it on Auto',
      'Every error carries a request ID for diagnostics',
    ],
    actionHref: '/settings',
  },
  arena: {
    bullets: [
      'Run one prompt across two to four registered models',
      'Inspect latency, provider, and usage metadata side by side',
      'Failed models report honestly instead of faking output',
    ],
    actionHref: '/settings',
  },
  image: {
    bullets: [
      'Generate with image-capable providers only',
      'Unsupported options stay out of the request payload',
      'Assets are stored per your configured storage driver',
    ],
    actionHref: '/settings',
  },
  models: {
    bullets: [
      'Filter the registry by capability, provider, or local status',
      'Availability, context window, and preferences in one view',
      'Sync discovers models from your connected providers',
    ],
    actionHref: '/settings',
  },
  settings: {
    bullets: [
      'Provider credentials are AES-256-GCM encrypted at rest',
      'Keys are masked in every UI response — never plaintext',
      'Custom URLs are validated to reduce SSRF risk',
    ],
    actionHref: '/settings',
  },
  flows: {
    bullets: [
      'Compose Input → Prompt → Model → Output pipelines',
      'The execution abstraction grows without rewrites',
      'Execution ships in the workflows slice behind flags',
    ],
    actionHref: '/settings',
  },
};

export function WorkspacePage({
  kind,
  title,
  eyebrow,
  description,
  action,
}: {
  kind: WorkspaceKind;
  title: string;
  eyebrow: string;
  description: string;
  action: string;
}) {
  const Icon = icons[kind];
  const details = KIND_DETAILS[kind];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-xs text-muted transition hover:text-accent"
        >
          <ArrowLeft size={15} aria-hidden /> Workspace
        </Link>

        <div className="mb-10 flex animate-rise-in flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-accent">
              <Icon size={14} aria-hidden /> {eyebrow}
            </p>
            <h1 className="text-3xl font-medium tracking-tight">{title}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              {description}
            </p>
          </div>
          <Link
            href={details.actionHref}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover"
          >
            {action} <ArrowUpRight size={14} aria-hidden />
          </Link>
        </div>

        <section
          aria-label={`${title} setup`}
          className="grid gap-4 lg:grid-cols-[1.2fr_1fr]"
        >
          <div className="rounded-2xl border border-line bg-panel p-6 md:p-8">
            <div className="mx-auto max-w-md text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-line-strong bg-overlay text-accent">
                <Icon size={22} aria-hidden />
              </div>
              <h2 className="text-sm font-medium">Connect your first provider</h2>
              <p className="mt-2 text-xs leading-5 text-faint">
                This workspace is ready for real provider configuration. Add a
                server-side API credential in Settings to start — ScaleOS will
                never fabricate a response or connection status.
              </p>
              <Link
                href="/settings"
                className="mt-6 inline-flex items-center gap-2 rounded-lg border border-focus px-4 py-2 text-xs font-medium text-accent transition hover:bg-overlay"
              >
                Open provider settings <ArrowUpRight size={14} aria-hidden />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-faint">
              <Sparkles size={13} aria-hidden /> What unlocks
            </h2>
            <ul className="mt-4 space-y-3">
              {details.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5 text-[13px] leading-5 text-muted">
                  <Check
                    size={14}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-accent"
                  />
                  {bullet}
                </li>
              ))}
            </ul>
            <ol className="mt-6 space-y-2 border-t border-line pt-5 text-xs text-faint">
              {['Add a credential', 'Sync models', 'Return here to work'].map(
                (step, i) => (
                  <li key={step} className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-muted">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ),
              )}
            </ol>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
