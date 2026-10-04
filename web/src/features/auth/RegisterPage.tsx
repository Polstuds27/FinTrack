import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, User } from "lucide-react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Button, IconButton } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { CURRENCIES } from "../../design/format";
import { useToast } from "../../components/ui/Toast";
import { AuthLayout, FormError } from "./AuthLayout";

const CHECKS = [
  { id: "len", label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { id: "case", label: "Upper and lowercase letters", test: (value: string) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { id: "digit", label: "A number", test: (value: string) => /\d/.test(value) },
];

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checks = useMemo(() => CHECKS.map((check) => ({ ...check, passed: check.test(password) })), [password]);
  const passed = checks.filter((check) => check.passed).length;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (mismatch) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await register({
        email: email.trim(),
        password,
        password_confirm: confirm,
        full_name: fullName.trim(),
        preferred_currency: currency,
      });
      toast.push({
        tone: "success",
        title: "Account created",
        description: "Check your inbox to verify your email, then sign in.",
      });
      navigate("/login", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || "That email may already be registered."
          : "Couldn't reach the server. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Track every account, budget and goal from one place — online or offline."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormError message={error} />}

        <Input
          label="Full name"
          name="name"
          autoComplete="name"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          leadingIcon={<User aria-hidden="true" className="h-4 w-4" />}
          placeholder="Alex Santos"
        />
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          leadingIcon={<Mail aria-hidden="true" className="h-4 w-4" />}
          placeholder="you@example.com"
        />
        <Select
          label="Base currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          hint="Totals and reports are shown in this currency."
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>

        <div className="relative">
          <Input
            label="Password"
            type={reveal ? "text" : "password"}
            name="new-password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            leadingIcon={<KeyRound aria-hidden="true" className="h-4 w-4" />}
            className="pr-11"
          />
          <IconButton
            label={reveal ? "Hide password" : "Show password"}
            onClick={() => setReveal((prev) => !prev)}
            className="absolute top-6 right-0.5"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </IconButton>
        </div>

        {password && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    passed <= 1 ? "bg-expense" : passed === 2 ? "bg-warning" : "bg-income"
                  }`}
                  style={{ width: `${(passed / CHECKS.length) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted">{checks[passed - 1]?.label ?? "Too short"}</span>
            </div>
            <ul className="space-y-0.5">
              {checks.map((check) => (
                <li
                  key={check.id}
                  className={`flex items-center gap-1.5 text-xs ${check.passed ? "text-income" : "text-muted"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${check.passed ? "bg-income" : "bg-line-strong"}`}
                  />
                  {check.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Input
          label="Confirm password"
          type={reveal ? "text" : "password"}
          name="confirm-password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          leadingIcon={<KeyRound aria-hidden="true" className="h-4 w-4" />}
          error={mismatch ? "Passwords don't match." : null}
        />

        <Button type="submit" variant="primary" size="lg" block loading={busy} trailingIcon={<ArrowRight className="h-4 w-4" />}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
