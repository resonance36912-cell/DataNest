import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Music, Clock, CheckCircle2, AlertCircle, Check, Trash2, Bookmark, Pencil, DollarSign, RefreshCw, Wallet } from "lucide-react";
import { CardGridSkeleton, EmptyState } from "@/components/ui/page-loader";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import StorageOverview from "@/components/StorageOverview";
import SpendChart from "@/components/SpendChart";
import { CouponRedeemField } from "@/components/brand/CouponRedeemField";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { OverviewSection } from "@/components/admin/sections/OverviewSection";
import { CouponsSection } from "@/components/admin/sections/CouponsSection";
import { JobsSection } from "@/components/admin/sections/JobsSection";
import { OpsSection } from "@/components/admin/sections/OpsSection";
import { MetricsSection } from "@/components/admin/sections/MetricsSection";
import ProductionDeskHero from "@/components/dashboard/ProductionDeskHero";
import TopUpCard from "@/components/dashboard/TopUpCard";
import { seedSampleProject } from "@/lib/sample-project";

interface ProjectCosts {
  videoCostGbp: number;
  videoCount: number;
  imageCostGbp: number;
  imageCount: number;
}

interface Project {
  id: string;
  name: string;
  status: string;
  current_step: number;
  created_at: string;
  updated_at: string;
  has_file: boolean;
  has_lyrics: boolean;
  has_characters: boolean;
  has_scenes: boolean;
  has_renders: boolean;
  totalCostGbp: number;
  jobCount: number;
  costs: ProjectCosts;
}

const ZAR_RATE = 30; // approx GBP to ZAR

const stepLabels = ["Upload", "Analyze", "Character", "Storyboard", "Assembly", "Export"];

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", label: "Completed" },
  processing: { icon: Clock, color: "text-warning", bg: "bg-warning/10", label: "Processing" },
  draft: { icon: AlertCircle, color: "text-muted-foreground", bg: "bg-muted", label: "Draft" },
  failed: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Failed" },
};

