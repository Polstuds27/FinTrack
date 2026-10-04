/**
 * Marketing landing page — the signed-out front door.
 *
 * Reachable at `/landing` (and offered from the login screen). It is the one
 * place that sells the product *and* hands the visitor the PWA install action
 * (`InstallSection`), so the app can be "downloaded" from any phone without an
 * app store. Everything else in the app assumes an authenticated user.
 */
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CloudOff,
  Globe,
  Lock,
  PiggyBank,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Tags,
  Target,
  Wallet,
} from "lucide-react";
import { InstallSection } from "./InstallSection";

interface Feature {
  icon: typeof Wallet;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: Wallet,
    title: "Every account in one place",
    body: "Cash, bank, e-wallet, savings, cards, loans and investments — grouped the way you think about money, with balances derived from the ledger.",
  },
  {
    icon: CloudOff,
    title: "Offline-first",
    body: "Record a transaction with no connection at all. Everything is saved on your device and syncs automatically when you're back online.",
  },
  {
    icon: RefreshCw,
    title: "Sync that heals itself",
    body: "UUID ids, idempotency keys, versioning and conflict detection — changes queue up and reconcile deterministically across devices.",
  },
  {
    icon: PiggyBank,
    title: "Budgets that warn early",
    body: "Per-category envelopes with alert thresholds, rollover-aware progress and spend forecasts — all computed locally, instantly.",
  },
  {
    icon: Target,
    title: "Goals, debts & recurring",
    body: "Savings goals with projections, debt payoff schedules, standing orders and installments — planned, tracked and reminded.",
  },
  {
    icon: BarChart3,
    title: "Reports without the wait",
    body: "Cash flow, net worth, category trends and calendars are computed from your own data on-device, so they work offline too.",
  },
];

const HOW_IT_WORKS = [
  {
    icon: Wallet,
    step: "Set up your accounts",
    body: "Add the accounts you actually use. Opening balances, credit limits, currencies.",
  },
  {
    icon: Tags,
    step: "Log it as it happens",
    body: "A tap to add income, expense or a transfer — online or not, on any device.",
  },
  {
    icon: BarChart3,
    step: "See where it goes",
    body: "Budgets, trends and forecasts update the moment you record something.",
  },
];

const FACTS = [
  { icon: CloudOff, label: "Works fully offline", detail: "Your data lives on your device first" },
  { icon: RefreshCw, label: "Syncs everywhere", detail: "Phone, tablet, laptop — one ledger" },
  { icon: Lock, label: "Private by design", detail: "No bank logins, no data selling" },
  { icon: Globe, label: "Multi-currency", detail: "Track money in any currency you hold" },
];

