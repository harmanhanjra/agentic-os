export default function Loading() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-5"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg text-accent-ink">
        ✦
      </span>
      <div className="w-56 space-y-2.5">
        {[100, 72, 88].map((w) => (
          <div
            key={w}
            style={{ width: `${w}%` }}
            className="h-3 animate-pulse-soft rounded-full bg-raised"
          />
        ))}
      </div>
      <p className="text-xs text-faint">Loading your workspace…</p>
    </div>
  );
}
