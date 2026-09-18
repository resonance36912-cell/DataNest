import { useEffect, useState } from "react";
import { MailCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  RESEND_COOLDOWN_MS,
  resendCooldownRemaining,
  resendVerificationEmail,
} from "@/lib/email-verification";
import { supabase } from "@/integrations/supabase/client";

/**
 * Blocking screen shown when a signed-in account has not confirmed its email.
 * Admin surfaces render this instead of the protected content.
 */
export default function EmailVerificationGate({
  email,
  onVerified,
}: {
  email: string;
  onVerified?: () => void;
}) {
  const { signOut } = useAuth();
  const [cooldown, setCooldown] = useState(() => resendCooldownRemaining(email));
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown(resendCooldownRemaining(email));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown, email]);

  const handleResend = async () => {
    setSending(true);
    try {
      const { error, cooldownMs } = await resendVerificationEmail(email);
      setCooldown(cooldownMs || RESEND_COOLDOWN_MS);
      if (error) toast.error(error.message);
      else toast.success(`Verification email sent to ${email}`);
    } finally {
      setSending(false);
    }
  };

  const handleRecheck = async () => {
    setChecking(true);
    try {
      const { data } = await supabase.auth.refreshSession();
      const confirmed = Boolean(data.user?.email_confirmed_at);
      if (confirmed) {
        toast.success("Email verified — welcome back.");
        onVerified?.();
      } else {
        toast.info("Still unverified. Open the link in the email, then check again.");
      }
    } finally {
      setChecking(false);
    }
  };

  const seconds = Math.ceil(cooldown / 1000);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="glass-card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 glow-border">
          <MailCheck className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-2xl font-bold">Verify your email</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Admin access requires a confirmed address. We sent a verification link to{" "}
          <span className="font-medium text-foreground">{email}</span>. Open it, then
          come back and check again.
        </p>

        <div className="mb-6 flex items-start gap-2 rounded-lg bg-accent/10 p-3 text-left text-xs text-accent">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Until this address is verified, the admin dashboard stays locked for this
            session.
          </span>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleRecheck}
            disabled={checking}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {checking ? "Checking..." : "I've verified — check again"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={sending || cooldown > 0}
            className="w-full border-border bg-secondary hover:bg-secondary/80"
          >
            {cooldown > 0
              ? `Resend available in ${seconds}s`
              : sending
                ? "Sending..."
                : "Resend verification email"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => void signOut()}
            className="w-full text-xs text-muted-foreground hover:text-foreground"
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
