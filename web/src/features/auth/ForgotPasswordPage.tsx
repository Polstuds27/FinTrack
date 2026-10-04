import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, MailCheck } from "lucide-react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { AuthLayout, FormError } from "./AuthLayout";

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle={
          <>
            If an account exists for <span className="font-medium text-ink">{email}</span>, we've sent a
            link to reset your password. It expires in a few hours.
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg bg-info-soft px-3 py-2.5 text-sm text-info">
            <MailCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Nothing there? Check your spam folder, then try again.</span>
          </div>
          <Link to="/login" className="btn-secondary w-full">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send a reset link."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
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
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
