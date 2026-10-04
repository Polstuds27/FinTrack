import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Wallet } from "lucide-react";

/**
 * Auth layout.
 *
 * Sign-in is a focused single task, so the marketing split-screen is only shown
 * from `lg` up; below that the form owns the viewport.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,26rem)] xl:grid-cols-[1fr_minmax(0,30rem)]">
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-contrast lg:flex lg:flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 12%, rgba(255,255,255,0.35), transparent 42%), radial-gradient(circle at 82% 88%, rgba(255,255,255,0.25), transparent 46%)",
          }}
        />
        <Link to="/" className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
            <Wallet aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold">FinTrack</span>
        </Link>

        <div className="relative mt-auto max-w-md">
          <h2 className="text-display-sm text-white">Your money, clearly.</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Accounts, transactions, budgets, goals and reports in one place. Works offline, syncs
            to every device, and keeps your ledger — not your bank login — as the source of truth.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-white/20 pt-6">
            {[
              ["Offline-first", "Record anywhere"],
              ["Multi-currency", "Track it all"],
              ["Private", "Your data, yours"],
            ].map(([term, detail]) => (
              <div key={term}>
                <dt className="text-xs font-semibold text-white">{term}</dt>
                <dd className="mt-0.5 text-xs text-white/70">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      <main className="flex flex-col justify-center bg-canvas px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-contrast">
              <Wallet aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-ink">FinTrack</span>
          </Link>

          <h1 className="text-display-sm text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p>}

          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** Inline form error, kept distinct from field-level validation. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense"
    >
      {message}
    </p>
  );
}

/** Route guard used by the router for authenticated areas. */
export function useIsAuthRoute(): boolean {
  const { pathname } = useLocation();
  return pathname.startsWith("/login") || pathname.startsWith("/register");
}
