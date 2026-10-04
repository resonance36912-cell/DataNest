import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SEO from "@/components/SEO";
import { ResonanceLogo } from "@/components/brand/ResonanceLogo";

/**
 * Public reset-password page. The recovery link in the email lands here with
 * either a `?code=...` (PKCE) or `#access_token=...&type=recovery` (implicit).
 * Supabase's client automatically detects the URL and creates a recovery
 * session; we then let the user set a new password via `updateUser`.
 */
const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const url = new URL(window.location.href);
        const errParam =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");
        if (errParam) {
          setError(errParam);
          return;
        }

        // PKCE: exchange ?code=... for a session.
        if (url.searchParams.has("code")) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(
            window.location.href,
          );
          if (exErr) {
            setError(exErr.message);
            return;
          }
        }

        // Implicit flow / already-hydrated session.
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          if (data.session) {
            setReady(true);
          } else {
            const sub = supabase.auth.onAuthStateChange((_e, session) => {
              if (session && !cancelled) {
                sub.data.subscription.unsubscribe();
                setReady(true);
              }
            });
            setTimeout(async () => {
              if (cancelled) return;
              // Re-read the session rather than trusting the captured
              // `ready` state — onAuthStateChange may have set it after
              // this closure was created.
              const { data: recheck } = await supabase.auth.getSession();
              if (cancelled) return;
              if (recheck.session) {
                sub.data.subscription.unsubscribe();
                setReady(true);
                return;
              }
              sub.data.subscription.unsubscribe();
              setError(
                "This reset link is invalid or has expired. Please request a new one.",
              );
            }, 2500);
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;
      toast({ title: "Password updated", description: "You're now signed in." });
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (err: any) {
      toast({ title: "Could not update password", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <SEO
        title="Reset password — Resonance Creative Studio"
        description="Set a new password for your Resonance Creative Studio account."
        path="/reset-password"
      />
      <main className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <ResonanceLogo height={56} />
          </div>
          <h1 className="text-2xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent via-primary to-[hsl(325,90%,65%)]">
            Reset your password
          </h1>
          <p className="text-muted-foreground text-sm">
            Choose a new password to finish signing back in.
          </p>
        </div>

        <div className="rounded-2xl ring-1 ring-white/[0.08] bg-background/60 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] p-6 space-y-6">
          {error ? (
            <div className="space-y-3 text-sm">
              <p className="text-destructive font-medium">{error}</p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => navigate("/login", { replace: true })}
              >
                Back to sign in
              </Button>
            </div>
          ) : !ready ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Verifying reset link…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-12 sm:h-10"
                    required
                    minLength={6}
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-10 h-12 sm:h-10"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-12 sm:h-10" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Update password
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
