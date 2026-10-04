import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Button, IconButton } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { AuthLayout, FormError } from "./AuthLayout";
import { stashMfaCredentials } from "./MfaPage";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await login(email.trim(), password);
      if (result.mfaRequired) {
        // Hand the credentials to the dedicated challenge screen so it can
        // finish the sign-in. They live in sessionStorage for that step only.
        stashMfaCredentials({ email: email.trim(), password });
        navigate("/mfa", { replace: true });
        return;
      }
      navigate("/overview", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || "Those details didn't match. Check your email and password."
          : "Couldn't reach the server. Check your connection and try again.",
      );
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to sync your accounts, budgets and goals."
      footer={
        <>
          New to FinTrack?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormError message={error} />}

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
        <div className="relative">
          <Input
            label="Password"
            type={reveal ? "text" : "password"}
            name="password"
            autoComplete="current-password"
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
        <div className="-mt-1 text-right">
          <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={busy}
          trailingIcon={<ArrowRight className="h-4 w-4" />}
        >
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