function getCompletedSteps(p: Project): boolean[] {
  return [
    p.has_file,
    p.has_lyrics,
    p.has_characters,
    p.has_scenes,
    p.has_renders,
    p.status === "completed",
  ];
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [seedingSample, setSeedingSample] = useState(false);

  const isAdmin = useIsAdmin();

  // Load compact credits chip value
  useEffect(() => {
    if (!user) return;
    supabase.from("user_credits").select("balance").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data && typeof data.balance === "number") setCreditBalance(data.balance);
    });
  }, [user]);

  const handleTrySample = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }
    setSeedingSample(true);
    try {
      const id = await seedSampleProject(user.id);
      toast.success("Sample analysis, character, and storyboard ready — no paid generation was used.");
      navigate(`/project/${id}?step=3`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to seed sample project");
    } finally {
      setSeedingSample(false);
    }
  };


  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    const previousName = renameTarget.name;
    const targetId = renameTarget.id;
    try {
      await supabase.from("projects").update({ name: renameValue.trim() }).eq("id", targetId);
      setProjects(prev => prev.map(p => p.id === targetId ? { ...p, name: renameValue.trim() } : p));
      toast.success("Project renamed", {
        action: {
          label: "Undo",
          onClick: async () => {
            await supabase.from("projects").update({ name: previousName }).eq("id", targetId);
            setProjects(prev => prev.map(p => p.id === targetId ? { ...p, name: previousName } : p));
            toast.success(`Reverted to "${previousName}"`);
          },
        },
        duration: 6000,
      });
    } catch {
      toast.error("Failed to rename");
    } finally {
      setRenaming(false);
      setRenameTarget(null);
    }
  };

  const loadProjects = useCallback(async () => {
    if (!user) return;
    const { data: rawProjects } = await supabase
      .from("projects")
      .select("id, name, status, current_step, created_at, updated_at, file_path, lyrics")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (!rawProjects?.length) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const projectIds = rawProjects.map((p) => p.id);

    const [charRes, sceneRes, renderRes, renderCostRes, genCostRes] = await Promise.all([
      supabase.from("characters").select("project_id").in("project_id", projectIds).eq("confirmed", true),
      supabase.from("scenes").select("project_id").in("project_id", projectIds),
      supabase.from("render_jobs").select("project_id").in("project_id", projectIds).eq("status", "completed"),
      supabase.from("render_jobs").select("project_id, estimated_cost_gbp").in("project_id", projectIds),
      supabase.from("generation_jobs").select("project_id, estimated_cost_gbp").in("project_id", projectIds),
    ]);

    const charSet = new Set((charRes.data || []).map((c) => c.project_id));
    const sceneSet = new Set((sceneRes.data || []).map((s) => s.project_id));
    const renderSet = new Set((renderRes.data || []).map((r) => r.project_id));

    const costMap: Record<string, ProjectCosts> = {};
    const ensureCost = (pid: string) => {
      if (!costMap[pid]) costMap[pid] = { videoCostGbp: 0, videoCount: 0, imageCostGbp: 0, imageCount: 0 };
    };
    for (const row of (renderCostRes.data || [])) {
      if (!row.project_id) continue;
      ensureCost(row.project_id);
      costMap[row.project_id].videoCostGbp += row.estimated_cost_gbp || 0;
      costMap[row.project_id].videoCount += 1;
    }
    for (const row of (genCostRes.data || [])) {
      if (!row.project_id) continue;
      ensureCost(row.project_id);
      costMap[row.project_id].imageCostGbp += row.estimated_cost_gbp || 0;
      costMap[row.project_id].imageCount += 1;
    }

    setProjects(
      rawProjects.map((p) => {
        const c = costMap[p.id] || { videoCostGbp: 0, videoCount: 0, imageCostGbp: 0, imageCount: 0 };
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          current_step: p.current_step,
          created_at: p.created_at,
          updated_at: p.updated_at,
          has_file: !!p.file_path,
          has_lyrics: !!p.lyrics,
          has_characters: charSet.has(p.id),
          has_scenes: sceneSet.has(p.id),
          has_renders: renderSet.has(p.id),
          totalCostGbp: c.videoCostGbp + c.imageCostGbp,
          jobCount: c.videoCount + c.imageCount,
          costs: c,
        };
      })
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
    toast.success("Dashboard updated");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const deletedProject = deleteTarget;
    try {
      // Delete related data first, then the project
      await Promise.all([
        supabase.from("render_jobs").delete().eq("project_id", deletedProject.id),
        supabase.from("scenes").delete().eq("project_id", deletedProject.id),
        supabase.from("characters").delete().eq("project_id", deletedProject.id),
      ]);
      await supabase.from("projects").delete().eq("id", deletedProject.id);
      setProjects((prev) => prev.filter((p) => p.id !== deletedProject.id));
      toast.success(`"${deletedProject.name}" deleted`, {
        action: {
          label: "Undo",
          onClick: async () => {
            // Re-create the project shell (related data is gone, but project card comes back)
            const { error } = await supabase.from("projects").insert({
              id: deletedProject.id,
              name: deletedProject.name,
              status: deletedProject.status as any,
              current_step: deletedProject.current_step,
              user_id: user!.id,
            });
            if (!error) {
              await loadProjects();
              toast.success(`"${deletedProject.name}" restored`);
            } else {
              toast.error("Could not undo deletion");
            }
          },
        },
        duration: 8000,
      });
    } catch {
      toast.error("Failed to delete project");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <Layout>
      <div className="container py-6 sm:py-10">
        {/* Production desk hero — full on first-run, compact once user has projects */}
        <div className="mb-6">
          <ProductionDeskHero
            compact={!loading && projects.length > 0}
            onTrySample={handleTrySample}
            seedingSample={seedingSample}
            creditsLabel={creditBalance !== null ? `${creditBalance} credits` : "Free tier"}
          />
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Recent projects</h2>
            <p className="text-xs text-muted-foreground">Your music video storyboards</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing} title="Refresh dashboard">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Link to="/project/new">
              <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" /> New Project
              </Button>
            </Link>
          </div>
        </motion.div>


        <Tabs defaultValue="projects" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="projects">Projects</TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Admin
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="projects" className="mt-0 space-y-0">
        {/* Total spend summary */}
        {!loading && projects.some(p => p.jobCount > 0) && (() => {
          const totals = projects.reduce((acc, p) => ({
            videoCost: acc.videoCost + p.costs.videoCostGbp,
            videoCount: acc.videoCount + p.costs.videoCount,
            imageCost: acc.imageCost + p.costs.imageCostGbp,
            imageCount: acc.imageCount + p.costs.imageCount,
          }), { videoCost: 0, videoCount: 0, imageCost: 0, imageCount: 0 });
          const totalGbp = totals.videoCost + totals.imageCost;
          const totalJobs = totals.videoCount + totals.imageCount;
          return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="mb-6 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Total Spend</h2>
                    <p className="text-xl font-bold text-foreground">
                      £{totalGbp.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">· R{(totalGbp * ZAR_RATE).toFixed(2)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-6 text-xs">
                  <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/50 px-4 py-2">
                    <span className="text-lg font-bold text-foreground">{totals.videoCount}</span>
                    <span className="text-muted-foreground">Videos</span>
                    <span className="font-medium text-foreground">£{totals.videoCost.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/50 px-4 py-2">
                    <span className="text-lg font-bold text-foreground">{totals.imageCount}</span>
                    <span className="text-muted-foreground">Images</span>
                    <span className="font-medium text-foreground">£{totals.imageCost.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/50 px-4 py-2">
                    <span className="text-lg font-bold text-foreground">{totalJobs}</span>
                    <span className="text-muted-foreground">Total Jobs</span>
                    <span className="font-medium text-foreground">~£{totalJobs > 0 ? (totalGbp / totalJobs).toFixed(3) : "0"}/ea</span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })()}

        {/* Spend over time chart */}
        {!loading && projects.some(p => p.jobCount > 0) && <SpendChart />}

        {/* Top-up (one-off purchases), redeem code & storage */}
        <div className="mb-8 space-y-4">
          <TopUpCard />
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Redeem a code</h2>
              <p className="text-xs text-muted-foreground">
                Add credits or stash a discount for your next one-off purchase.
              </p>
            </div>
            <CouponRedeemField variant="billing" />
          </div>
          <StorageOverview />
        </div>

        {loading ? (
          <CardGridSkeleton count={6} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, i) => {
              const s = statusConfig[project.status] || statusConfig.draft;
              const completed = getCompletedSteps(project);
              const doneCount = completed.filter(Boolean).length;
              const pct = Math.round((doneCount / 6) * 100);

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card-hover cursor-pointer p-6 relative group"
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                   {/* Rename button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget(project);
                        setRenameValue(project.name);
                      }}
                      className="absolute top-3 right-12 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      title="Rename project"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(project);
                      }}
                      className="absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/10 text-destructive hover:bg-destructive/20"
                      title="Delete project"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Music className="h-5 w-5" />
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.color}`}>
                      <s.icon className="h-3 w-3" />
                      {s.label}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold">{project.name}</h3>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <Bookmark className="h-3 w-3" />
                      {stepLabels[project.current_step] || "Upload"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      saved {new Date(project.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>

                  {/* Step completion progress */}
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Progress</span>
                      <span className="text-[10px] font-semibold text-foreground">{pct}%</span>
                    </div>
                    <div className="flex gap-1">
                      {stepLabels.map((label, idx) => (
                        <div key={label} className="group/step relative flex-1">
                          <div
                            className={`h-1.5 rounded-full transition-colors ${
                              completed[idx]
                                ? "bg-primary"
                                : idx === project.current_step
                                ? "bg-primary/40 animate-pulse"
                                : "bg-muted"
                            }`}
                          />
                          <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/step:opacity-100 transition-opacity">
                            <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-[9px] font-medium shadow-md border border-border ${completed[idx] ? "text-primary" : "text-muted-foreground"}`}>
                              {completed[idx] && <Check className="h-2.5 w-2.5" />}
                              {label}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cost summary with breakdown tooltip */}
                  {project.jobCount > 0 && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="mt-3 flex items-center gap-2 rounded-md bg-accent/10 px-2.5 py-1.5 cursor-help">
                            <DollarSign className="h-3.5 w-3.5 text-accent-foreground" />
                            <div className="flex flex-col">
                              <span className="text-[10px] font-semibold text-foreground">
                                £{project.totalCostGbp.toFixed(2)} · R{(project.totalCostGbp * ZAR_RATE).toFixed(2)}
                              </span>
                              <span className="text-[9px] text-muted-foreground">
                                {project.jobCount} generation{project.jobCount !== 1 ? "s" : ""} · ~£{(project.totalCostGbp / project.jobCount).toFixed(3)}/job
                              </span>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1.5 text-xs">
                            <p className="font-semibold border-b border-border pb-1">Cost Breakdown</p>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">🎬 Video ({project.costs.videoCount})</span>
                              <span className="font-medium">£{project.costs.videoCostGbp.toFixed(2)} · R{(project.costs.videoCostGbp * ZAR_RATE).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">🖼️ Image ({project.costs.imageCount})</span>
                              <span className="font-medium">£{project.costs.imageCostGbp.toFixed(2)} · R{(project.costs.imageCostGbp * ZAR_RATE).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4 border-t border-border pt-1 font-semibold">
                              <span>Total</span>
                              <span>£{project.totalCostGbp.toFixed(2)} · R{(project.totalCostGbp * ZAR_RATE).toFixed(2)}</span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  <div className="mt-3 text-xs text-muted-foreground">
                    Created {new Date(project.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at {new Date(project.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </div>
                </motion.div>
              );
            })}

            {/* New project card */}
            <Link to="/project/new">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: projects.length * 0.05 }}
                className="glass-card flex h-full min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 border-dashed border-border/50 p-6 transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Plus className="h-6 w-6" />
                </div>
                <span className="font-medium text-muted-foreground">Create New Project</span>
              </motion.div>
            </Link>
          </div>
        )}

        {!loading && projects.length === 0 && (
          <EmptyState
            icon={<Music className="h-12 w-12" />}
            title="No projects yet"
            description="Upload a track to create your first video treatment."
            action={
              <Link to="/project/new">
                <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> Upload Track
                </Button>
              </Link>
            }
          />
        )}
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin" className="mt-0 space-y-6">
              <div className="flex justify-end">
                <Link to="/admin?section=credits">
                  <Button variant="outline" className="gap-2">
                    <Wallet className="h-4 w-4" /> Open Credit Activity Log
                  </Button>
                </Link>
              </div>
              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="coupons">Coupons</TabsTrigger>
                  <TabsTrigger value="jobs">Jobs</TabsTrigger>
                  <TabsTrigger value="ops">Ops & Alerts</TabsTrigger>
                  <TabsTrigger value="metrics">Metrics</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-6"><OverviewSection /></TabsContent>
                <TabsContent value="coupons" className="mt-6"><CouponsSection /></TabsContent>
                <TabsContent value="jobs" className="mt-6"><JobsSection /></TabsContent>
                <TabsContent value="ops" className="mt-6"><OpsSection /></TabsContent>
                <TabsContent value="metrics" className="mt-6"><MetricsSection /></TabsContent>
              </Tabs>
            </TabsContent>
          )}

        </Tabs>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{deleteTarget?.name}"</strong>? This will permanently remove all scenes, characters, and render jobs associated with this project. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog */}
      <AlertDialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename Project</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={renaming}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename} disabled={renaming || !renameValue.trim()}>
              {renaming ? "Renaming…" : "Rename"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
