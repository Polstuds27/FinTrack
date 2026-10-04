export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-primary ${className}`}
    />
  );
}

/** Full-region loader for route transitions that have nothing to show yet. */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-primary" />
        <p className="text-sm">{label}…</p>
      </div>
    </div>
  );
}
