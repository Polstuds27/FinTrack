import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleCheck, MailWarning } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { AuthLayout } from "./AuthLayout";
import { Spinner } from "../../components/ui/Spinner";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const { verifyEmail } = useAuth();
  const [state, setState] = useState<"verifying" | "done" | "failed">(
    uid && token ? "verifying" : "failed",
  );

  useEffect(() => {
    if (!uid || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        await verifyEmail(uid, token);
        if (!cancelled) setState("done");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, token, verifyEmail]);

  if (state === "verifying") {
    return (
      <AuthLayout title="Verifying your email" subtitle="One moment while we confirm your address.">
        <div className="flex items-center gap-2.5 text-sm text-muted">
          <Spinner />
          <span>Checking your verification link…</span>
        </div>
      </AuthLayout>
    );
  }

  if (state === "done") {
    return (
      <AuthLayout
        title="Email verified"
        subtitle="Your address is confirmed. You're all set to sign in."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg bg-income-soft px-3 py-2.5 text-sm text-income">
            <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Verification complete.</span>
          </div>
          <Link to="/login" className="btn-primary w-full">
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Couldn't verify that link"
      subtitle="Verification links expire after a while, or may already have been used."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <MailWarning aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Sign in first — you can resend the verification email from Settings.</span>
        </div>
        <Link to="/login" className="btn-primary w-full">
          Go to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
