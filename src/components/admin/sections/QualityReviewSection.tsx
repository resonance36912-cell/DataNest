import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  PlayCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Eye,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { SceneQualityDrawer, type SceneDrawerRow } from "./SceneQualityDrawer";
import { AdminSection } from "../AdminSection";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type QAStatus = "pending" | "running" | "passed" | "warning" | "failed" | "skipped" | null;

interface Defect {
  code?: string;
  severity?: "critical" | "warning" | "info" | string;
  description?: string;
}

interface QAReport {
  summary?: string;
  defects?: Defect[];
  frames_sampled?: number;
  model?: string;
  [k: string]: unknown;
}

interface SceneRow {
  id: string;
  project_id: string;
  user_id: string;
  scene_number: number;
  tracking_id: string | null;
  video_url: string | null;
  qa_status: QAStatus;
  qa_report: QAReport | null;
  qa_checked_at: string | null;
  qa_review_status?: string | null;
  qa_review_note?: string | null;
  qa_reviewed_at?: string | null;
  project_title?: string | null;
  merge_status?: string | null;
  merge_error_log?: string | null;
}

const STATUS_FILTERS = ["all", "failed", "warning", "passed", "pending", "skipped"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const LIMITS = ["50", "100", "200", "500"] as const;

function statusBadge(status: QAStatus) {
  switch (status) {
    case "passed":
      return <Badge className="bg-emerald-600/15 text-emerald-400 border-emerald-600/30">passed</Badge>;
    case "warning":
      return <Badge className="bg-amber-600/15 text-amber-400 border-amber-600/30">warning</Badge>;
    case "failed":
      return <Badge className="bg-red-600/15 text-red-400 border-red-600/30">failed</Badge>;
    case "running":
      return <Badge className="bg-cyan-600/15 text-cyan-400 border-cyan-600/30">running</Badge>;
    case "pending":
      return <Badge variant="outline">pending</Badge>;
    case "skipped":
      return <Badge variant="outline" className="opacity-60">skipped</Badge>;
    default:
      return <Badge variant="outline" className="opacity-60">—</Badge>;
  }
}

function mergeBadge(status?: string | null) {
  if (!status) return <span className="text-muted-foreground/60">—</span>;
  const s = status.toLowerCase();
  const cls =
    s.includes("fail") || s.includes("error")
      ? "bg-red-600/15 text-red-400 border-red-600/30"
      : s.includes("normaliz") || s.includes("pending") || s.includes("running") || s.includes("processing")
      ? "bg-cyan-600/15 text-cyan-400 border-cyan-600/30"
      : s === "done" || s === "completed" || s === "succeeded"
      ? "bg-emerald-600/15 text-emerald-400 border-emerald-600/30"
      : "";
  return <Badge variant="outline" className={cls}>{status}</Badge>;
}

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

type ReviewFilter = "any" | "unreviewed" | "approved" | "flagged";
type SeverityFilter = "any" | "critical" | "warning" | "info" | "none";
type PostprocessFilter = "any" | "done" | "failed" | "processing" | "none";

export function QualityReviewSection() {
  const [rows, setRows] = useState<SceneRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>("100");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("any");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("any");
  const [postprocessFilter, setPostprocessFilter] = useState<PostprocessFilter>("any");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, "qa" | "norm" | null>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [drawerScene, setDrawerScene] = useState<SceneDrawerRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: scenes, error } = await supabase
        .from("scenes")
        .select(
          "id, project_id, user_id, scene_number, tracking_id, video_url, qa_status, qa_report, qa_checked_at, qa_review_status, qa_review_note, qa_reviewed_at" as any,
        )
        .order("qa_checked_at", { ascending: false, nullsFirst: false })
        .limit(parseInt(limit, 10));
      if (error) throw error;

      const projectIds = Array.from(new Set((scenes ?? []).map((s: any) => s.project_id))).filter(Boolean);
      let projectMap = new Map<string, string>();
      let mergeMap = new Map<string, { status: string | null; err: string | null }>();
      if (projectIds.length > 0) {
        const [{ data: projects }, { data: jobs }] = await Promise.all([
          supabase.from("projects").select("id, title").in("id", projectIds),
          supabase
            .from("render_jobs")
            .select("project_id, scene_number, merge_status, merge_error_log, updated_at")
            .in("project_id", projectIds)
            .order("updated_at", { ascending: false }),
        ]);
        projectMap = new Map((projects ?? []).map((p: any) => [p.id, p.title]));
        for (const j of jobs ?? []) {
          const key = `${(j as any).project_id}:${(j as any).scene_number}`;
          if (!mergeMap.has(key)) {
            mergeMap.set(key, {
              status: (j as any).merge_status ?? null,
              err: (j as any).merge_error_log ?? null,
            });
          }
        }
      }

      const enriched: SceneRow[] = (scenes ?? []).map((s: any) => {
        const merge = mergeMap.get(`${s.project_id}:${s.scene_number}`);
        return {
          ...s,
          qa_report: (s.qa_report ?? null) as QAReport | null,
          project_title: projectMap.get(s.project_id) ?? null,
          merge_status: merge?.status ?? null,
          merge_error_log: merge?.err ?? null,
        };
      });
      setRows(enriched);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load scene quality data", {
        description: (e as Error).message,
      });
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchPostprocess = (status?: string | null) => {
      if (postprocessFilter === "any") return true;
      const s = (status ?? "").toLowerCase();
      if (postprocessFilter === "none") return !s;
      if (postprocessFilter === "done") return ["done", "completed", "succeeded"].includes(s);
      if (postprocessFilter === "failed") return s.includes("fail") || s.includes("error");
      if (postprocessFilter === "processing")
        return s.includes("pending") || s.includes("running") || s.includes("processing") || s.includes("normaliz");
      return true;
    };
    const matchSeverity = (defects: Defect[]) => {
      if (severityFilter === "any") return true;
      if (severityFilter === "none") return defects.length === 0;
      return defects.some((d) => (d.severity ?? "info") === severityFilter);
    };
    return rows.filter((r) => {
      if (filter !== "all" && (r.qa_status ?? "pending") !== filter) return false;
      if (reviewFilter !== "any" && (r.qa_review_status ?? "unreviewed") !== reviewFilter) return false;
      if (!matchPostprocess(r.merge_status)) return false;
      const defects = r.qa_report?.defects ?? [];
      if (!matchSeverity(defects)) return false;
      if (q) {
        const haystack = [
          r.tracking_id ?? "",
          `s${String(r.scene_number).padStart(2, "0")}`,
          `#${r.scene_number}`,
          r.project_title ?? "",
          r.project_id,
          r.qa_report?.summary ?? "",
          ...defects.map((d) => `${d.code ?? ""} ${d.description ?? ""}`),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, reviewFilter, severityFilter, postprocessFilter, search]);

  const activeFilterCount =
    (filter !== "all" ? 1 : 0) +
    (reviewFilter !== "any" ? 1 : 0) +
    (severityFilter !== "any" ? 1 : 0) +
    (postprocessFilter !== "any" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const clearFilters = () => {
    setFilter("all");
    setReviewFilter("any");
    setSeverityFilter("any");
    setPostprocessFilter("any");
    setSearch("");
  };

  const counts = useMemo(() => {
    const c = { passed: 0, warning: 0, failed: 0, pending: 0, skipped: 0 };
    for (const r of rows) {
      const k = (r.qa_status ?? "pending") as keyof typeof c;
      if (k in c) c[k]++;
    }
    return c;
  }, [rows]);

  const runQa = useCallback(
    async (scene: SceneRow) => {
      setBusy((b) => ({ ...b, [scene.id]: "qa" }));
      try {
        const { error } = await supabase.functions.invoke("scene-qa", {
          body: { scene_id: scene.id, project_id: scene.project_id },
        });
        if (error) throw error;
        toast.success(`QA re-run started for scene ${scene.scene_number}`);
        await load();
      } catch (e) {
        toast.error("QA re-run failed", { description: (e as Error).message });
      } finally {
        setBusy((b) => ({ ...b, [scene.id]: null }));
      }
    },
    [load],
  );

  const runNormalize = useCallback(
    async (scene: SceneRow) => {
      if (!scene.video_url) {
        toast.error("No video URL for this scene");
        return;
      }
      setBusy((b) => ({ ...b, [scene.id]: "norm" }));
      try {
        const { error } = await supabase.functions.invoke("normalize-scene-video", {
          body: {
            video_url: scene.video_url,
            scene_id: scene.id,
            scene_number: scene.scene_number,
            project_id: scene.project_id,
          },
        });
        if (error) throw error;
        toast.success(`Normalize re-run started for scene ${scene.scene_number}`);
      } catch (e) {
        toast.error("Normalize re-run failed", { description: (e as Error).message });
      } finally {
        setBusy((b) => ({ ...b, [scene.id]: null }));
      }
    },
    [],
  );

  const rerunAllFailed = useCallback(async () => {
    const targets = rows.filter((r) => r.qa_status === "failed");
    if (targets.length === 0) {
      toast.info("No failed scenes to re-run");
      return;
    }
    setBulkBusy(true);
    try {
      for (const s of targets) {
        await supabase.functions.invoke("scene-qa", {
          body: { scene_id: s.id, project_id: s.project_id },
        });
      }
      toast.success(`Re-ran QA on ${targets.length} failed scene${targets.length === 1 ? "" : "s"}`);
      await load();
    } catch (e) {
      toast.error("Bulk re-run failed", { description: (e as Error).message });
    } finally {
      setBulkBusy(false);
    }
  }, [rows, load]);

  return (
    <AdminSection
      title="Scene Quality Review"
      description="Postprocess status, automated QA reports, and quality-pass results across all scenes."
      icon={ShieldCheck}
      action={
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={limit} onValueChange={(v) => setLimit(v as (typeof LIMITS)[number])}>
            <SelectTrigger className="h-8 w-[90px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LIMITS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={rerunAllFailed}
            disabled={bulkBusy || loading || counts.failed === 0}
          >
            {bulkBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Re-run failed ({counts.failed})
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        {(["passed", "warning", "failed", "pending", "skipped"] as const).map((k) => (
          <div key={k} className="glass-card px-3 py-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
            <span className="text-lg font-semibold tabular-nums">{counts[k]}</span>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scene, project, defect…"
            className="h-8 pl-7 pr-7 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={reviewFilter} onValueChange={(v) => setReviewFilter(v as ReviewFilter)}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Review" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any review</SelectItem>
            <SelectItem value="unreviewed">Unreviewed</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any severity</SelectItem>
            <SelectItem value="critical">Has critical</SelectItem>
            <SelectItem value="warning">Has warning</SelectItem>
            <SelectItem value="info">Has info</SelectItem>
            <SelectItem value="none">No defects</SelectItem>
          </SelectContent>
        </Select>

        <Select value={postprocessFilter} onValueChange={(v) => setPostprocessFilter(v as PostprocessFilter)}>
          <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Postprocess" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any postprocess</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="none">No job</SelectItem>
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <>
            <Badge variant="outline" className="text-[11px]">
              {filtered.length}/{rows.length} match
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearFilters}
              className="h-8 text-xs"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear ({activeFilterCount})
            </Button>
          </>
        )}
      </div>


      <div className="overflow-x-auto rounded-md border border-border/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 w-8"></th>
              <th className="text-left px-3 py-2">Scene</th>
              <th className="text-left px-3 py-2">Project</th>
              <th className="text-left px-3 py-2">QA</th>
              <th className="text-left px-3 py-2">Postprocess</th>
              <th className="text-left px-3 py-2">Checked</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-8">
                {loading ? "Loading…" : "No scenes match the current filter."}
              </td></tr>
            )}
            {filtered.map((s) => {
              const isOpen = !!expanded[s.id];
              const defects = s.qa_report?.defects ?? [];
              const critical = defects.filter((d) => d.severity === "critical").length;
              return (
                <Fragment key={s.id}>
                  <tr key={s.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={isOpen ? "Collapse row" : "Expand row"}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <div>{s.tracking_id ?? `S${String(s.scene_number).padStart(2, "0")}`}</div>
                      <div className="text-muted-foreground">#{s.scene_number}</div>
                    </td>
                    <td className="px-3 py-2 max-w-[220px] truncate" title={s.project_title ?? s.project_id}>
                      {s.project_title ?? <span className="text-muted-foreground">{s.project_id.slice(0, 8)}…</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(s.qa_status)}
                        {s.qa_review_status === "approved" && (
                          <Badge className="bg-emerald-600/15 text-emerald-400 border-emerald-600/30">approved</Badge>
                        )}
                        {s.qa_review_status === "flagged" && (
                          <Badge className="bg-red-600/15 text-red-400 border-red-600/30">flagged</Badge>
                        )}
                        {critical > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-400">
                            <AlertTriangle className="h-3 w-3" /> {critical} critical
                          </span>
                        )}
                        {s.qa_status === "passed" && defects.length === 0 && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{mergeBadge(s.merge_status)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{relTime(s.qa_checked_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => { setDrawerScene(s as SceneDrawerRow); setDrawerOpen(true); }}
                          title="Open scene detail drawer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span className="ml-1">Details</span>
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => runQa(s)}
                          disabled={busy[s.id] === "qa"}
                          title="Re-run automated QA"
                        >
                          {busy[s.id] === "qa"
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />}
                          <span className="ml-1">QA</span>
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => runNormalize(s)}
                          disabled={busy[s.id] === "norm" || !s.video_url}
                          title="Re-run 1080p / -14 LUFS normalization"
                        >
                          {busy[s.id] === "norm"
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <PlayCircle className="h-3.5 w-3.5" />}
                          <span className="ml-1">Normalize</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${s.id}-detail`} className="border-t border-border/30 bg-muted/10">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="grid md:grid-cols-2 gap-4 text-xs">
                          <div>
                            <div className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">QA report</div>
                            {s.qa_report ? (
                              <div className="space-y-2">
                                {s.qa_report.summary && (
                                  <p className="text-foreground/90">{s.qa_report.summary}</p>
                                )}
                                {defects.length === 0 ? (
                                  <p className="text-emerald-400">No defects reported.</p>
                                ) : (
                                  <ul className="space-y-1">
                                    {defects.map((d, i) => (
                                      <li key={i} className="flex items-start gap-2">
                                        <Badge
                                          variant="outline"
                                          className={
                                            d.severity === "critical"
                                              ? "bg-red-600/15 text-red-400 border-red-600/30"
                                              : d.severity === "warning"
                                              ? "bg-amber-600/15 text-amber-400 border-amber-600/30"
                                              : ""
                                          }
                                        >
                                          {d.severity ?? "info"}
                                        </Badge>
                                        <div>
                                          <div className="font-mono">{d.code ?? "unknown"}</div>
                                          {d.description && (
                                            <div className="text-muted-foreground">{d.description}</div>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <div className="text-muted-foreground">
                                  {s.qa_report.frames_sampled ?? "?"} frames · {s.qa_report.model ?? "model n/a"}
                                </div>
                              </div>
                            ) : (
                              <p className="text-muted-foreground italic">No QA report yet. Run QA to generate one.</p>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Postprocess</div>
                            <div className="space-y-1">
                              <div>Merge status: {mergeBadge(s.merge_status)}</div>
                              {s.merge_error_log && (
                                <pre className="mt-1 whitespace-pre-wrap rounded bg-background/40 p-2 text-[11px] text-red-400 border border-red-600/20 max-h-40 overflow-auto">
                                  {s.merge_error_log}
                                </pre>
                              )}
                              {s.video_url && (
                                <a
                                  href={s.video_url}
                                  target="_blank" rel="noreferrer"
                                  className="text-cyan-400 hover:underline break-all"
                                >
                                  Open rendered video ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <SceneQualityDrawer
        scene={drawerScene}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onUpdated={load}
      />
    </AdminSection>
  );
}
