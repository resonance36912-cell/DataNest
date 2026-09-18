/**
 * JobsSection — admin diagnostics panel listing recent render jobs.
 *
 * Surfaces what's hard to debug from regular project pages: the raw
 * `render_jobs` row (id/jobId, project_id, scene_number, provider,
 * status, progress, retry_count, error, provider_task_id) plus
 * timestamps. `updated_at` is our proxy for "last reconcile" — it gets
 * bumped every time `check-job-status`, the fal webhook, or a server-side
 * cancel writes the row, which is exactly what we want for stuck-job triage.
 *
 * Admin-only; relies on RLS being satisfied by the owning admin's
 * `has_role` checks via the underlying SELECT policy on render_jobs.
 * (This is a debugging tool — admins typically need to expand RLS to
 * include cross-user reads. For now this still respects RLS and shows
 * jobs visible to the current admin user.)
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { Activity, RefreshCw, ClipboardCopy, Filter, RotateCw, XCircle, Repeat, History, Download, ArrowUp, ArrowDown } from "lucide-react";
import JobTimelineDrawer from "./JobTimelineDrawer";
import JobParamsPopover from "./JobParamsPopover";
import { AdminSection } from "../AdminSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RenderJobRow {
  id: string;
  user_id: string;
  project_id: string | null;
  scene_number: number;
  provider: string;
  provider_task_id: string | null;
  status: string;
  progress: number;
  retry_count: number;
  error: string | null;
  merge_status: string | null;
  created_at: string;
  updated_at: string;
  quality: string | null;
  assembly_profile_used: string | null;
  input: Record<string, unknown> | null;
  last_provider_update_at: string | null;
}

type SortKey = "created_at" | "updated_at" | "last_provider_update_at";
type SortDir = "asc" | "desc";

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-muted/50 text-muted-foreground border-muted-foreground/30",
  processing: "bg-primary/10 text-primary border-primary/30",
  submitted: "bg-primary/10 text-primary border-primary/30",
  succeeded: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  failed: "bg-destructive/10 text-destructive border-destructive/40",
  cancelled: "bg-muted/40 text-muted-foreground border-muted-foreground/30",
  canceled: "bg-muted/40 text-muted-foreground border-muted-foreground/30",
};

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (Number.isNaN(diff)) return "—";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

type AdminAction = "reconcile" | "cancel" | "retry";

const ACTIVE_STATUSES = new Set(["queued", "processing", "submitted"]);
const TERMINATED_STATUSES = new Set(["failed", "cancelled", "canceled", "completed", "succeeded"]);

export function JobsSection() {
  const [jobs, setJobs] = useState<RenderJobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  // Advanced filters
  const [dateFrom, setDateFrom] = useState<string>(""); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState<string>("");
  const [progressMin, setProgressMin] = useState<string>("");
  const [progressMax, setProgressMax] = useState<string>("");
  const [retryMin, setRetryMin] = useState<string>("");
  const [retryMax, setRetryMax] = useState<string>("");
  const [errorOnly, setErrorOnly] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Per-row in-flight action so we can disable the right button + show a spinner.
  const [pending, setPending] = useState<Record<string, AdminAction | null>>({});
  const [timelineJobId, setTimelineJobId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("render_jobs")
        .select("id,user_id,project_id,scene_number,provider,provider_task_id,status,progress,retry_count,error,merge_status,created_at,updated_at,quality,assembly_profile_used,input")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const baseRows = (data as Omit<RenderJobRow, "last_provider_update_at">[]) ?? [];
      // Fetch latest provider-sourced event (webhook/poll/admin reconcile) per job
      // to surface the true "last successful provider update" — distinct from
      // updated_at which can be bumped by client-side writes too.
      const ids = baseRows.map((r) => r.id);
      const lastByJob: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: events, error: evErr } = await supabase
          .from("render_job_events")
          .select("render_job_id,created_at,source")
          .in("render_job_id", ids)
          .in("source", ["system", "admin"])
          .order("created_at", { ascending: false })
          .limit(2000);
        if (evErr) throw evErr;
        for (const ev of (events ?? []) as Array<{ render_job_id: string; created_at: string }>) {
          if (!lastByJob[ev.render_job_id]) lastByJob[ev.render_job_id] = ev.created_at;
        }
      }
      setJobs(baseRows.map((r) => ({ ...r, last_provider_update_at: lastByJob[r.id] ?? null })));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load render jobs";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Parse numeric/date bounds once. Empty string -> no bound.
    const pMin = progressMin === "" ? -Infinity : Number(progressMin);
    const pMax = progressMax === "" ? Infinity : Number(progressMax);
    const rMin = retryMin === "" ? -Infinity : Number(retryMin);
    const rMax = retryMax === "" ? Infinity : Number(retryMax);
    // Inclusive day range: treat dateTo as end-of-day so "today" includes today.
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity;

    return jobs.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (errorOnly && !j.error) return false;
      const created = new Date(j.created_at).getTime();
      if (created < fromTs || created > toTs) return false;
      const prog = j.progress ?? 0;
      if (prog < pMin || prog > pMax) return false;
      const retries = j.retry_count ?? 0;
      if (retries < rMin || retries > rMax) return false;
      if (!q) return true;
      return (
        j.id.toLowerCase().includes(q) ||
        (j.project_id || "").toLowerCase().includes(q) ||
        (j.provider_task_id || "").toLowerCase().includes(q) ||
        j.provider.toLowerCase().includes(q)
      );
    });
  }, [jobs, statusFilter, search, dateFrom, dateTo, progressMin, progressMax, retryMin, retryMax, errorOnly]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = a[sortKey] ? new Date(a[sortKey] as string).getTime() : null;
      const bv = b[sortKey] ? new Date(b[sortKey] as string).getTime() : null;
      // Nulls always sort last regardless of direction.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortDir === "asc"
        ? <ArrowUp className="h-2.5 w-2.5 inline ml-1" />
        : <ArrowDown className="h-2.5 w-2.5 inline ml-1" />
      : null;

  const activeAdvancedCount =
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) +
    (progressMin !== "" ? 1 : 0) + (progressMax !== "" ? 1 : 0) +
    (retryMin !== "" ? 1 : 0) + (retryMax !== "" ? 1 : 0) +
    (errorOnly ? 1 : 0);

  const resetAdvanced = () => {
    setDateFrom(""); setDateTo("");
    setProgressMin(""); setProgressMax("");
    setRetryMin(""); setRetryMax("");
    setErrorOnly(false);
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  };

  /**
   * Invoke the admin-only edge function for a per-row action. The function
   * validates the caller's admin role server-side; we still gate the UI to
   * avoid spamming requests for actions that obviously can't apply (e.g.
   * cancelling a job that's already failed).
   */
  const runAction = useCallback(async (job: RenderJobRow, action: AdminAction) => {
    if (pending[job.id]) return;
    if (action === "cancel" && !ACTIVE_STATUSES.has(job.status)) {
      toast.info(`Job is ${job.status} — nothing to cancel.`);
      return;
    }
    if (action === "retry" && !TERMINATED_STATUSES.has(job.status)) {
      toast.info(`Job is ${job.status} — wait for it to finish before retrying.`);
      return;
    }
    if (action === "cancel" && !confirm(`Cancel job ${shortId(job.id)}? This marks it as cancelled in the database.`)) {
      return;
    }
    if (action === "retry" && !confirm(`Re-queue job ${shortId(job.id)}? It will be picked up again by the worker.`)) {
      return;
    }
    setPending((p) => ({ ...p, [job.id]: action }));
    try {
      const { data, error } = await supabase.functions.invoke("admin-render-job-action", {
        body: { jobId: job.id, action },
      });
      if (error) throw error;
      const result = data as { ok?: boolean; skipped?: boolean; message?: string; upstream_status?: number };
      if (result?.skipped) {
        toast.info(result.message ?? "No change applied.");
      } else if (result?.ok === false) {
        toast.error(result.message ?? "Action failed.");
      } else {
        const detail = action === "reconcile" && result?.upstream_status
          ? ` (upstream ${result.upstream_status})`
          : "";
        toast.success(`${action[0].toUpperCase()}${action.slice(1)} ${shortId(job.id)} ok${detail}`);
      }
      // Refresh after any successful mutation so the row reflects new state.
      load();
    } catch (e) {
      const message = e instanceof Error ? e.message : `Failed to ${action}`;
      toast.error(message);
    } finally {
      setPending((p) => ({ ...p, [job.id]: null }));
    }
  }, [pending, load]);

  /**
   * Export the currently *filtered* job list as CSV. We snapshot exactly what
   * the admin sees so a downloaded file can be shared for debugging without
   * requiring the recipient to re-create the filter combination. RFC 4180
   * escaping (double-quote wrap + `""` for embedded quotes) handles error
   * messages and stringified JSON safely.
   */
  const exportCsv = useCallback(() => {
    if (filtered.length === 0) {
      toast.info("No jobs to export with the current filters.");
      return;
    }
    const headers = [
      "id", "user_id", "project_id", "scene_number", "provider",
      "provider_task_id", "quality", "assembly_profile_used",
      "status", "progress", "retry_count", "merge_status",
      "error", "created_at", "updated_at", "last_provider_update_at", "input_json",
    ];
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "string" ? v : (typeof v === "object" ? JSON.stringify(v) : String(v));
      // Wrap if contains comma, quote, or newline; double inner quotes.
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = sorted.map((j) => [
      j.id, j.user_id, j.project_id, j.scene_number, j.provider,
      j.provider_task_id, j.quality, j.assembly_profile_used,
      j.status, j.progress, j.retry_count, j.merge_status,
      j.error, j.created_at, j.updated_at, j.last_provider_update_at, j.input,
    ].map(escape).join(","));
    // BOM keeps Excel from mangling UTF-8 (e.g. emoji in error messages).
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `render-jobs-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${sorted.length} job${sorted.length === 1 ? "" : "s"}`);
  }, [sorted]);


  return (
    <AdminSection
      icon={Activity}
      title="Render Jobs Diagnostics"
      description="Most recent 100 render jobs — status, progress, jobIds, and last reconcile timestamps"
      action={
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
    >
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search id, project, task id, provider…"
              className="h-8 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <Filter className="h-3 w-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant={errorOnly ? "default" : "outline"}
            className="h-8 text-[11px] gap-1"
            onClick={() => setErrorOnly((v) => !v)}
            title="Show only jobs with an error message"
          >
            Errors only
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[11px] gap-1"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <Filter className="h-3 w-3" />
            Advanced{activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ""}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[11px] gap-1"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title="Download the filtered list as CSV"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {filtered.length} / {jobs.length}
          </span>
        </div>

        {showAdvanced && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Created date</div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-7 text-[11px]"
                  aria-label="From date"
                />
                <span className="text-[10px] text-muted-foreground">→</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-7 text-[11px]"
                  aria-label="To date"
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Progress %</div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number" min={0} max={100} placeholder="min"
                  value={progressMin}
                  onChange={(e) => setProgressMin(e.target.value)}
                  className="h-7 text-[11px]"
                />
                <span className="text-[10px] text-muted-foreground">→</span>
                <Input
                  type="number" min={0} max={100} placeholder="max"
                  value={progressMax}
                  onChange={(e) => setProgressMax(e.target.value)}
                  className="h-7 text-[11px]"
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Retry count</div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number" min={0} placeholder="min"
                  value={retryMin}
                  onChange={(e) => setRetryMin(e.target.value)}
                  className="h-7 text-[11px]"
                />
                <span className="text-[10px] text-muted-foreground">→</span>
                <Input
                  type="number" min={0} placeholder="max"
                  value={retryMax}
                  onChange={(e) => setRetryMax(e.target.value)}
                  className="h-7 text-[11px]"
                />
              </div>
            </div>
            <div className="md:col-span-3 flex justify-end">
              <Button
                size="sm" variant="ghost"
                className="h-7 text-[11px]"
                onClick={resetAdvanced}
                disabled={activeAdvancedCount === 0}
              >
                Reset advanced
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className="max-h-[640px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wider">Job</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Scene</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Provider</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Progress</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Retries</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">
                  <button onClick={() => toggleSort("created_at")} className="hover:text-foreground">
                    Created<SortIcon k="created_at" />
                  </button>
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">
                  <button onClick={() => toggleSort("updated_at")} className="hover:text-foreground">
                    Last reconcile<SortIcon k="updated_at" />
                  </button>
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">
                  <button onClick={() => toggleSort("last_provider_update_at")} className="hover:text-foreground" title="Most recent webhook/poll/admin event recorded for this job">
                    Last provider update<SortIcon k="last_provider_update_at" />
                  </button>
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-8">
                    No jobs match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((j) => {
                const badgeClass = STATUS_BADGE[j.status] || STATUS_BADGE.queued;
                return (
                  <TableRow key={j.id} className="text-xs">
                    <TableCell className="font-mono">
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => copy(j.id, "Job id")}
                          title={j.id}
                          className="inline-flex items-center gap-1 text-left hover:text-primary"
                        >
                          {shortId(j.id)} <ClipboardCopy className="h-2.5 w-2.5 opacity-50" />
                        </button>
                        {j.project_id && (
                          <button
                            onClick={() => copy(j.project_id!, "Project id")}
                            title={`project: ${j.project_id}`}
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            p:{shortId(j.project_id)}
                          </button>
                        )}
                        {j.provider_task_id && (
                          <button
                            onClick={() => copy(j.provider_task_id!, "Task id")}
                            title={`task: ${j.provider_task_id}`}
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            t:{shortId(j.provider_task_id)}
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{j.scene_number ?? "—"}</TableCell>
                    <TableCell>
                      <span className="font-mono text-[11px]">{j.provider}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`${badgeClass} text-[10px]`}>
                        {j.status}
                      </Badge>
                      {j.merge_status && j.merge_status !== "pending" && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          merge: {j.merge_status}
                        </div>
                      )}
                      {j.error && (
                        <div className="text-[10px] text-destructive/80 mt-0.5 max-w-[220px] truncate" title={j.error}>
                          {j.error}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${Math.max(0, Math.min(100, j.progress || 0))}%` }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {Math.round(j.progress || 0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{j.retry_count}</TableCell>
                    <TableCell title={j.created_at} className="text-muted-foreground">
                      {fmtRelative(j.created_at)}
                    </TableCell>
                    <TableCell title={j.updated_at} className="text-muted-foreground">
                      {fmtRelative(j.updated_at)}
                    </TableCell>
                    <TableCell
                      title={j.last_provider_update_at ?? "No provider event recorded"}
                      className="text-muted-foreground"
                    >
                      {j.last_provider_update_at ? fmtRelative(j.last_provider_update_at) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const busy = pending[j.id];
                        const canCancel = ACTIVE_STATUSES.has(j.status);
                        const canRetry = TERMINATED_STATUSES.has(j.status);
                        const canReconcile = !!j.provider_task_id || ACTIVE_STATUSES.has(j.status);
                        return (
                          <div className="flex items-center justify-end gap-1">
                            <JobParamsPopover
                              jobId={j.id}
                              provider={j.provider}
                              quality={j.quality}
                              assemblyProfile={j.assembly_profile_used}
                              input={j.input}
                            />
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setTimelineJobId(j.id)}
                              title="Open transition timeline"
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0"
                              disabled={!!busy || !canReconcile}
                              onClick={() => runAction(j, "reconcile")}
                              title="Reconcile — re-fetch provider state"
                            >
                              {busy === "reconcile"
                                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                : <RotateCw className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={!!busy || !canCancel}
                              onClick={() => runAction(j, "cancel")}
                              title={canCancel ? "Cancel this job" : `Cannot cancel ${j.status} job`}
                            >
                              {busy === "cancel"
                                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                : <XCircle className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0"
                              disabled={!!busy || !canRetry}
                              onClick={() => runAction(j, "retry")}
                              title={canRetry ? "Re-queue this job" : `Cannot retry ${j.status} job`}
                            >
                              {busy === "retry"
                                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                : <Repeat className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        “Last reconcile” reflects <code className="font-mono">render_jobs.updated_at</code>, bumped on every
        provider poll, webhook write, and server-side status mutation.
        “Last provider update” is the most recent <code className="font-mono">render_job_events</code> row
        sourced from a webhook, polling worker, or admin reconcile — i.e. the last time the provider actually
        responded. Click any timestamp header to sort.
      </p>
      <JobTimelineDrawer jobId={timelineJobId} onClose={() => setTimelineJobId(null)} />
    </AdminSection>
  );
}
