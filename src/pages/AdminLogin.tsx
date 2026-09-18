import { useState, useEffect, useId, startTransition } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, ArrowLeft, ShieldCheck } from "lucide-react";
import { isAdminUser } from "@/lib/adminEmails";
import SEO from "@/components/SEO";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const routeIfAdmin = async (session: { user: { id: string } } | null) => {
      if (!session) return;
      if (await isAdminUser(session.user.id)) {
        startTransition(() => { void navigate("/admin/dashboard"); });
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      routeIfAdmin(session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      routeIfAdmin(session);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const userId = data.user?.id;
      if (!userId || !(await isAdminUser(userId))) {
        await supabase.auth.signOut();
        toast({ title: "Access denied", description: "This account is not authorized for admin access.", variant: "destructive" });
        return;
      }
      // onAuthStateChange will handle redirect
    } catch (err: any) {
      toast({ title: "Sign-in failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative">
      <SEO
        title="Admin Sign In — Resonance Creative Studio"
        description="Restricted admin sign-in for authorized Resonance Creative Studio personnel."
        path="/admin"
        noindex
      />
      <h1 className="sr-only">Admin sign in</h1>
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] bg-destructive/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative"
      >
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="studio-card p-8">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-destructive" />
            </div>
            <span className="font-display text-base font-bold text-foreground">Admin Panel</span>
          </div>

          <h2 className="font-display text-2xl font-bold text-foreground mb-1">Admin Sign In</h2>
          <p className="text-sm text-muted-foreground mb-6">Authorized personnel only</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor={emailId} className="text-xs text-muted-foreground block mb-1.5">Email</label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 focus-within:border-primary transition-colors">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  id={emailId}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
                />
              </div>
            </div>
            <div>
              <label htmlFor={passwordId} className="text-xs text-muted-foreground block mb-1.5">Password</label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 focus-within:border-primary transition-colors">
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  id={passwordId}
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-destructive text-destructive-foreground font-semibold text-sm py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign In
            </button>
          </form>
        </div>
      </motion.main>
    </div>
  );
};

export default AdminLogin;
