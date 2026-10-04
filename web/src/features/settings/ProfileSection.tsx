/**
 * `/settings/profile` — name, email, preferred currency.
 *
 * Written straight to `PATCH /auth/profile/`; the local copy in AuthContext is
 * refreshed from the response so the header picks the new name up immediately.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Trash2 } from "lucide-react";
import { ApiError, apiFetch } from "../../api/client";
import { useAuth, type UserProfile } from "../../auth/AuthContext";
import { Button, ConfirmOverlay, Input, Select, useToast } from "../../components/ui";
import { CURRENCIES } from "../../design/format";
import { usePreferences } from "./preferences";
import { Panel } from "./Panel";

export function ProfileSection() {
  const { profile, refreshProfile, logout } = useAuth();
  const { preferences, update } = usePreferences();
  const toast = useToast();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currency, setCurrency] = useState(preferences.baseCurrency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name);
    setLastName(profile.last_name);
    setCurrency(profile.preferred_currency);
  }, [profile]);

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const updated = await apiFetch<UserProfile>("/auth/profile/", {
        method: "PATCH",
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          preferred_currency: currency,
        }),
      });
      await refreshProfile();
      // Keep the local reporting currency in step with the server profile.
      if (currency !== preferences.baseCurrency) await update({ baseCurrency: currency });
      toast.push({
        tone: "success",
        title: "Profile updated",
        description: updated.email,
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save your profile right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    try {
      await apiFetch("/auth/profile/", { method: "DELETE" });
      await logout();
      navigate("/login", { replace: true });
      toast.push({ tone: "success", title: "Account deleted" });
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete account",
        description: err instanceof ApiError ? err.message : undefined,
      });
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Your details"
        description="Shown on this device and on every device you sign in from."
        footer={
          <Button variant="primary" size="sm" icon={<Save className="h-4 w-4" />} loading={busy} onClick={() => void save()}>
            Save
          </Button>
        }
      >
        <form onSubmit={save} className="space-y-3" noValidate>
          {error && (
            <p role="alert" className="rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense">
              {error}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              maxLength={60}
            />
            <Input
              label="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              maxLength={60}
            />
          </div>
          <Input
            label="Email"
            value={profile?.email ?? ""}
            readOnly
            hint="Email changes go through verification — contact support to change it."
          />
          <Select
            label="Preferred currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            hint="Used for your profile and as the starting point for this device's reports."
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
          <button type="submit" className="sr-only">
            Save profile
          </button>
        </form>
      </Panel>

      <Panel
        title="Danger zone"
        description="Deleting your account removes every transaction, account and goal from the server."
      >
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => setConfirmDelete(true)}
        >
          Delete account
        </Button>
      </Panel>

      <ConfirmOverlay
        open={confirmDelete}
        busy={busy}
        tone="danger"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void deleteAccount()}
        title="Delete your FinTrack account?"
        confirmLabel="Delete everything"
        message="This erases all accounts, transactions, budgets and goals on the server. It cannot be undone."
      />
    </div>
  );
}
