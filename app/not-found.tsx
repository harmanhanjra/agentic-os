import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 text-center text-ink">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line-strong bg-panel text-accent">
        <Compass size={22} aria-hidden />
      </span>
      <p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-accent">
        404
      </p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight">
        This corner of the workspace doesn&apos;t exist.
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        The link may be mistyped, or the surface hasn&apos;t been built yet.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover"
      >
        <ArrowLeft size={14} aria-hidden /> Back to workspace
      </Link>
    </main>
  );
}
