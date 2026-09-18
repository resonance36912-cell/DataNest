import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users, FileAudio, Cpu, TrendingUp, BarChart3, Activity, RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { AdminSection } from "../AdminSection";

interface Stats {
  totalUsers: number;
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  failedProjects: number;
  draftProjects: number;
}

interface RecentProject {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

const statusColor: Record<string, string> = {
  completed: "bg-success/10 text-success",
  processing: "bg-warning/10 text-warning",
  failed: "bg-destructive/10 text-destructive",
  draft: "bg-muted text-muted-foreground",
  queued: "bg-primary/10 text-primary",
};

export function OverviewSection() {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0, totalProjects: 0, activeProjects: 0,
    completedProjects: 0, failedProjects: 0, draftProjects: 0,
  });
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, projectsRes, recentRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("status"),
        supabase.from("projects").select("id, name, status, created_at")
          .order("created_at", { ascending: false }).limit(10),
      ]);
      const projects = projectsRes.data || [];
      setStats({
        totalUsers: profilesRes.count || 0,
        totalProjects: projects.length,
        activeProjects: projects.filter((p) => p.status === "processing").length,
        completedProjects: projects.filter((p) => p.status === "completed").length,
        failedProjects: projects.filter((p) => p.status === "failed").length,
        draftProjects: projects.filter((p) => p.status === "draft").length,
      });
      setRecent((recentRes.data || []) as RecentProject[]);
    } catch (err) {
      console.error("[OverviewSection] failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const completionRate = stats.totalProjects ? Math.round((stats.completedProjects / stats.totalProjects) * 100) : 0;
  const failRate = stats.totalProjects ? Math.round((stats.failedProjects / stats.totalProjects) * 100) : 0;

  const statCards = [
    { icon: Users, label: "Total Users", value: stats.totalUsers, color: "text-primary" },
    { icon: FileAudio, label: "Total Projects", value: stats.totalProjects, color: "text-accent" },
    { icon: Cpu, label: "Active Jobs", value: stats.activeProjects, color: "text-warning" },
    { icon: TrendingUp, label: "Completed", value: stats.completedProjects, color: "text-success" },
  ];

  return (
    <>
      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-5"
          >
            <s.icon className={`h-5 w-5 ${s.color}`} />
            <p className="mt-3 text-2xl font-bold">{s.value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Analytics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Completion Rate</h3>
          </div>
          <p className="mb-2 text-3xl font-bold text-success">{completionRate}%</p>
          <Progress value={completionRate} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            {stats.completedProjects} of {stats.totalProjects} projects
          </p>
        </div>

        <div className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold">Failure Rate</h3>
          </div>
          <p className="mb-2 text-3xl font-bold text-destructive">{failRate}%</p>
          <Progress value={failRate} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">{stats.failedProjects} failed projects</p>
        </div>

        <div className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold">Status Breakdown</h3>
          </div>
          <div className="mt-2 space-y-2">
            {[
              { label: "Draft", count: stats.draftProjects, color: "bg-muted-foreground" },
              { label: "Processing", count: stats.activeProjects, color: "bg-warning" },
              { label: "Completed", count: stats.completedProjects, color: "bg-success" },
              { label: "Failed", count: stats.failedProjects, color: "bg-destructive" },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                  <span className="text-muted-foreground">{s.label}</span>
                </div>
                <span className="font-medium">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent projects */}
      <AdminSection
        icon={Activity}
        title="Recent Projects"
        description="Latest 10 projects across all users"
        action={
          <Button variant="ghost" size="sm" onClick={fetchStats} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      >
        {recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No projects yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Project</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 text-right font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 last:border-0">
                    <td className="py-3 font-medium">{p.name}</td>
                    <td className="py-3">
                      <Badge className={`${statusColor[p.status] || "bg-muted text-muted-foreground"} border-0 text-xs`}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-right text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </>
  );
}
