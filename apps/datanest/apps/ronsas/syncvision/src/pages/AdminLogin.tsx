import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import EmailVerificationGate from "@/components/auth/EmailVerificationGate";
import { isEmailVerified } from "@/lib/email-verification";
import AuthEnvironmentBadge from "@/components/auth/AuthEnvironmentBadge";


export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signInWithEmail, signInWithGoogle, user, loading } = useAuth();
  const navigate = useNavigate();

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle("/admin");
    if (error) {
      toast.error(error.message || "Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  const unverified = !loading && !!user && !isEmailVerified(user);

  useEffect(() => {
    if (!loading && user && isEmailVerified(user)) {
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .then(({ data }) => {
          if (data && data.length > 0) {
            navigate("/admin");
          } else {
            toast.error("You don't have admin access.");
            navigate("/dashboard");
          }
        });
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await signInWithEmail(email, password);
      if (error) {
        toast.error(error.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (unverified) {
    return <EmailVerificationGate email={user?.email ?? email} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--gradient-hero)" }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 glow-border">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="font-display text-xl font-bold gradient-text">Resonance SyncVision</span>
          </Link>
          <div className="mt-3 flex justify-center">
            <AuthEnvironmentBadge />
          </div>
        </div>


        <div className="glass-card p-8">
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-accent/10 py-2 text-sm font-medium text-accent">
            <Shield className="h-4 w-4" /> Admin Access Only
          </div>
          <h2 className="mb-2 text-center text-2xl font-bold">Admin Sign In</h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Authorized personnel only
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" required />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" required />
            </div>
            <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign In as Admin"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogle}
            disabled={googleLoading || submitting}
            className="w-full gap-2 border-border bg-secondary hover:bg-secondary/80"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1s2.69-6.1 6-6.1c1.88 0 3.14.8 3.86 1.48l2.63-2.53C16.83 3.43 14.66 2.4 12 2.4 6.86 2.4 2.7 6.56 2.7 11.7s4.16 9.3 9.3 9.3c5.36 0 8.9-3.76 8.9-9.06 0-.61-.07-1.08-.16-1.54H12z"/>
            </svg>
            {googleLoading ? "Redirecting..." : "Continue with Google"}
          </Button>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ← Back to user login
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
