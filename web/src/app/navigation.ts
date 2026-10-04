/**
 * Navigation model.
 *
 * Mirrors the route architecture one-to-one: five primary destinations in the
 * mobile bottom bar, everything that needs a decision grouped under "Planning",
 * and the organisation tools under their own heading so the sidebar never turns
 * into a wall of equally-weighted links (§11/§12).
 *
 * `/` is a redirect to `/overview` for signed-in users (signed-out visitors
 * get the public landing page instead), so the active-state test never has to
 * special-case it.
 */
import {
  ArrowLeftRight,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CreditCard,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Repeat,
  Search,
  Settings,
  Tags,
  Target,
  Wallet,
  Bookmark,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar. */
  primary?: boolean;
  /** Match nested routes too (e.g. /accounts/:accountId). */
  matchNested?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard, primary: true },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight, primary: true, matchNested: true },
  { to: "/accounts", label: "Accounts", icon: Wallet, primary: true, matchNested: true },
  { to: "/budgets", label: "Budget", icon: PiggyBank, primary: true, matchNested: true },
  { to: "/statistics", label: "Statistics", icon: BarChart3, primary: true },
];

export const PLANNING_NAV: NavItem[] = [
  { to: "/goals", label: "Savings goals", icon: Target, matchNested: true },
  { to: "/debts", label: "Debts", icon: Landmark, matchNested: true },
  { to: "/credit-cards", label: "Credit cards", icon: CreditCard, matchNested: true },
  { to: "/recurring", label: "Recurring", icon: Repeat, matchNested: true },
  { to: "/installments", label: "Installments", icon: CalendarClock, matchNested: true },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
];

export const ORGANISE_NAV: NavItem[] = [
  { to: "/categories", label: "Categories", icon: Tags, matchNested: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/bookmarks", label: "Bookmarks", icon: Bookmark },
];

/** Everything reachable from the sidebar, in display order. */
export const SIDEBAR_NAV = [...PRIMARY_NAV, ...PLANNING_NAV, ...ORGANISE_NAV];

export const SETTINGS_ITEM: NavItem = {
  to: "/settings",
  label: "Settings",
  icon: Settings,
  matchNested: true,
};

/**
 * Paths that render full-bleed (no app shell): the auth flow and the MFA
 * challenge own the whole viewport.
 */
export const AUTH_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/mfa",
] as const;

/** True when `pathname` should render outside the shell. */
export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/** Active-state test that respects `matchNested`. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === "/overview") return pathname === "/overview";
  return item.matchNested ? pathname.startsWith(item.to) : pathname === item.to;
}
