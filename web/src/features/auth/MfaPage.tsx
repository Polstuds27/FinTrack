/**
 * `/mfa` — the two-factor challenge.
 *
 * Reached from the sign-in form when the server answers `mfa_required`. The
 * credentials being verified are held in sessionStorage for this step only and
 * cleared the moment the challenge succeeds or is abandoned, so a shared
 * machine never keeps a password lying around.
 */
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { AuthLayout, FormError } from "./AuthLayout";

const PENDING_KEY = "fintrack_mfa_pending";

export interface MfaPending {
  email: string;
  password: string;
}

export function stashMfaCredentials(pending: MfaPending): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function readMfaCredentials(): MfaPending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MfaPending>;
    if (!parsed.email || !parsed.password) return null;
    return { email: parsed.email, password: parsed.password };
  } catch {
    return null;
  }
}

export function clearMfaCredentials(): void {
  sessionStorage.removeItem(PENDING_KEY);
}

export function MfaPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const pending = readMfaCredentials();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    setError(null);
    setBusy(true);
    try {
      const result = await login(pending.email, pending.password, otp.trim());
      clearMfaCredentials();
      if (result.mfaRequired) {
        setError("That code wasn't accepted. Try the current one from your app.");
        return;
      }
      navigate("/overview", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || "That code wasn't accepted."
          : "Couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Opened directly (bookmark, refresh, shared link) with nothing to verify.
  if (!pending) {
    return (
      <AuthLayout
        title="Two-factor sign-in"
        subtitle="This step follows a sign-in attempt that needs a code."
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-muted">
          Enter your email and password first and FinTrack will bring you straight here when your
          account has two-factor authentication enabled.
        </p>
        <Link to="/login" className="btn-primary mt-4 w-full">
          Sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Enter your code"
      subtitle={`Open your authenticator app for ${pending.email}.`}
      footer={
        <button
          type="button"
          onClick={() => {
            clearMfaCredentials();
            navigate("/login", { replace: true });
          }}
          className="font-medium text-primary hover:underline"
        >
          Use a different account
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormError message={error} />}
        <Input
          label="Two-factor code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={otp}
          onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
          leadingIcon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
          placeholder="123456"
          fieldClassName="[&_input]:tracking-[0.4em]"
          autoFocus
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={busy}
          disabled={otp.length !== 6}
          trailingIcon={<ArrowRight className="h-4 w-4" />}
        >
          Verify and sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
