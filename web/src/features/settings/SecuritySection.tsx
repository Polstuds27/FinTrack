/**
 * `/settings/security` — password and two-factor.
 *
 * Both write to the dedicated auth endpoints. MFA enrollment is a two-step
 * flow: start (returns a secret/otpauth URI), then confirm with a code the
 * authenticator actually produced.
 */
import { useState, type FormEvent } from "react";
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { ApiError, apiFetch } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { isRecoveryCode, normalizeRecoveryCode } from "../auth/recovery";
import { Alert, Badge, Button, Input, useToast } from "../../components/ui";
import { Panel } from "./Panel";

interface MfaChallenge {
  secret: string;
  otpauth_uri: string;
}

export function SecuritySection() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [code, setCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  // Backup codes, shown exactly once after minting — never fetched again.
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenCode, setRegenCode] = useState("");
  const [copied, setCopied] = useState(false);

  const mfaEnabled = Boolean(profile?.mfa_enabled);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPwdError(null);
    if (next !== confirm) {
      setPwdError("Passwords don't match.");
      return;
    }
    setPwdBusy(true);
    try {
      await apiFetch("/auth/change-password/", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.push({ tone: "success", title: "Password changed" });
    } catch (err) {
      setPwdError(err instanceof ApiError ? err.message : "Couldn't change the password.");
    } finally {
      setPwdBusy(false);
    }
  }

  async function startMfa() {
    setMfaError(null);
    setMfaBusy(true);
    try {
      const data = await apiFetch<MfaChallenge>("/auth/mfa/enable/", { method: "POST" });
      setChallenge(data);
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : "Couldn't start enrollment.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function regenerate() {
    setMfaError(null);
    setMfaBusy(true);
    try {
      const data = await apiFetch<MfaChallenge>("/auth/mfa/regenerate/", { method: "POST" });
      setChallenge(data);
      toast.push({ tone: "info", title: "New secret generated", description: "Scan it again before confirming." });
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : "Couldn't regenerate the secret.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmMfa(event: FormEvent) {
    event.preventDefault();
    setMfaError(null);
    setMfaBusy(true);
    try {
      const data = await apiFetch<{ detail: string; recovery_codes?: string[] }>(
        "/auth/mfa/confirm/",
        {
          method: "POST",
          body: JSON.stringify({ code }),
        },
      );
      setChallenge(null);
      setCode("");
      setCopied(false);
      // Enrollment mints the first backup set: surface it now, because this
      // response is the only time the plaintext ever exists.
      setRecoveryCodes(data.recovery_codes ?? null);
      await refreshProfile();
      toast.push({ tone: "success", title: "Two-factor enabled" });
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : "That code wasn't accepted.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function regenerateCodes(event: FormEvent) {
    event.preventDefault();
    setMfaError(null);
    setMfaBusy(true);
    try {
      const data = await apiFetch<{ codes: string[]; remaining: number }>(
        "/auth/mfa/recovery-codes/",
        {
          method: "POST",
          body: JSON.stringify({ code: regenCode }),
        },
      );
      setRegenCode("");
      setCopied(false);
      // Regeneration kills the old set server-side: the previous codes on any
      // screenshot or note are dead the moment these appear.
      setRecoveryCodes(data.codes);
      await refreshProfile();
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : "Couldn't generate new codes.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function copyCodes() {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
    } catch {
      setMfaError("Copy failed — select the codes manually.");
    }
  }

  function downloadCodes() {
    if (!recoveryCodes) return;
    const blob = new Blob(
      [`FinTrack recovery codes for ${profile?.email ?? "your account"}\nEach code works once. Keep them somewhere safe.\n\n${recoveryCodes.join("\n")}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fintrack-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function disableMfa() {
    setMfaError(null);
    setMfaBusy(true);
    try {
      // A recovery code also switches MFA off — the lost-phone path. The
      // server tells the two apart; both travel in the same field.
      const value = isRecoveryCode(code) ? normalizeRecoveryCode(code) : code;
      await apiFetch("/auth/mfa/disable/", {
        method: "POST",
        body: JSON.stringify({ code: value }),
      });
      setCode("");
      await refreshProfile();
      toast.push({ tone: "success", title: "Two-factor disabled" });
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : "Enter a valid code to turn it off.");
    } finally {
      setMfaBusy(false);
    }
  }

  const disableReady = code.replace(/\D/g, "").length === 6 || isRecoveryCode(code);

  return (
    <div className="space-y-4">
      <Panel title="Password" description="At least 8 characters. A passphrase beats a short jumble.">
        <form onSubmit={changePassword} className="space-y-3" noValidate>
          {pwdError && (
            <p role="alert" className="rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense">
              {pwdError}
            </p>
          )}
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            leadingIcon={<KeyRound aria-hidden="true" className="h-4 w-4" />}
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              minLength={8}
              required
            />
            <Input
              label="Repeat new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              error={confirm && confirm !== next ? "Passwords don't match." : null}
              required
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={pwdBusy}
            disabled={!current || next.length < 8}
          >
            Change password
          </Button>
        </form>
      </Panel>

      <Panel
        title="Two-factor authentication"
        description="Adds a rotating 6-digit code from your authenticator app at sign-in."
        footer={
          challenge ? (
            <>
              <Button variant="ghost" size="sm" icon={<RefreshCw className="h-4 w-4" />} loading={mfaBusy} onClick={() => void regenerate()}>
                New secret
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setChallenge(null)}>
                Cancel
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={mfaEnabled ? "income" : "neutral"}>
            {mfaEnabled ? "Enabled" : "Disabled"}
          </Badge>
          <span className="text-sm text-muted">
            {mfaEnabled
              ? "Sign-in asks for a code from your authenticator app."
              : "Your account is protected by the password alone."}
          </span>
        </div>

        {mfaError && (
          <p role="alert" className="mt-3 rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense">
            {mfaError}
          </p>
        )}

        {!mfaEnabled && !challenge && (
          <div className="mt-3">
            <Button variant="primary" size="sm" icon={<ShieldCheck className="h-4 w-4" />} loading={mfaBusy} onClick={() => void startMfa()}>
              Turn on two-factor
            </Button>
          </div>
        )}

        {challenge && (
          <form onSubmit={confirmMfa} className="mt-3 space-y-3" noValidate>
            <Alert tone="info" title="Add this to your authenticator">
              Scan the QR code in your authenticator app, or type the secret manually, then enter
              the 6-digit code it shows to finish.
            </Alert>
            <div className="rounded-xl border border-line bg-surface-sunken p-3">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Secret</p>
              <p className="tabular mt-1 select-all break-all text-sm text-ink">{challenge.secret}</p>
              <a
                href={challenge.otpauth_uri}
                className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
              >
                Open in authenticator app
              </a>
            </div>
            <Input
              label="Confirmation code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              required
            />
            <Button type="submit" variant="primary" size="sm" loading={mfaBusy} disabled={code.length !== 6}>
              Confirm and enable
            </Button>
          </form>
        )}

        {mfaEnabled && !challenge && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void disableMfa();
            }}
            className="mt-3 space-y-3"
            noValidate
          >
            <Input
              label="Current code or recovery code"
              inputMode="text"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={11}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456 or XXXXX-XXXXX"
              hint="Lost your phone? A recovery code works here too — or request an emailed code from the sign-in screen after signing out."
              leadingIcon={<ShieldOff aria-hidden="true" className="h-4 w-4" />}
            />
            <Button type="submit" variant="danger" size="sm" loading={mfaBusy} disabled={!disableReady}>
              Turn off two-factor
            </Button>
          </form>
        )}
      </Panel>

      {mfaEnabled && (
        <Panel
          title="Recovery codes"
          description={
            profile?.recovery_codes_remaining !== undefined
              ? `${profile.recovery_codes_remaining} of 10 single-use codes left. Each one signs you in once when your authenticator is gone. Lost the codes too? The sign-in screen can email you a one-time code instead.`
              : "Single-use codes that sign you in once when your authenticator is gone. Lost the codes too? The sign-in screen can email you a one-time code instead."
          }          footer={
            !recoveryCodes && !regenOpen ? (
              <Button variant="ghost" size="sm" icon={<RefreshCw className="h-4 w-4" />} loading={mfaBusy} onClick={() => setRegenOpen(true)}>
                {(profile?.recovery_codes_remaining ?? 0) > 0 ? "Regenerate codes" : "Generate codes"}
              </Button>
            ) : undefined
          }
        >
          {recoveryCodes && recoveryCodes.length > 0 ? (
            <div className="space-y-3">
              <Alert tone="info" title="Save these now — they will never be shown again">
                Copy them to a password manager or download the file. Anyone holding one can
                sign in once as you.
              </Alert>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {recoveryCodes.map((recovery) => (
                  <li
                    key={recovery}
                    className="tabular rounded-lg border border-line bg-surface-sunken px-3 py-2 text-center text-sm font-medium tracking-widest text-ink select-all"
                  >
                    {recovery}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" loading={mfaBusy} onClick={() => void copyCodes()}>
                  {copied ? "Copied" : "Copy all"}
                </Button>
                <Button variant="ghost" size="sm" onClick={downloadCodes}>
                  Download .txt
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setRecoveryCodes(null); setRegenOpen(false); }}>
                  I&apos;ve saved them
                </Button>
              </div>
            </div>
          ) : regenOpen ? (
            <form onSubmit={regenerateCodes} className="space-y-3" noValidate>
              <p className="text-sm text-muted">
                Generating a new set kills the old one. Confirm it&apos;s you with a code from
                your authenticator app.
              </p>
              <Input
                label="Current authenticator code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={regenCode}
                onChange={(event) => setRegenCode(event.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                required
              />
              <Button type="submit" variant="primary" size="sm" loading={mfaBusy} disabled={regenCode.length !== 6}>
                Generate 10 new codes
              </Button>
            </form>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
