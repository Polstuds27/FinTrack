/**
 * `/settings/about` — version, storage and what this build is made of.
 */
import { useEffect, useState } from "react";
import { ExternalLink, HardDrive, Info } from "lucide-react";
import { Badge, Card, DetailRow, Divider, LinkButton } from "../../components/ui";
import { formatBytes } from "../../design/format";
import { Panel } from "./Panel";

const TECH = [
  ["Frontend", "React + TypeScript + Vite"],
  ["Local database", "Dexie / IndexedDB"],
  ["Backend", "Django + Django REST Framework"],
  ["Database", "Neon PostgreSQL"],
  ["Icons", "Lucide React"],
  ["Charts", "Hand-rolled SVG on design tokens"],
];

export function AboutSection() {
  const [usage, setUsage] = useState<number | null>(null);
  const [quota, setQuota] = useState<number | null>(null);

  useEffect(() => {
    if (!navigator.storage?.estimate) return;
    void navigator.storage.estimate().then((estimate) => {
      setUsage(estimate.usage ?? null);
      setQuota(estimate.quota ?? null);
    });
  }, []);

  const version =
    (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "development";

  return (
    <div className="space-y-4">
      <Panel title="FinTrack" description="Personal money manager — offline first.">
        <dl className="space-y-0.5">
          <DetailRow label="Version">{version}</DetailRow>
          <DetailRow label="Build">{import.meta.env.MODE}</DetailRow>
          <DetailRow label="Storage">
            {usage !== null ? `${formatBytes(usage)} used` : "Not reported"}
          </DetailRow>
          <DetailRow label="Quota">
            {quota !== null ? formatBytes(quota) : "Not reported"}
          </DetailRow>
        </dl>
        <Divider />
        <div className="flex flex-wrap gap-2 py-2">
          <LinkButton to="/settings/data">Manage data</LinkButton>
          <LinkButton to="/sync/conflicts">Sync conflicts</LinkButton>
        </div>
      </Panel>

      <Panel title="How it's built">
        <dl className="space-y-0.5">
          {TECH.map(([label, value]) => (
            <DetailRow key={label} label={label}>
              {value}
            </DetailRow>
          ))}
        </dl>
      </Panel>

      <Panel title="Offline behaviour">
        <p className="text-sm text-muted">
          Every screen reads from this device's database first. Reports, budgets, the calendar and
          search are computed locally, so they work with no connection at all. Changes you make
          offline queue up and are pushed the next time you're online — nothing is lost, and
          nothing is silently overwritten.
        </p>
      </Panel>

      <Card className="flex items-start gap-3 p-4">
        <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Your data stays yours</p>
          <p className="mt-0.5 text-xs text-muted">
            No analytics, no advertising identifiers, no third-party trackers. Export everything at
            any time from Data settings.
          </p>
          <a
            href="https://lucide.dev"
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Icon set: Lucide <ExternalLink aria-hidden="true" className="h-3 w-3" />
          </a>
        </div>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <HardDrive aria-hidden="true" className="h-3.5 w-3.5" />
        Storage figures come from the browser's storage estimate and may be approximate.
        <Badge tone="neutral">{import.meta.env.MODE}</Badge>
      </p>
    </div>
  );
}
