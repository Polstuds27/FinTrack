/**
 * `/settings` — the index panel.
 *
 * A short map of what lives where, plus the handful of facts people actually
 * come here to check: which account is signed in, what's pending, and whether
 * two-factor is on.
 */
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, CircleAlert, ShieldCheck } from "lucide-react";
import { Badge, Card, DetailRow, Divider } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { useSync } from "../../sync/SyncContext";
import { usePreferences } from "./preferences";
import { Panel } from "./Panel";

export function OverviewSection() {
  const { profile, email, isAuthenticated } = useAuth();
  const { preferences } = usePreferences();
  const { status, pendingCount, conflicts, lastSyncedAt } = useSync();

  return (
    <div className="space-y-4">
      <Panel title="Account" description="Who is signed in on this device.">
        <dl className="space-y-0.5">
          <DetailRow label="Signed in">{isAuthenticated ? (profile?.email ?? email ?? "Yes") : "Not signed in"}</DetailRow>
          <DetailRow label="Name">
            {profile ? `${profile.first_name} ${profile.last_name}`.trim() || "—" : "—"}
          </DetailRow>
          <DetailRow label="Email verified">
            {profile?.is_verified ? "Yes" : isAuthenticated ? "Not yet" : "—"}
          </DetailRow>
          <DetailRow label="Two-factor">
            {profile?.mfa_enabled ? "Enabled" : isAuthenticated ? "Off" : "—"}
          </DetailRow>
        </dl>
        <Divider />
        <div className="flex flex-wrap gap-2 py-3">
          <SectionLink to="/settings/profile">Edit profile</SectionLink>
          <SectionLink to="/settings/security">Security</SectionLink>
        </div>
      </Panel>

      <Panel title="This device" description="Preferences stored locally, not on the server.">
        <dl className="space-y-0.5">
          <DetailRow label="Theme">{preferences.theme}</DetailRow>
          <DetailRow label="Base currency">{preferences.baseCurrency}</DetailRow>
          <DetailRow label="Month starts on">{preferences.monthStartDay}</DetailRow>
          <DetailRow label="Rows per page">{preferences.pageSize}</DetailRow>
        </dl>
        <Divider />
        <div className="flex flex-wrap gap-2 py-3">
          <SectionLink to="/settings/appearance">Appearance</SectionLink>
          <SectionLink to="/settings/financial">Financial</SectionLink>
          <SectionLink to="/settings/currency">Currency</SectionLink>
        </div>
      </Panel>

      <Panel title="Sync" description="How this device talks to the server.">
        <div className="flex flex-wrap items-center gap-3 py-1.5">
          <Badge tone={status === "error" ? "expense" : status === "offline" ? "warning" : "neutral"}>
            {status}
          </Badge>
          <span className="text-sm text-muted">{pendingCount} change(s) waiting</span>
          <span className="text-sm text-muted">
            {lastSyncedAt
              ? `last synced ${lastSyncedAt.toLocaleTimeString()}`
              : "not synced yet"}
          </span>
        </div>
        {conflicts.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-warning">
            <CircleAlert aria-hidden="true" className="h-4 w-4" />
            {conflicts.length} conflict(s) need a decision.
          </p>
        )}
        <Divider />
        <div className="flex flex-wrap gap-2 py-3">
          <SectionLink to="/settings/sync">Sync settings</SectionLink>
          <SectionLink to="/sync/conflicts">Resolve conflicts</SectionLink>
        </div>
      </Panel>

      <Panel title="Where things are" description="Every settings panel in one list.">
        <ul className="space-y-1">
          {[
            ["Profile", "Name, email, preferred currency", "/settings/profile"],
            ["Security", "Password and two-factor authentication", "/settings/security"],
            ["Appearance", "Theme and motion", "/settings/appearance"],
            ["Notifications", "Which alerts reach you", "/settings/notifications"],
            ["Currency", "Base currency and exchange rates", "/settings/currency"],
            ["Financial", "Month start and number formatting", "/settings/financial"],
            ["Sync", "Queue, conflicts, connection", "/settings/sync"],
            ["Data", "Export, import, clear this device", "/settings/data"],
            ["Devices", "Active sessions", "/settings/devices"],
            ["About", "Version and storage", "/settings/about"],
          ].map(([label, hint, to]) => (
            <li key={to}>
              <Link
                to={to}
                className="group flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-sunken"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{label}</span>
                  <span className="block truncate text-xs text-muted">{hint}</span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      {!profile?.mfa_enabled && isAuthenticated && (
        <Card className="flex items-start gap-3 p-4">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Two-factor is off</p>
            <p className="mt-0.5 text-xs text-muted">
              Turn it on from Security to require a rotating code when signing in on a new device.
            </p>
            <Link to="/settings/security" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Open security <ArrowRight aria-hidden="true" className="h-3 w-3" />
            </Link>
          </div>
        </Card>
      )}

      {profile?.is_verified && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <BadgeCheck aria-hidden="true" className="h-4 w-4 text-income" />
          Email verified.
        </p>
      )}
    </div>
  );
}

function SectionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </Link>
  );
}
