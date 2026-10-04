import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Music, Chrome } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import EmailOtpFallback from "@/components/auth/EmailOtpFallback";
import AuthEnvironmentBadge from "@/components/auth/AuthEnvironmentBadge";
import { isLovableOAuthAvailable } from "@/integrations/lovable";



export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, user, loading } = useAuth();
  const navigate = useNavigate();
  const googleAvailable = isLovableOAuthAvailable();

  useEffect(() => {
    if (!loading && user) {
      let dest = "/dashboard";
      try {
        const stored = sessionStorage.getItem("postLoginRedirect");
        if (stored && stored.startsWith("/")) {
          dest = stored;
          sessionStorage.removeItem("postLoginRedirect");
        }
      } catch { /* sessionStorage unavailable */ }
      navigate(dest, { replace: true });
    }
  }, [user, loading, navigate]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    let dest = "/dashboard";
    try {
      const stored = sessionStorage.getItem("postLoginRedirect");
      if (stored && stored.startsWith("/") && !stored.startsWith("//")) dest = stored;
    } catch { /* sessionStorage unavailable */ }

    const { error } = await signInWithGoogle(dest);
    if (error) {
      setGoogleLoading(false);
      toast.error(error.message || "Google sign-in failed. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isSignUp) {
        const { error } = await signUpWithEmail(email, password, name);
        if (error) { toast.error(error.message); return; }
        toast.success("Account created! Check your email to confirm.");
      } else {
        const { error } = await signInWithEmail(email, password);
        if (error) { toast.error(error.message); return; }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--gradient-hero)" }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 glow-border">
              <Music className="h-5 w-5 text-primary" />
            </div>
            <span className="font-display text-xl font-bold gradient-text">Resonance SyncVision</span>
          </Link>
          <div className="mt-3 flex justify-center">
            <AuthEnvironmentBadge />
          </div>
        </div>


        <div className="glass-card p-8">
          <h2 className="mb-2 text-center text-2xl font-bold">
            {isSignUp ? "Create Account" : "Welcome Back"}
          </h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            {isSignUp ? "Sign up to start creating" : "Sign in to your account"}
          </p>

          {googleAvailable ? (
            <>
              <Button
                onClick={handleGoogleLogin}
                variant="outline"
                className="w-full gap-2 border-border bg-secondary text-foreground hover:bg-secondary/80"
                disabled={googleLoading || submitting}
              >
                <Chrome className="h-4 w-4" /> {googleLoading ? "Opening Google…" : "Continue with Google"}
              </Button>
              <div className="my-6 flex items-center gap-4">
                <Separator className="flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <Separator className="flex-1 bg-border" />
              </div>
            </>
          ) : (
            <div className="mb-6 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              Sign in with email on this hosted version. If you do not use a password, request a one-time code below.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Full Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" required />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" required />
            </div>
            <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={submitting}>
              {submitting ? "Please wait..." : isSignUp ? "Create Account" : "Sign In"}
            </Button>
          </form>

          {!isSignUp && (
            <>
              <div className="my-6 flex items-center gap-4">
                <Separator className="flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">can't sign in?</span>
                <Separator className="flex-1 bg-border" />
              </div>
              <EmailOtpFallback defaultEmail={email} />
            </>
          )}


          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary hover:underline font-medium">
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