function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-contrast ${className}`}
    >
      <Wallet className="h-5 w-5" />
    </span>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      {/* Skip link: the page is long, keyboard users should reach the main content. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-raised"
      >
        Skip to content
      </a>

      {/* ---------------------------------------------------------- header */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-app items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/landing" className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <span className="text-sm font-semibold text-ink">FinTrack</span>
          </Link>

          <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
            <a href="#features" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-sunken hover:text-ink">
              Features
            </a>
            <a href="#how" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-sunken hover:text-ink">
              How it works
            </a>
            <a href="#install" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-sunken hover:text-ink">
              Get the app
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link to="/login" className="btn btn-ghost hidden sm:inline-flex">
              Sign in
            </Link>
            <Link to="/register" className="btn btn-primary">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* -------------------------------------------------------- hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 82% 18%, rgb(45 212 191 / 0.14), transparent 45%), radial-gradient(circle at 12% 78%, rgb(15 118 110 / 0.10), transparent 42%)",
            }}
          />
          <div className="relative mx-auto grid max-w-app gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-24">
            <div>
              <p className="badge badge-primary">
                <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                Offline-first personal finance
              </p>
              <h1 className="mt-4 text-display-lg text-ink">
                Your money, clearly.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                FinTrack brings every account, transaction, budget and goal
                into one calm ledger — and it keeps working when your
                connection doesn't. Install it on your phone like any other
                app, straight from this page.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to="/register"
                  className="btn btn-primary px-5 py-2.5 text-base"
                >
                  Start tracking free
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <Link to="/login" className="btn btn-secondary px-5 py-2.5 text-base">
                  Sign in
                </Link>
                <a href="#install" className="text-sm font-medium text-primary hover:underline">
                  Or install the app ↓
                </a>
              </div>

              <dl className="mt-10 grid max-w-lg grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-6 sm:grid-cols-4">
                {FACTS.map(({ icon: Icon, label, detail }) => (
                  <div key={label}>
                    <dt className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <Icon aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-xs leading-snug text-muted">{detail}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Phone preview: a static mock of the app shell, purely decorative. */}
            <div aria-hidden="true" className="relative mx-auto w-full max-w-[17rem]">
              <div className="rounded-[2rem] border-8 border-ink bg-ink p-1 shadow-overlay">
                <div className="overflow-hidden rounded-[1.4rem] bg-canvas">
                  <div className="flex items-center justify-between border-b border-line bg-surface px-3.5 py-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
                      <BrandMark className="h-5 w-5 rounded-md" />
                      FinTrack
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-income" />
                  </div>
                  <div className="space-y-2.5 p-3.5">
                    <div className="rounded-xl bg-primary p-3 text-primary-contrast">
                      <p className="text-[10px] uppercase opacity-70">Net worth</p>
                      <p className="tabular text-xl font-semibold">$12,480.50</p>
                      <p className="tabular text-[10px] opacity-70">+$342.18 this month</p>
                    </div>
                    <div className="rounded-xl bg-surface p-3 shadow-card">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-ink">Groceries budget</span>
                        <span className="tabular text-muted">$310 / $450</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                        <div className="h-full w-[69%] rounded-full bg-primary" />
                      </div>
                    </div>
                    {[
                      { name: "Coffee", cat: "Food & dining", amount: "-$4.50", tone: "text-expense" },
                      { name: "Salary", cat: "Income", amount: "+$3,200", tone: "text-income" },
                      { name: "Rent", cat: "Housing", amount: "-$980", tone: "text-expense" },
                    ].map((row) => (
                      <div
                        key={row.name}
                        className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 shadow-card"
                      >
                        <div>
                          <p className="text-[11px] font-medium text-ink">{row.name}</p>
                          <p className="text-[10px] text-muted">{row.cat}</p>
                        </div>
                        <span className={`tabular text-[11px] font-semibold ${row.tone}`}>
                          {row.amount}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-around rounded-xl bg-surface px-2 py-2 shadow-card">
                      {[Wallet, Repeat, BarChart3, CalendarDays].map((Icon, i) => (
                        <Icon
                          key={i}
                          className={`h-3.5 w-3.5 ${i === 0 ? "text-primary" : "text-faint"}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <span className="badge badge-synced absolute -right-2 -bottom-3 shadow-raised">
                <RefreshCw aria-hidden="true" className="h-3 w-3" />
                Synced
              </span>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- features */}
        <section id="features" className="scroll-mt-16 border-b border-line">
          <div className="mx-auto max-w-app px-4 py-14 sm:px-6 lg:py-20">
            <div className="max-w-2xl">
              <p className="label">What you get</p>
              <h2 className="mt-2 text-display text-ink">
                Everything a money manager should do — offline included
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
                Accounts, budgets, bills, goals and reports. Not a demo: the
                reporting engine runs on your device, so the numbers are there
                even when the network isn't.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="card p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-bg text-primary">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- how it works */}
        <section id="how" className="scroll-mt-16 border-b border-line bg-surface">
          <div className="mx-auto max-w-app px-4 py-14 sm:px-6 lg:py-20">
            <div className="max-w-2xl">
              <p className="label">How it works</p>
              <h2 className="mt-2 text-display text-ink">Three steps, then it runs itself</h2>
            </div>

            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {HOW_IT_WORKS.map(({ icon: Icon, step, body }, index) => (
                <li key={step} className="card relative p-5">
                  <span
                    aria-hidden="true"
                    className="absolute top-5 right-5 text-display-sm text-line-strong"
                  >
                    {index + 1}
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-bg text-primary">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-ink">{step}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------- install */}
        <InstallSection />

        {/* ---------------------------------------------------- final CTA */}
        <section className="border-t border-line">
          <div className="mx-auto flex max-w-app flex-col items-start gap-5 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between lg:py-16">
            <div>
              <h2 className="text-display-sm text-ink">Ready when you are</h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
                Create an account in under a minute — or install the app first
                and set it up on your phone.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/register" className="btn btn-primary px-5 py-2.5 text-base">
                Create an account
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <a href="#install" className="btn btn-secondary px-5 py-2.5 text-base">
                Get the app
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------------------------------------------------- footer */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-app flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <div>
              <p className="text-sm font-semibold text-ink">FinTrack</p>
              <p className="text-xs text-muted">Personal Money Manager — offline-first PWA</p>
            </div>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <a href="#features" className="text-muted hover:text-ink">
              Features
            </a>
            <a href="#install" className="text-muted hover:text-ink">
              Get the app
            </a>
            <Link to="/login" className="text-muted hover:text-ink">
              Sign in
            </Link>
            <Link to="/register" className="font-medium text-primary hover:underline">
              Get started
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
