import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SEO from "@/components/SEO";
import { ResonanceLogo } from "@/components/brand/ResonanceLogo";
import { HUB_URL } from "@/lib/entitlement";

const Login = ({ initialMode = "signin" }: { initialMode?: "signin" | "signup" } = {}) => {
  const [isLogin, setIsLogin] = useState(initialMode === "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("verify") === "1"
  );
  const navigate = useNavigate();
  const { toast } = useToast();

  const isVerified = (session: any) =>
    !!(session?.user?.email_confirmed_at || session?.user?.confirmed_at);

  const getReturnTo = () => {
    try {
      const raw = new URLSearchParams(window.location.search).get("returnTo");
      if (!raw) return "/studio?welcome=1";
      const decoded = decodeURIComponent(raw);
      if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
    } catch { /* ignore */ }
    return "/studio?welcome=1";
  };

  // Persist the intended destination so /auth/callback can navigate to it
  // once the Supabase session is hydrated.
  const rememberReturnTo = () => {
    try {
      sessionStorage.setItem("post_login_redirect", getReturnTo());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return;
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        if (isVerified(session)) {
          navigate(getReturnTo(), { replace: true });
        } else {
          setNeedsVerification(true);
          supabase.auth.signOut();
        }
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      if (isVerified(session)) navigate(getReturnTo(), { replace: true });
      else {
        setNeedsVerification(true);
        supabase.auth.signOut();
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!isVerified(data.session)) {
          await supabase.auth.signOut();
          setNeedsVerification(true);
          toast({
            title: "Verify your email",
            description: "Please confirm your email address before signing in.",
            variant: "destructive",
          });
          return;
        }
        navigate(getReturnTo(), { replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        setNeedsVerification(true);
        toast({
          title: "Check your email",
          description: "We've sent you a verification link. Verify your email, then sign in.",
        });
      }
    } catch (err: any) {
      toast({ title: "Authentication failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast({ title: "Enter your email first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      toast({
        title: "Verification email sent",
        description: "Check your inbox for the verification link.",
      });
    } catch (err: any) {
      toast({ title: "Could not resend", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Enter your email first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({
        title: "Reset email sent",
        description: "Check your inbox for a link to reset your password.",
      });
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      rememberReturnTo();
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth/callback`,
      });
      if (result.error) {
        toast({
          title: "Google sign-in failed",
          description: String((result.error as any)?.message ?? result.error),
          variant: "destructive",
        });
        return;
      }
      if (result.redirected) return; // browser will redirect to Google
      // Tokens received and session set — listener will route to /studio
    } catch (err: any) {
      toast({ title: "Google sign-in failed", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <SEO
        title="Sign in — Resonance Creative Studio"
        description="Sign in or create your Resonance Creative Studio account to start generating posters, brochures, ads, and videos."
        path="/login"
      />
      <main className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <ResonanceLogo height={56} />
          </div>
          <h1 className="text-2xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent via-primary to-[hsl(325,90%,65%)]">
            Resonance Creative Studio
          </h1>
          <p className="text-muted-foreground text-sm">
            {isLogin ? "Sign in to continue creating" : "Create your account to get started"}
          </p>
        </div>

        <div className="rounded-2xl ring-1 ring-white/[0.08] bg-background/60 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] p-6 space-y-6">
          {needsVerification && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 space-y-2 text-sm">
              <p className="font-medium text-foreground">Verify your email to continue</p>
              <p className="text-muted-foreground">
                We sent a verification link{email ? ` to ${email}` : ""}. Click it, then sign in.
              </p>
              <Button
                type="button"
                variant="link"
                className="px-0 h-auto text-primary"
                onClick={handleResendVerification}
                disabled={loading}
              >
                {loading ? "Sending..." : "Resend verification email"}
              </Button>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 h-12 sm:h-10"
            onClick={handleGoogleSignIn}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12 sm:h-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 sm:h-10" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isLogin ? "Sign In" : "Create Account"}
            </Button>
            {isLogin && (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="w-full text-center text-sm text-primary hover:underline min-h-[44px] sm:min-h-0"
              >
                Forgot password?
              </button>
            )}
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline font-medium inline-flex items-center min-h-[44px] sm:min-h-0 px-1"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Part of{" "}
          <a
            href={HUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            The Resonance ↗
          </a>
        </p>
      </main>
    </div>
  );
};

export default Login;
