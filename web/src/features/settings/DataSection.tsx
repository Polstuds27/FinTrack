/**
 * `/settings/data` — export, import, and clearing this device.
 *
 * CSV export/import go to the server (they need the full account, not just the
 * rows cached here); the JSON snapshot and the reset operate purely on the
 * local IndexedDB copy.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, Download, FileDown, Trash2 } from "lucide-react";
import { ApiError, apiFetch, API_BASE_URL, getAccessToken } from "../../api/client";
import { Alert, Button, Card, ConfirmOverlay, useToast } from "../../components/ui";
import { formatBytes } from "../../design/format";
import { db, clearAllData } from "../../db";
import { Panel } from "./Panel";

interface ImportResult {
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: string[];
  dry_run?: boolean;
  [key: string]: unknown;
}

export function DataSection() {
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCsv, setPendingCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [localSize, setLocalSize] = useState<number | null>(null);

  async function measure() {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      setLocalSize(estimate.usage ?? null);
    }
  }

  async function exportCsv() {
    setBusy("export");
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/transactions/export/`, {
        headers: {
          Authorization: `Bearer ${getAccessToken() ?? ""}`,
        },
      });
      if (!res.ok) throw new ApiError(res.status, "Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fintrack-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.push({ tone: "success", title: "CSV exported" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't export right now.");
    } finally {
      setBusy(null);
    }
  }

  async function exportSnapshot() {
    setBusy("snapshot");
    try {
      const snapshot = {
        exported_at: new Date().toISOString(),
        accounts: await db.accounts.toArray(),
        categories: await db.categories.toArray(),
        tags: await db.tags.toArray(),
        transactions: await db.transactions.toArray(),
        budgets: await db.budgets.toArray(),
        recurring: await db.recurring.toArray(),
        installments: await db.installments.toArray(),
        debts: await db.debts.toArray(),
        savings_goals: await db.savings_goals.toArray(),
        exchange_rates: await db.exchange_rates.toArray(),
        notifications: await db.notifications.toArray(),
      };
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fintrack-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.push({ tone: "success", title: "Snapshot saved" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the snapshot.");
    } finally {
      setBusy(null);
    }
  }

  async function readFile(file: File) {
    const text = await file.text();
    setPendingCsv(text);
    setPreview(null);
    setBusy("dry-run");
    setError(null);
    try {
      const result = await apiFetch<ImportResult>("/transactions/import_csv/", {
        method: "POST",
        body: JSON.stringify({ csv: text, dry_run: true }),
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read that file.");
      setPendingCsv(null);
    } finally {
      setBusy(null);
    }
  }

  async function commitImport() {
    if (!pendingCsv) return;
    setBusy("import");
    setError(null);
    try {
      const result = await apiFetch<ImportResult>("/transactions/import_csv/", {
        method: "POST",
        body: JSON.stringify({ csv: pendingCsv, dry_run: false }),
      });
      toast.push({
        tone: "success",
        title: "Import finished",
        description: `${result.created ?? 0} added · ${result.updated ?? 0} updated · ${result.skipped ?? 0} skipped`,
      });
      setPendingCsv(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed.");
    } finally {
      setBusy(null);
    }
  }

  async function resetLocal() {
    setBusy("reset");
    try {
      await clearAllData();
      toast.push({
        tone: "success",
        title: "Local data cleared",
        description: "Signing in again downloads a fresh copy from the server.",
      });
      navigate("/overview");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't clear local data",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
      setConfirmReset(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Export"
        description="Take your data with you — CSV for spreadsheets, JSON for a full local snapshot."
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<FileDown className="h-4 w-4" />}
              loading={busy === "export"}
              onClick={() => void exportCsv()}
            >
              CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              loading={busy === "snapshot"}
              onClick={() => void exportSnapshot()}
            >
              JSON snapshot
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          The CSV is produced by the server from your full transaction history. The JSON snapshot
          is whatever is cached on this device right now — useful as a backup before clearing it.
        </p>
        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense">
            {error}
          </p>
        )}
      </Panel>

      <Panel
        title="Import CSV"
        description="Preview first — nothing is written until you confirm."
        footer={
          preview ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setPreview(null); setPendingCsv(null); }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" loading={busy === "import"} onClick={() => void commitImport()}>
                Import
              </Button>
            </>
          ) : undefined
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file to import"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft-bg file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
        />

        {preview && (
          <Card className="mt-3 bg-surface-sunken p-3">
            <p className="text-sm font-medium text-ink">Dry run result</p>
            <ul className="mt-1 space-y-0.5 text-sm text-muted">
              <li>Would create: {preview.created ?? 0}</li>
              <li>Would update: {preview.updated ?? 0}</li>
              <li>Would skip: {preview.skipped ?? 0}</li>
            </ul>
            {Array.isArray(preview.errors) && preview.errors.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-y-auto space-y-0.5 text-xs text-expense">
                {preview.errors.slice(0, 10).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </Panel>

      <Panel
        title="This device"
        description="Everything below acts on the local copy only — your server data is untouched."
        footer={
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => void measure().then(() => setConfirmReset(true))}
          >
            Clear local data
          </Button>
        }
      >
        <p className="flex items-center gap-2 text-sm text-muted">
          <Database aria-hidden="true" className="h-4 w-4 shrink-0" />
          {localSize !== null
            ? `Using ${formatBytes(localSize)} of storage on this device.`
            : "IndexedDB holds accounts, transactions, reports and the sync queue."}
        </p>
        <Alert tone="warning" title="Clearing requires a re-sync">
          Queued but unsent changes are discarded with the local copy, so sync first if you have
          a weak connection.
        </Alert>
      </Panel>

      <ConfirmOverlay
        open={confirmReset}
        busy={busy === "reset"}
        tone="danger"
        onClose={() => setConfirmReset(false)}
        onConfirm={() => void resetLocal()}
        title="Clear local data on this device?"
        confirmLabel="Clear everything"
        message="Anything not yet pushed to the server will be lost. Signed-in data on the server is not affected."
      />
    </div>
  );
}
