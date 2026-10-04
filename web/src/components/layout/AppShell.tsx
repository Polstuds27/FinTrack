import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  CircleAlert,
  LogOut,
  Menu,
  Plus,
  Settings,
  Wallet,
  X,
} from "lucide-react";
import { isActive, ORGANISE_NAV, PLANNING_NAV, PRIMARY_NAV, SETTINGS_ITEM, type NavItem } from "../../app/navigation";
import { useAuth } from "../../auth/AuthContext";
import { useLocalData } from "../../features/analytics/useLocalData";
import { portfolio } from "../../features/analytics/engine";
import { formatMoney } from "../../design/format";
import { useSync } from "../../sync/SyncContext";
import { Avatar } from "../ui/Primitives";
import { Dropdown } from "../ui/Controls";
import { IconButton } from "../ui/Button";
import { SyncIndicator } from "./SyncIndicator";

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1 py-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-contrast shadow-card"
      >
        <Wallet className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">FinTrack</span>
        <span className="block truncate text-xs text-muted">Personal Money Manager</span>
      </span>
    </div>
  );
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(item, pathname);
        const Icon = item.icon;
        return (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={!item.matchNested}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`nav-link ${active ? "nav-link-active" : ""}`}
            >
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-semibold tracking-wider text-faint uppercase">
      {children}
    </p>
  );
}

function NetWorthCard() {
  const { lookups, ready } = useLocalData();
  const totals = portfolio(lookups);
  return (
    <div className="card-flat px-3 py-3">
      <p className="text-[11px] font-semibold tracking-wider text-faint uppercase">Net worth</p>
      <p className="tabular mt-0.5 truncate text-title font-semibold text-ink">
        {ready ? formatMoney(totals.netWorth, lookups.dataset.baseCurrency) : "—"}
      </p>
      <p className="tabular mt-1 text-xs text-muted">
        {ready ? (
          <>
            {formatMoney(totals.assets, lookups.dataset.baseCurrency)} assets
            {totals.liabilities !== 0 && ` · ${formatMoney(totals.liabilities, lookups.dataset.baseCurrency)} debt`}
          </>
        ) : (
          "Loading…"
        )}
      </p>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto px-3 pb-4 pt-3">
      <NetWorthCard />
      <div className="pt-3">
        <NavList items={PRIMARY_NAV} onNavigate={onNavigate} />
      </div>
      <SectionLabel>Planning</SectionLabel>
      <NavList items={PLANNING_NAV} onNavigate={onNavigate} />
      <SectionLabel>Organise</SectionLabel>
      <NavList items={ORGANISE_NAV} onNavigate={onNavigate} />
      <div className="pt-4">
        <NavLink
          to={SETTINGS_ITEM.to}
          onClick={onNavigate}
          className={({ isActive: on }) => `nav-link ${on ? "nav-link-active" : ""}`}
        >
          <Settings aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span>Settings</span>
        </NavLink>
      </div>
    </div>
  );
}

function UserMenu() {
  const { email, logout } = useAuth();
  const { conflicts } = useSync();
  const navigate = useNavigate();
  return (
    <Dropdown
      label="Account menu"
      trigger={<Avatar name={email ?? "You"} size={30} />}
      items={[
        {
          id: "settings",
          label: "Settings",
          icon: <Settings aria-hidden="true" className="h-4 w-4" />,
          onSelect: () => navigate("/settings"),
        },
        {
          id: "conflicts",
          label: conflicts.length > 0 ? `Conflicts (${conflicts.length})` : "Conflicts",
          icon: <CircleAlert aria-hidden="true" className="h-4 w-4" />,
          onSelect: () => navigate("/sync/conflicts"),
        },
        {
          id: "logout",
          label: "Sign out",
          tone: "danger",
          icon: <LogOut aria-hidden="true" className="h-4 w-4" />,
          onSelect: () => {
            void logout();
            navigate("/login");
          },
        },
      ]}
    />
  );
}

/** Desktop sidebar. Hidden below `lg`, where the bottom bar takes over. */
function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:flex lg:flex-col">
      <div className="flex h-14 items-center border-b border-line px-4">
        <Brand />
      </div>
      <SidebarBody />
    </aside>
  );
}

function BottomNav({ onQuickAdd }: { onQuickAdd: () => void }) {
  const { pathname } = useLocation();
  // Four highest-frequency destinations either side of the central quick-add;
  // everything else lives in the drawer, reachable with one tap on `Menu`.
  const items = PRIMARY_NAV.filter((item) => item.primary).slice(0, 4);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-stretch">
        {items.slice(0, 2).map((item) => (
          <BottomLink key={item.to} item={item} active={isActive(item, pathname)} />
        ))}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onQuickAdd}
            aria-label="Add transaction"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-contrast shadow-raised transition-transform active:scale-95"
          >
            <Plus aria-hidden="true" className="h-7 w-7" />
          </button>
        </div>
        {items.slice(2, 4).map((item) => (
          <BottomLink key={item.to} item={item} active={isActive(item, pathname)} />
        ))}
      </div>
    </nav>
  );
}

function BottomLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={!item.matchNested}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors ${
        active ? "text-primary" : "text-muted"
      }`}
    >
      <Icon aria-hidden="true" className="h-5 w-5" />
      <span className="max-w-full truncate">{item.label}</span>
    </NavLink>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 animate-fade-in bg-overlay/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-y-0 left-0 flex w-72 animate-rise flex-col border-r border-line bg-surface shadow-overlay">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <Brand />
          <IconButton label="Close menu" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarBody onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}

export interface AppShellProps {
  children: ReactNode;
  onQuickAdd: () => void;
}

/**
 * Application shell: persistent sidebar on desktop, bottom navigation on mobile,
 * and a header that carries only contextual actions. Every screen renders inside
 * it so the chrome is defined once.
 */
export function AppShell({ children, onQuickAdd }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const { conflicts } = useSync();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5">
          <IconButton label="Open menu" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
            <Menu className="h-5 w-5" />
          </IconButton>
          <div className="lg:hidden">
            <span className="text-sm font-semibold text-ink">FinTrack</span>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <SyncIndicator />
            <NavLink to="/notifications" aria-label="Notifications" className="icon-btn">
              <Bell className="h-5 w-5" />
            </NavLink>
            {conflicts.length > 0 && (
              <NavLink
                to="/sync/conflicts"
                aria-label={`${conflicts.length} sync conflicts need attention`}
                className="icon-btn text-expense"
              >
                <CircleAlert aria-hidden="true" className="h-5 w-5" />
              </NavLink>
            )}
            <div className="ml-1 hidden sm:block">
              <UserMenu />
            </div>
          </div>
        </header>

        <main
          id="main"
          className="min-w-0 flex-1 px-3 pt-4 sm:px-5 lg:px-6 lg:pb-8"
          style={{ paddingBottom: "calc(6.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto w-full max-w-app">{children}</div>
        </main>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <BottomNav onQuickAdd={onQuickAdd} />
    </div>
  );
}
