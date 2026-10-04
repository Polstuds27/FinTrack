import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { KeyRound, ShieldCheck } from "lucide-react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { AuthLayout, FormError } from "./AuthLayout";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const { token: pathToken } = useParams<{ token: string }>();
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const uid = params.get("uid") ?? "";
  // The mandated route is `/reset-password/:token`; older emails append
  // `?uid=…&token=…`, so both shapes are accepted.
  const token = pathToken ?? params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      await resetPassword({
        uid,
        token,
        new_password: password,
        new_password_confirm: confirm,
      });
      navigate("/login", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || "That reset link is invalid or has expired."
          : "Couldn't reach the server. Try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Missing token means the user opened the route directly rather than the email link.
  if (!uid || !token) {
    return (
      <AuthLayout
        title="Reset link required"
        subtitle="This page needs the link from your password reset email."
        footer={
          <Link to="/forgot-password" className="font-medium text-primary hover:underline">
            Request a new link
          </Link>
        }
      >
        <Link to="/forgot-password" className="btn-primary w-full">
          Send me a reset link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something you don't use anywhere else."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormError message={error} />}
        <Input
          label="New password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          leadingIcon={<KeyRound aria-hidden="true" className="h-4 w-4" />}
        />
        <Input
          label="Confirm new password"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          leadingIcon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
          error={mismatch ? "Passwords don't match." : null}
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
