import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { m as motion } from "@/lib/lazy-motion";
import { BarChart3, Users, Eye, Zap, LogOut, ArrowLeft, TrendingUp, Clock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import resonanceLogo from "@/assets/resonance-logo.png";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const CHART_COLORS = [
  "hsl(192, 90%, 50%)",
  "hsl(270, 80%, 62%)",
  "hsl(310, 80%, 58%)",
  "hsl(42, 90%, 58%)",
  "hsl(175, 65%, 42%)",
  "hsl(235, 70%, 55%)",
];

const Admin = () => {
  const { user, isAdmin, loading, signOut } = useAdmin();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalPageViews: 0,
    totalAudits: 0,
    totalUsers: 0,
    totalFeatureUses: 0,
  });
  const [pageViewData, setPageViewData] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [featureData, setFeatureData] = useState<any[]>([]);
  const [recentViews, setRecentViews] = useState<any[]>([]);
  const [costingStats, setCostingStats] = useState({
    samples: 0,
    failures: 0,
    avgDurationMs: 0,
  });

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAnalytics();
  }, [isAdmin]);

  const fetchAnalytics = async () => {
    try {
    const [pvRes, auditRes, profileRes, featureRes] = await Promise.all([
      supabase.from("page_views").select("*", { count: "exact", head: true }),
      supabase.from("audit_logs").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("feature_usage").select("*", { count: "exact", head: true }),
    ]);

    setStats({
      totalPageViews: pvRes.count || 0,
      totalAudits: auditRes.count || 0,
      totalUsers: profileRes.count || 0,
      totalFeatureUses: featureRes.count || 0,
    });

    // Page views by day (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: pvData } = await supabase
      .from("page_views")
      .select("created_at, page")
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: true });

    if (pvData) {
      const byDay: Record<string, number> = {};
      pvData.forEach((pv: any) => {
        const day = new Date(pv.created_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        byDay[day] = (byDay[day] || 0) + 1;
      });
      setPageViewData(Object.entries(byDay).map(([name, views]) => ({ name, views })));
    }

    // Recent page views
    const { data: recentPv } = await supabase
      .from("page_views")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setRecentViews(recentPv || []);

    // Audit logs
    const { data: audits } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setAuditLogs(audits || []);

    // Feature usage breakdown
    const { data: features } = await supabase
      .from("feature_usage")
      .select("feature, metadata");
    if (features) {
      const counts: Record<string, number> = {};
      features.forEach((f: any) => {
        counts[f.feature] = (counts[f.feature] || 0) + 1;
      });
      setFeatureData(
        Object.entries(counts)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      );

      const costingEvents = features
        .filter((f: any) => f.feature === "promotion_costing")
        .map((f: any) => (f.metadata && typeof f.metadata === "object" ? f.metadata : {}));
      const durations = costingEvents
        .map((m: any) => Number(m.duration_ms))
        .filter((value: number) => Number.isFinite(value) && value >= 0);
      const failures = costingEvents.filter((m: any) => m.outcome === "failure").length;
      setCostingStats({
        samples: costingEvents.length,
        failures,
        avgDurationMs: durations.length
          ? Math.round(durations.reduce((sum: number, value: number) => sum + value, 0) / durations.length)
          : 0,
      });
    }
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const statCards = [
    { label: "Page Views", value: stats.totalPageViews, icon: Eye, color: "text-resonance-cyan" },
    { label: "Audits Run", value: stats.totalAudits, icon: BarChart3, color: "text-resonance-violet" },
    { label: "Users", value: stats.totalUsers, icon: Users, color: "text-resonance-magenta" },
    { label: "Feature Uses", value: stats.totalFeatureUses, icon: Zap, color: "text-resonance-gold" },
    { label: "Costing Samples", value: costingStats.samples, icon: TrendingUp, color: "text-resonance-cyan" },
    {
      label: "Avg Costing Time",
      value: costingStats.samples ? `${(costingStats.avgDurationMs / 1000).toFixed(1)}s` : "—",
      icon: Clock,
      color: "text-resonance-violet",
    },
    { label: "Costing Failures", value: costingStats.failures, icon: BarChart3, color: "text-resonance-magenta" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 bg-background/60 backdrop-blur-2xl sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={resonanceLogo} alt="Resonance" className="w-8 h-8 object-contain" />
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-bold text-lg gradient-resonance-text">Resonance</span>
              <span className="font-display font-semibold text-sm text-muted-foreground">Admin</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to App
            </Button>
            <Button variant="outline" size="sm" onClick={signOut} className="gap-1.5 neon-border rounded-full">
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="p-5 bg-card/60 border-border/40 backdrop-blur-xl">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <p className={`font-display font-bold text-2xl ${stat.color}`}>
                  {stat.value.toLocaleString()}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Charts & Data */}
        <Tabs defaultValue="traffic" className="w-full">
          <TabsList className="bg-card/60 border border-border/40 p-1 rounded-xl">
            <TabsTrigger value="traffic" className="font-display text-xs gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary rounded-lg">
              <Eye className="h-3.5 w-3.5" />
              Traffic
            </TabsTrigger>
            <TabsTrigger value="audits" className="font-display text-xs gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary rounded-lg">
              <BarChart3 className="h-3.5 w-3.5" />
              Audits
            </TabsTrigger>
            <TabsTrigger value="features" className="font-display text-xs gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary rounded-lg">
              <Zap className="h-3.5 w-3.5" />
              Features
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            {/* Traffic Tab */}
            <TabsContent value="traffic" className="space-y-6">
              <Card className="p-6 bg-card/60 border-border/40 backdrop-blur-xl">
                <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-resonance-cyan" />
                  Page Views (Last 7 Days)
                </h3>
                {pageViewData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={pageViewData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(260, 16%, 14%)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(260, 10%, 45%)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(260, 10%, 45%)" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(260, 22%, 7%)",
                          border: "1px solid hsl(260, 16%, 14%)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="views" fill="hsl(192, 90%, 50%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No traffic data yet
                  </div>
                )}
              </Card>

              {/* Recent Views */}
              <Card className="p-6 bg-card/60 border-border/40 backdrop-blur-xl">
                <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-resonance-violet" />
                  Recent Page Views
                </h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {recentViews.length > 0 ? recentViews.map((v) => (
                    <div key={v.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30 text-sm">
                      <div className="flex items-center gap-3">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-display font-medium">{v.page}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {new Date(v.created_at).toLocaleString()}
                      </span>
                    </div>
                  )) : (
                    <p className="text-muted-foreground text-sm text-center py-4">No page views yet</p>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* Audits Tab */}
            <TabsContent value="audits">
              <Card className="p-6 bg-card/60 border-border/40 backdrop-blur-xl">
                <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-resonance-magenta" />
                  Channel Audits Performed
                </h3>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {auditLogs.length > 0 ? auditLogs.map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-3 px-4 rounded-lg bg-secondary/30">
                      <div>
                        <p className="font-display font-medium text-sm">{a.channel_name || "Unknown Channel"}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-xs">{a.channel_url}</p>
                      </div>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                  )) : (
                    <p className="text-muted-foreground text-sm text-center py-4">No audits yet</p>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* Features Tab */}
            <TabsContent value="features" className="space-y-6">
              <Card className="p-6 bg-card/60 border-border/40 backdrop-blur-xl">
                <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-resonance-gold" />
                  Feature Usage Breakdown
                </h3>
                {featureData.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={featureData}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {featureData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(260, 22%, 7%)",
                            border: "1px solid hsl(260, 16%, 14%)",
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {featureData.map((f, i) => (
                        <div key={f.name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                            />
                            <span className="text-sm font-display">{f.name}</span>
                          </div>
                          <span className="text-sm font-bold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                            {f.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No feature usage data yet
                  </div>
                )}
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
