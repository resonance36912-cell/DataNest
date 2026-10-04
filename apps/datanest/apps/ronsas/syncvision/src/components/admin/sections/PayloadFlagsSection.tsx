/**
 * PayloadFlagsSection — admin panel that lists recent render jobs across all
 * users along with the exact provider-payload flags recorded in
 * `render_jobs.input.wan_payload_flags` and any lip-sync QA warnings.
 *
 * Uses the `Admins can view all render jobs` RLS policy (has_role('admin'))
 * so non-admins still only see their own rows.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck, Volume2, VolumeX, Search, ExternalLink, Copy, Download, Frown, Pause, Play } from "lucide-react";
import { AdminSection } from "../AdminSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QaWarningTrendChart } from "./QaWarningTrendChart";

interface JobEvent {
  id: string;
  kind: string;
  from_value: string | null;
  to_value: string | null;
  source: string | null;
  payload: unknown;
  created_at: string;
}

type FilterKey = "all" | "leaks" | "lipsync_failures" | "audio_sent" | "audio_stripped";

interface PayloadFlags {
  endpoint?: string;
  keys_sent?: string[];
  has_audio_url?: boolean;
  duration?: unknown;
  resolution?: unknown;
  provider_model?: unknown;
}

interface JobInput {
  model?: string;
  audio_sent?: boolean;
  audio_stripped?: boolean;
  lipsync_mode?: string;
  is_broll?: boolean | null;
  is_instrumental?: boolean | null;
  is_aroll?: boolean | null;
  wan_payload_flags?: PayloadFlags;
}

interface JobRow {
  id: string;
  user_id: string;
  project_id: string | null;
  scene_number: number | null;
  tracking_id: string | null;
  provider: string | null;
  status: string | null;
  created_at: string;
  input: JobInput | null;
}

const LIPSYNC_DEDICATED = new Set(["sync-3", "sync-v2", "sync-so", "lipsync_dedicated"]);
const LIMIT_OPTIONS = [50, 100, 250, 500];

export function PayloadFlagsSection() {
  const [rows, setRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(0); // 0 = off
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const openJob = useCallback(async (id: string) => {
    setSelectedId(id);
    setEvents([]);
    setEventsLoading(true);
    const { data, error } = await supabase
      .from("render_job_events")
      .select("id, kind, from_value, to_value, source, payload, created_at")
      .eq("render_job_id", id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(`Failed to load job events: ${error.message}`);
    } else {
      setEvents((data ?? []) as JobEvent[]);
    }
    setEventsLoading(false);
  }, []);

  const copyJson = useCallback((value: unknown, label: string) => {
    try {
      navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  }, []);


  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("render_jobs")
      .select("id, user_id, project_id, scene_number, tracking_id, provider, status, created_at, input")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      setErr(error.message);
      toast.error(`Failed to load render jobs: ${error.message}`);
    } else {
      setRows((data ?? []) as JobRow[]);
      setLastRefreshed(new Date());
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh: pauses when tab is hidden or a details drawer is open so we
  // don't stomp on the drawer's selected row / rate-limit the DB in background.
  useEffect(() => {
    if (autoRefreshSec <= 0) return;
    const tick = () => {
      if (document.hidden) return;
      if (selectedId) return;
      load();
    };
    const id = window.setInterval(tick, autoRefreshSec * 1000);
    return () => window.clearInterval(id);
  }, [autoRefreshSec, selectedId, load]);


  const decorated = useMemo(() => rows.map((r) => {
    const inp = r.input ?? {};
    const mode = inp.lipsync_mode ?? "";
    const isDedicated = LIPSYNC_DEDICATED.has(inp.model ?? "") || LIPSYNC_DEDICATED.has(mode);
    const nonARoll = mode === "b_roll" || mode === "instrumental" || inp.is_broll === true || inp.is_instrumental === true || inp.is_aroll === false;
    const audioSent = inp.audio_sent === true;
    const audioStripped = inp.audio_stripped === true;
    const leak = !isDedicated && nonARoll && audioSent;
    const lipsyncFailure = isDedicated && !audioSent;
    return { row: r, mode, model: inp.model ?? null, audioSent, audioStripped, leak, lipsyncFailure, isDedicated, flags: inp.wan_payload_flags };
  }), [rows]);

  const counts = useMemo(() => ({
    total: decorated.length,
    leaks: decorated.filter((d) => d.leak).length,
    lipsync_failures: decorated.filter((d) => d.lipsyncFailure).length,
    audio_sent: decorated.filter((d) => d.audioSent).length,
    audio_stripped: decorated.filter((d) => d.audioStripped).length,
  }), [decorated]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decorated.filter((d) => {
      if (filter === "leaks" && !d.leak) return false;
      if (filter === "lipsync_failures" && !d.lipsyncFailure) return false;
      if (filter === "audio_sent" && !d.audioSent) return false;
      if (filter === "audio_stripped" && !d.audioStripped) return false;
      if (!q) return true;
      const hay = [
        d.row.id,
        d.row.user_id,
        d.row.project_id ?? "",
        d.row.tracking_id ?? "",
        `s${d.row.scene_number ?? ""}`,
        d.model ?? "",
        d.mode,
        d.row.provider ?? "",
        d.row.status ?? "",
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [decorated, filter, query]);

  const buildExportRows = useCallback(() => filtered.map((d) => {
    const inp = d.row.input ?? {};
    const flags = inp.wan_payload_flags ?? {};
    return {
      job_id: d.row.id,
      created_at: d.row.created_at,
      user_id: d.row.user_id,
      project_id: d.row.project_id,
      scene_number: d.row.scene_number,
      tracking_id: d.row.tracking_id,
      provider: d.row.provider,
      status: d.row.status,
      model: d.model,
      lipsync_mode: d.mode,
      is_aroll: inp.is_aroll ?? null,
      is_broll: inp.is_broll ?? null,
      is_instrumental: inp.is_instrumental ?? null,
      audio_sent: d.audioSent,
      audio_stripped: d.audioStripped,
      is_dedicated_lipsync: d.isDedicated,
      qa_leak: d.leak,
      qa_lipsync_failure: d.lipsyncFailure,
      endpoint: flags.endpoint ?? null,
      has_audio_url: flags.has_audio_url ?? null,
      keys_sent: flags.keys_sent ?? [],
      duration: flags.duration ?? null,
      resolution: flags.resolution ?? null,
      provider_model: flags.provider_model ?? null,
    };
  }), [filtered]);

  const download = (name: string, mime: string, content: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportJSON = useCallback(() => {
    const rows = buildExportRows();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    download(
      `render-jobs-qa-${filter}-${ts}.json`,
      "application/json",
      JSON.stringify({ exported_at: new Date().toISOString(), filter, query, count: rows.length, rows }, null, 2),
    );
    toast.success(`Exported ${rows.length} rows as JSON`);
  }, [buildExportRows, filter, query]);

  const exportCSV = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast.warning("No rows to export");
      return;
    }
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      if (v == null) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(",")),
    ].join("\n");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    download(`render-jobs-qa-${filter}-${ts}.csv`, "text/csv;charset=utf-8", csv);
    toast.success(`Exported ${rows.length} rows as CSV`);
  }, [buildExportRows, filter]);



  return (
    <AdminSection
      title="Payload flags & QA warnings"
      description="Audit provider payloads (audio_url, endpoint, keys) and lip-sync mode across all users. Admin-only via RLS."
      action={
        <div className="flex items-center gap-2">
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
            <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LIMIT_OPTIONS.map((n) => <SelectItem key={n} value={String(n)} className="text-xs">Last {n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0} className="gap-1.5 h-8">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportJSON} disabled={filtered.length === 0} className="gap-1.5 h-8">
            <Download className="h-3.5 w-3.5" /> JSON
          </Button>
          <Select value={String(autoRefreshSec)} onValueChange={(v) => setAutoRefreshSec(Number(v))}>
            <SelectTrigger
              className="h-8 w-[130px] text-xs gap-1.5"
              title={
                autoRefreshSec > 0 && lastRefreshed
                  ? `Last refreshed ${lastRefreshed.toLocaleTimeString()}`
                  : "Auto-refresh paused"
              }
            >
              {autoRefreshSec > 0
                ? <Play className="h-3 w-3 text-emerald-500" />
                : <Pause className="h-3 w-3 text-muted-foreground" />}
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0" className="text-xs">Auto-refresh off</SelectItem>
              <SelectItem value="10" className="text-xs">Every 10s</SelectItem>
              <SelectItem value="30" className="text-xs">Every 30s</SelectItem>
              <SelectItem value="60" className="text-xs">Every 1m</SelectItem>
              <SelectItem value="300" className="text-xs">Every 5m</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 h-8">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>

        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <SummaryCard label="Jobs shown" value={counts.total} tone="neutral" />
          <SummaryCard label="audio_url sent" value={counts.audio_sent} tone="neutral" icon={<Volume2 className="h-3.5 w-3.5" />} />
          <SummaryCard label="policy-stripped" value={counts.audio_stripped} tone="ok" icon={<VolumeX className="h-3.5 w-3.5" />} />
          <SummaryCard
            label={counts.leaks === 1 ? "QA warning" : "QA warnings"}
            value={counts.leaks}
            tone={counts.leaks > 0 ? "danger" : "ok"}
            icon={counts.leaks > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          />
        </div>

        <QaWarningTrendChart decorated={decorated} />


        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by job id, user id, project id, tracking id, model…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as FilterKey)} className="flex flex-wrap gap-1.5">
            <ToggleGroupItem value="all" className="h-7 rounded-full text-[11px] px-3 data-[state=on]:bg-foreground data-[state=on]:text-background">
              All <span className="ml-1 font-mono text-[10px] opacity-70">{counts.total}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="leaks" className="h-7 rounded-full text-[11px] px-3 gap-1 data-[state=on]:bg-destructive data-[state=on]:text-destructive-foreground data-[state=on]:border-destructive">
              <AlertTriangle className="h-3 w-3" /> Audio leaks <span className="font-mono text-[10px] opacity-70">{counts.leaks}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="lipsync_failures" className="h-7 rounded-full text-[11px] px-3 gap-1 data-[state=on]:bg-amber-500 data-[state=on]:text-amber-950 data-[state=on]:border-amber-500">
              <Frown className="h-3 w-3" /> Lip-sync failures <span className="font-mono text-[10px] opacity-70">{counts.lipsync_failures}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="audio_stripped" className="h-7 rounded-full text-[11px] px-3 gap-1 data-[state=on]:bg-emerald-500 data-[state=on]:text-emerald-950 data-[state=on]:border-emerald-500">
              <VolumeX className="h-3 w-3" /> Stripped <span className="font-mono text-[10px] opacity-70">{counts.audio_stripped}</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {err && <div className="text-xs text-destructive">Error: {err}</div>}

        <div className="rounded-md border border-border/50 overflow-hidden">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[110px]">When</TableHead>
                  <TableHead className="w-[70px]">Scene</TableHead>
                  <TableHead>User / Project</TableHead>
                  <TableHead className="w-[130px]">Model</TableHead>
                  <TableHead className="w-[130px]">Lipsync mode</TableHead>
                  <TableHead className="w-[110px]">audio_url</TableHead>
                  <TableHead>Keys sent</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[80px]">QA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-6">
                      {loading ? "Loading…" : "No jobs match this filter."}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((d) => {
                  const r = d.row;
                  return (
                    <TableRow
                      key={r.id}
                      onClick={(e) => {
                        // Ignore clicks on interactive elements (project link)
                        if ((e.target as HTMLElement).closest("a,button")) return;
                        openJob(r.id);
                      }}
                      className={`cursor-pointer hover:bg-muted/40 ${d.leak ? "bg-destructive/5" : ""}`}
                    >
                      <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        S{String(r.scene_number ?? "-").padStart(2, "0")}
                        {r.tracking_id && (
                          <div className="text-[9px] text-muted-foreground truncate max-w-[70px]" title={r.tracking_id}>{r.tracking_id}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-[10px]">
                        <div className="font-mono text-muted-foreground truncate max-w-[200px]" title={r.user_id}>{r.user_id.slice(0, 8)}…</div>
                        {r.project_id && (
                          <a
                            href={`/new-project?projectId=${r.project_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-primary hover:underline inline-flex items-center gap-1 truncate max-w-[200px]"
                            title={r.project_id}
                          >
                            {r.project_id.slice(0, 8)}… <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-[11px]">
                        <div className="font-mono">{d.model ?? "—"}</div>
                        <div className="text-[9px] text-muted-foreground font-mono truncate max-w-[130px]" title={d.flags?.endpoint}>
                          {d.flags?.endpoint?.replace("https://queue.fal.run/", "") ?? ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono px-1.5 py-0 ${
                            d.mode === "a_roll" ? "border-primary/40 text-primary bg-primary/5"
                              : d.mode === "b_roll" || d.mode === "instrumental" ? "border-muted-foreground/40 text-muted-foreground"
                              : d.mode === "lipsync_dedicated" ? "border-purple-500/40 text-purple-500 bg-purple-500/5"
                              : "border-border/50 text-foreground/70"
                          }`}
                        >
                          {d.mode || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {d.audioSent ? (
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 gap-0.5 ${
                              d.leak
                                ? "border-destructive/50 text-destructive bg-destructive/5"
                                : "border-emerald-500/40 text-emerald-500 bg-emerald-500/5"
                            }`}
                          >
                            <Volume2 className="h-2.5 w-2.5" /> sent
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-0.5 ${d.audioStripped ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5" : "border-muted-foreground/30 text-muted-foreground"}`}>
                            <VolumeX className="h-2.5 w-2.5" /> {d.audioStripped ? "stripped" : "omitted"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-0.5 max-w-[280px]">
                          {(d.flags?.keys_sent ?? []).map((k) => (
                            <span
                              key={k}
                              className={`font-mono text-[9px] px-1 py-0 rounded border ${
                                k === "audio_url"
                                  ? d.leak
                                    ? "border-destructive/50 text-destructive bg-destructive/10"
                                    : "border-amber-500/40 text-amber-500 bg-amber-500/5"
                                  : "border-border/50 text-foreground/70 bg-background/40"
                              }`}
                            >
                              {k}
                            </span>
                          ))}
                          {(!d.flags?.keys_sent || d.flags.keys_sent.length === 0) && (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px]">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{r.status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        {d.leak ? (
                          <Badge className="bg-destructive/15 text-destructive border-destructive/40 text-[10px] px-1.5 py-0 gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" /> leak
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> ok
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Sheet open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (() => {
            const inp = selected.input ?? {};
            const flags = inp.wan_payload_flags ?? {};
            const mode = inp.lipsync_mode ?? "";
            const isDedicated = LIPSYNC_DEDICATED.has(inp.model ?? "") || LIPSYNC_DEDICATED.has(mode);
            const nonARoll = mode === "b_roll" || mode === "instrumental" || inp.is_broll === true || inp.is_instrumental === true || inp.is_aroll === false;
            const leak = !isDedicated && nonARoll && inp.audio_sent === true;
            const warnings: { ts: string; kind: string; message: string; source?: string | null; payload?: unknown }[] = [];
            if (leak) {
              warnings.push({
                ts: selected.created_at,
                kind: "audio_leak",
                message: `audio_url forwarded on non-dedicated model "${inp.model ?? "?"}" for ${mode || "non-A-Roll"} scene`,
                source: "audit",
              });
            }
            if (isDedicated && inp.audio_sent !== true) {
              warnings.push({
                ts: selected.created_at,
                kind: "lipsync_failure",
                message: `Dedicated lip-sync model "${inp.model ?? "?"}" selected but audio_url was not forwarded`,
                source: "audit",
              });
            }
            for (const ev of events) {
              if (ev.kind === "error" && ev.to_value) {
                warnings.push({ ts: ev.created_at, kind: "error", message: ev.to_value, source: ev.source, payload: ev.payload });
              }
            }
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-base">
                    Render job S{String(selected.scene_number ?? "-").padStart(2, "0")}
                    {selected.tracking_id && (
                      <Badge variant="outline" className="text-[10px] font-mono">{selected.tracking_id}</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] font-mono">{selected.status ?? "—"}</Badge>
                  </SheetTitle>
                  <SheetDescription className="text-[11px] font-mono break-all">
                    Job {selected.id} · created {new Date(selected.created_at).toLocaleString()}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-4">
                  <section>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-xs font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" /> wan_payload_flags
                      </h4>
                      <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]" onClick={() => copyJson(flags, "Payload flags")}>
                        <Copy className="h-3 w-3" /> Copy
                      </Button>
                    </div>
                    <pre className="text-[10px] font-mono bg-muted/40 border border-border/50 rounded p-2 overflow-auto max-h-[280px] whitespace-pre-wrap break-all">
{JSON.stringify(flags, null, 2)}
                    </pre>
                  </section>

                  <section>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-xs font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> QA warnings ({warnings.length})
                      </h4>
                      {warnings.length > 0 && (
                        <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]" onClick={() => copyJson(warnings, "Warnings")}>
                          <Copy className="h-3 w-3" /> Copy
                        </Button>
                      )}
                    </div>
                    {warnings.length === 0 ? (
                      <div className="text-[11px] text-emerald-500 border border-emerald-500/30 bg-emerald-500/5 rounded p-2 flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" /> No warnings recorded for this job.
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {warnings.map((w, i) => (
                          <li key={i} className="border border-destructive/30 bg-destructive/5 rounded p-2 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline" className="text-[9px] font-mono border-destructive/40 text-destructive">{w.kind}</Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {new Date(w.ts).toLocaleString()}
                                {w.source ? ` · ${w.source}` : ""}
                              </span>
                            </div>
                            <div className="mt-1 text-foreground/90 break-words">{w.message}</div>
                            {w.payload != null && (
                              <pre className="mt-1 text-[9px] font-mono text-muted-foreground overflow-auto max-h-32 whitespace-pre-wrap break-all">
{JSON.stringify(w.payload, null, 2)}
                              </pre>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-xs font-semibold">Event timeline ({events.length})</h4>
                    </div>
                    {eventsLoading ? (
                      <div className="text-[11px] text-muted-foreground">Loading events…</div>
                    ) : events.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">No events recorded.</div>
                    ) : (
                      <ul className="space-y-1">
                        {events.map((ev) => (
                          <li key={ev.id} className="flex items-start gap-2 text-[10px] font-mono border-b border-border/30 pb-1">
                            <span className="text-muted-foreground whitespace-nowrap">{new Date(ev.created_at).toLocaleTimeString()}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">{ev.kind}</Badge>
                            <span className="text-foreground/80 break-all flex-1">
                              {ev.from_value ? `${ev.from_value} → ` : ""}{ev.to_value ?? "—"}
                            </span>
                            {ev.source && <span className="text-muted-foreground">[{ev.source}]</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-xs font-semibold">Full input</h4>
                      <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]" onClick={() => copyJson(inp, "Input")}>
                        <Copy className="h-3 w-3" /> Copy
                      </Button>
                    </div>
                    <pre className="text-[10px] font-mono bg-muted/40 border border-border/50 rounded p-2 overflow-auto max-h-[280px] whitespace-pre-wrap break-all">
{JSON.stringify(inp, null, 2)}
                    </pre>
                  </section>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </AdminSection>
  );
}

function SummaryCard({
  label, value, tone, icon,
}: {
  label: string;
  value: number;
  tone: "ok" | "danger" | "neutral";
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === "danger" ? "text-destructive border-destructive/40 bg-destructive/5"
      : tone === "ok" ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5"
      : "text-foreground border-border/50 bg-background/40";
  return (
    <div className={`rounded-md border px-3 py-2 flex items-center gap-2 ${toneCls}`}>
      {icon}
      <div>
        <div className="text-lg font-semibold leading-none">{value}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}
