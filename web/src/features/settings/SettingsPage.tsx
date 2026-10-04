/**
 * Settings shell.
 *
 * `/settings` is a section index; every sub-route renders inside this layout so
 * the navigation and the back path stay put while the panel changes. On narrow
 * screens the section list becomes a horizontal scroller above the content.
 */
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  CircleDollarSign,
  Coins,
  Database,
  Info,
  Monitor,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  UserRound,
} from "lucide-react";
import { PageHeader } from "../../components/ui";

interface Section {
  to: string;
  label: string;
  hint: string;
  icon: typeof UserRound;
  end?: boolean;
}

const SECTIONS: Section[] = [
  { to: "/settings", label: "Overview", hint: "Where everything lives", icon: SlidersHorizontal, end: true },
  { to: "/settings/profile", label: "Profile", hint: "Name, email, currency", icon: UserRound },
  { to: "/settings/security", label: "Security", hint: "Password and two-factor", icon: ShieldCheck },
  { to: "/settings/appearance", label: "Appearance", hint: "Theme, density, motion", icon: Palette },
  { to: "/settings/notifications", label: "Notifications", hint: "What alerts you get", icon: Bell },
  { to: "/settings/currency", label: "Currency", hint: "Base currency and rates", icon: Coins },
  { to: "/settings/financial", label: "Financial", hint: "Month start, formatting", icon: CircleDollarSign },
  { to: "/settings/sync", label: "Sync", hint: "Queue, conflicts, status", icon: Monitor },
  { to: "/settings/data", label: "Data", hint: "Export, import, reset", icon: Database },
  { to: "/settings/devices", label: "Devices", hint: "Sessions on your account", icon: Smartphone },
  { to: "/settings/about", label: "About", hint: "Version and licences", icon: Info },
];

export function SettingsPage() {
  const { pathname } = useLocation();
  const current = SECTIONS.find((section) => section.to === pathname) ?? SECTIONS[0];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        subtitle={pathname === "/settings" ? "Everything you can change here" : current.hint}
      />

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="scroll-area -mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
        >
          {SECTIONS.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              end={section.end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors lg:w-full ${
                  isActive
                    ? "bg-primary-soft-bg text-primary"
                    : "text-ink-soft hover:bg-surface-sunken hover:text-ink"
                }`
              }
            >
              <section.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">{section.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
