import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { isAdminUser } from "@/lib/adminEmails";
import { signOutAndRedirect } from "@/lib/signOut";
import { Loader2, LogOut, Users, Home, ShieldCheck, Search, Gauge, Activity, AlertTriangle, LineChart } from "lucide-react";
import { format } from "date-fns";
import { HubBackoffSettings } from "@/components/admin/HubBackoffSettings";
import { HubEntitlementCheck } from "@/components/admin/HubEntitlementCheck";
import { AIQualityCheck } from "@/components/admin/AIQualityCheck";
import { PosterPipelineCheck } from "@/components/admin/PosterPipelineCheck";


interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !(await isAdminUser(session.user.id))) {
        navigate("/admin", { replace: true });
        return;
      }
      setAuthorized(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setProfiles(data as Profile[]);
      }
      setLoading(false);
    };

    checkAuthAndLoad();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (!session || !(await isAdminUser(session.user.id))) {
        navigate("/admin", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!authorized || loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-destructive" />
            </div>
            <span className="font-display text-base font-bold text-foreground">Admin Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/admin/seo" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" /> SEO Issues
            </Link>
            <Link to="/admin/performance" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" /> Performance
            </Link>
            <Link to="/admin/perf-dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <LineChart className="w-3.5 h-3.5" /> Perf Dashboard
            </Link>
            <Link to="/admin/circuit-breakers" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Breakers
            </Link>
            <Link to="/admin/errors" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Errors
            </Link>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5" /> Home
            </Link>
            <button
              data-testid="admin-sign-out"
              onClick={() => signOutAndRedirect("/")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="studio-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{profiles.length}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="studio-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/50 flex items-center justify-center">
                <Users className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {profiles.filter(p => {
                    const d = new Date(p.created_at);
                    const now = new Date();
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                  }).length}
                </p>
                <p className="text-xs text-muted-foreground">New This Month</p>
              </div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="studio-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                <Users className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {profiles.filter(p => {
                    const d = new Date(p.created_at);
                    const now = new Date();
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return d >= weekAgo;
                  }).length}
                </p>
                <p className="text-xs text-muted-foreground">New This Week</p>
              </div>
            </div>
          </motion.div>
        </div>
        {/* Hub diagnostics */}
        <div className="mb-8 space-y-4">
          <HubEntitlementCheck />
          <HubBackoffSettings />
          <AIQualityCheck />
          <PosterPipelineCheck />
        </div>

        {/* Users table */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="studio-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-display font-bold text-foreground">Registered Users</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Signed Up</th>
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {(profile.full_name || profile.email || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <span className="text-foreground font-medium">{profile.full_name || "—"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{profile.email || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{format(new Date(profile.created_at), "MMM d, yyyy")}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {profile.last_sign_in_at ? format(new Date(profile.last_sign_in_at), "MMM d, yyyy HH:mm") : "—"}
                    </td>
                  </tr>
                ))}
                {profiles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No users yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default AdminDashboard;
