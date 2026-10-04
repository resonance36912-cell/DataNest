import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ScrollText,
  RefreshCw,
  Search,
  X,
  ShieldCheck,
  PlayCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Repeat,
  FileJson,
  Download,
} from "lucide-react";
import { AdminSection } from "../AdminSection";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const EVENT_TYPES = [
  "QA_RUN_STARTED",
  "QA_RUN_COMPLETED",
  "QA_RUN_FAILED",
  "NORMALIZE_RUN_STARTED",
  "NORMALIZE_RUN_COMPLETED",
  "NORMALIZE_RUN_FAILED",
  "NORMALIZE_RUN_FALLBACK",
] as const;

type EventType = (typeof EVENT_TYPES)[number];

interface AuditRow {
  id: string;
  event_type: EventType | string;
  entity_id: string | null;
  entity_type: string | null;
  project_id: string | null;
  user_id: string | null;
  payload: any;
  created_at: string;
  project_title?: string | null;
  actor_name?: string | null;
  job_status?: string | null;
  job_error?: string | null;
}

type KindFilter = "all" | "qa" | "normalize";
type OutcomeFilter = "all" | "started" | "completed" | "failed" | "fallback";

const LIMITS = ["50", "100", "250", "500"] as const;

function kindOf(eventType: string): "qa" | "normalize" | "other" {
  if (eventType.startsWith("QA_RUN_")) return "qa";
  if (eventType.startsWith("NORMALIZE_RUN_")) return "normalize";
  return "other";
}

function outcomeOf(eventType: string): "started" | "completed" | "failed" | "fallback" | "other" {
  if (eventType.endsWith("_STARTED")) return "started";
  if (eventType.endsWith("_COMPLETED")) return "completed";
  if (eventType.endsWith("_FAILED")) return "failed";
  if (eventType.endsWith("_FALLBACK")) return "fallback";
  return "other";
}

function eventBadge(eventType: string) {
  const outcome = outcomeOf(eventType);
  const cls =
    outcome === "completed"
      ? "bg-emerald-600/15 text-emerald-400 border-emerald-600/30"
      : outcome === "failed"
        ? "bg-red-600/15 text-red-400 border-red-600/30"
        : outcome === "fallback"
          ? "bg-amber-600/15 text-amber-400 border-amber-600/30"
          : outcome === "started"
            ? "bg-cyan-600/15 text-cyan-400 border-cyan-600/30"
            : "";
  const label = eventType
    .replace(/^QA_RUN_/, "QA · ")
    .replace(/^NORMALIZE_RUN_/, "Normalize · ")
    .toLowerCase()
    .replace(/^([a-z])/, (m) => m.toUpperCase());
  return (
    <Badge variant="outline" className={cls}>
      {label}
    </Badge>
  );
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const URL_KEYS = {
  kind: "qa_kind",
  outcome: "qa_outcome",
  q: "qa_q",
  project: "qa_project",
  scene: "qa_scene",
  actor: "qa_actor",
  limit: "qa_limit",
} as const;

export function QaAuditLogSection() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read once on mount; subsequent in-app changes are pushed to URL by the effect below.
  const initialRef = useRef(searchParams);
  const initial = initialRef.current;
  const initialLimit = (() => {
    const v = initial.get(URL_KEYS.limit);
    return (LIMITS as readonly string[]).includes(v ?? "") ? (v as (typeof LIMITS)[number]) : "100";
  })();
  const initialKind = (() => {
    const v = initial.get(URL_KEYS.kind);
    return v === "qa" || v === "normalize" || v === "all" ? (v as KindFilter) : "all";
  })();
  const initialOutcome = (() => {
    const v = initial.get(URL_KEYS.outcome);
    return v === "started" || v === "completed" || v === "failed" || v === "fallback" || v === "all"
      ? (v as OutcomeFilter)
      : "all";
  })();

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(initialLimit);
  const [kindFilter, setKindFilter] = useState<KindFilter>(initialKind);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>(initialOutcome);
  const [search, setSearch] = useState(initial.get(URL_KEYS.q) ?? "");
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [related, setRelated] = useState<{ before: AuditRow | null; jobs: any[] } | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [rerunBusy, setRerunBusy] = useState<Record<string, boolean>>({});
  const [projectFilter, setProjectFilter] = useState(initial.get(URL_KEYS.project) ?? "all");
  const [sceneFilter, setSceneFilter] = useState(initial.get(URL_KEYS.scene) ?? "");
  const [actorFilter, setActorFilter] = useState(initial.get(URL_KEYS.actor) ?? "all");
  const [exportingAll, setExportingAll] = useState(false);

  // Sync filter state back into the URL (replace, preserve unrelated params).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const apply = (key: string, value: string, isDefault: boolean) => {
          if (isDefault || !value) next.delete(key);
          else next.set(key, value);
        };
        apply(URL_KEYS.kind, kindFilter, kindFilter === "all");
        apply(URL_KEYS.outcome, outcomeFilter, outcomeFilter === "all");
        apply(URL_KEYS.q, search.trim(), !search.trim());
        apply(URL_KEYS.project, projectFilter, projectFilter === "all");
        apply(URL_KEYS.scene, sceneFilter.trim(), !sceneFilter.trim());
        apply(URL_KEYS.actor, actorFilter, actorFilter === "all");
        apply(URL_KEYS.limit, limit, limit === "100");
        return next;
      },
      { replace: true },
    );
  }, [kindFilter, outcomeFilter, search, projectFilter, sceneFilter, actorFilter, limit, setSearchParams]);


  const rerunQa = useCallback(
    async (row: AuditRow) => {
      const sceneId = row.payload?.scene_id ?? row.entity_id ?? null;
      const projectId = row.project_id ?? row.payload?.project_id ?? null;
      if (!sceneId) {
        toast.error("Cannot re-run: no scene_id on this event");
        return;
      }
      const key = `${row.id}`;
      setRerunBusy((b) => ({ ...b, [key]: true }));
      try {
        const { error } = await supabase.functions.invoke("scene-qa", {
          body: { scene_id: sceneId, project_id: projectId, source: "audit_log_rerun", origin_event_id: row.id },
        });
        if (error) throw error;
        toast.success("QA re-run started", {
          description: row.payload?.scene_number != null ? `Scene #${row.payload.scene_number}` : undefined,
        });
        // Allow the function to insert its STARTED/COMPLETED events before refresh
        setTimeout(() => { load(); }, 1200);
      } catch (e) {
        toast.error("QA re-run failed", { description: (e as Error).message });
      } finally {
        setRerunBusy((b) => ({ ...b, [key]: false }));
      }
    },
    // load is declared below; safe because rerunQa is only invoked after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: events, error } = await supabase
        .from("audit_events")
        .select("id, event_type, entity_id, entity_type, project_id, user_id, payload, created_at")
        .in("event_type", EVENT_TYPES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(parseInt(limit, 10));
      if (error) throw error;

      const projectIds = Array.from(
        new Set((events ?? []).map((e: any) => e.project_id).filter(Boolean)),
      ) as string[];
      const userIds = Array.from(
        new Set((events ?? []).map((e: any) => e.user_id).filter(Boolean)),
      ) as string[];

      const [{ data: projects }, { data: profiles }] = await Promise.all([
        projectIds.length
          ? supabase.from("projects").select("id, title").in("id", projectIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from("profiles").select("user_id, display_name").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const projectMap = new Map((projects ?? []).map((p: any) => [p.id, p.title]));
      const actorMap = new Map(
        (profiles ?? []).map((p: any) => [p.user_id, p.display_name || null]),
      );

      const jobIds = Array.from(
        new Set((events ?? []).map((e: any) => e.payload?.job_id).filter(Boolean)),
      ) as string[];
      let jobs: any[] = [];
      if (jobIds.length) {
        const { data: jobData } = await supabase
          .from("scene_qa_jobs")
          .select("id, status, error")
          .in("id", jobIds);
        jobs = jobData ?? [];
      }
      const jobMap = new Map(jobs.map((j: any) => [j.id, j]));

      const enriched: AuditRow[] = (events ?? []).map((e: any) => {
        const job = e.payload?.job_id ? jobMap.get(e.payload.job_id) : null;
        return {
          ...e,
          project_title: e.project_id ? projectMap.get(e.project_id) ?? null : null,
          actor_name: e.user_id ? actorMap.get(e.user_id) ?? null : null,
          job_status: job?.status ?? null,
          job_error: job?.error ?? null,
        };
      });
      setRows(enriched);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load audit log", {
        description: (e as Error).message,
      });
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.project_id && !map.has(r.project_id)) {
        map.set(r.project_id, r.project_title || r.project_id.slice(0, 8) + "…");
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const actorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.user_id && !map.has(r.user_id)) {
        map.set(r.user_id, r.actor_name || r.user_id.slice(0, 8) + "…");
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const s = sceneFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (kindFilter !== "all" && kindOf(r.event_type) !== kindFilter) return false;
      if (outcomeFilter !== "all" && outcomeOf(r.event_type) !== outcomeFilter) return false;
      if (projectFilter !== "all" && r.project_id !== projectFilter) return false;
      if (actorFilter !== "all" && r.user_id !== actorFilter) return false;
      if (s) {
        const matchesId = r.entity_id?.toLowerCase() === s;
        const matchesPayloadId = r.payload?.scene_id?.toLowerCase() === s;
        const matchesNumber = String(r.payload?.scene_number ?? "").includes(s);
        if (!matchesId && !matchesPayloadId && !matchesNumber) return false;
      }
      if (q) {
        const hay = [
          r.event_type,
          r.actor_name ?? "",
          r.user_id ?? "",
          r.project_title ?? "",
          r.project_id ?? "",
          r.entity_id ?? "",
          String(r.payload?.scene_number ?? ""),
          r.payload?.outcome ?? "",
          r.payload?.summary ?? "",
          r.payload?.error ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, kindFilter, outcomeFilter, search, projectFilter, sceneFilter, actorFilter]);

  const counts = useMemo(() => {
    const c = { qa: 0, normalize: 0, completed: 0, failed: 0 };
    for (const r of rows) {
      const k = kindOf(r.event_type);
      const o = outcomeOf(r.event_type);
      if (k === "qa") c.qa++;
      if (k === "normalize") c.normalize++;
      if (o === "completed") c.completed++;
      if (o === "failed") c.failed++;
    }
    return c;
  }, [rows]);

  const openDetails = useCallback(async (row: AuditRow) => {
    setSelected(row);
    setRelated(null);
    setRelatedLoading(true);
    try {
      const kind = kindOf(row.event_type);
      const sceneId = row.payload?.scene_id ?? row.entity_id ?? null;
      const jobId = row.payload?.job_id ?? null;
      const prefix = kind === "qa" ? "QA_RUN_" : kind === "normalize" ? "NORMALIZE_RUN_" : null;

      // Sibling "started" event for before/after pairing
      let beforeRow: AuditRow | null = null;
      if (prefix && sceneId && outcomeOf(row.event_type) !== "started") {
        const { data } = await supabase
          .from("audit_events")
          .select("id, event_type, entity_id, entity_type, project_id, user_id, payload, created_at")
          .eq("event_type", `${prefix}STARTED`)
          .lte("created_at", row.created_at)
          .or(`entity_id.eq.${sceneId},payload->>scene_id.eq.${sceneId}`)
          .order("created_at", { ascending: false })
          .limit(1);
        beforeRow = (data?.[0] as AuditRow) ?? null;
      }

      // Linked job rows
      let jobs: any[] = [];
      if (jobId) {
        const { data } = await supabase
          .from("scene_qa_jobs")
          .select("*")
          .eq("id", jobId)
          .limit(1);
        jobs = data ?? [];
      } else if (sceneId && kind !== "other") {
        const { data } = await supabase
          .from("scene_qa_jobs")
          .select("*")
          .eq("scene_id", sceneId)
          .eq("kind", kind)
          .order("created_at", { ascending: false })
          .limit(5);
        jobs = data ?? [];
      }

      setRelated({ before: beforeRow, jobs });
    } catch (e) {
      console.error(e);
    } finally {
      setRelatedLoading(false);
    }
  }, []);

  const exportCsv = useCallback(() => {
    const header = [
      "timestamp",
      "event_type",
      "actor",
      "actor_id",
      "project",
      "project_id",
      "scene_id",
      "scene_number",
      "request_id",
      "attempt",
      "outcome",
      "defects",
      "critical_defects",
      "error",
      "job_status",
      "job_error",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push(
        [
          r.created_at,
          r.event_type,
          r.actor_name ?? "",
          r.user_id ?? "",
          r.project_title ?? "",
          r.project_id ?? "",
          r.entity_id ?? "",
          r.payload?.scene_number ?? "",
          r.payload?.request_id ?? "",
          r.payload?.attempt ?? "",
          r.payload?.outcome ?? "",
          r.payload?.defects ?? "",
          r.payload?.critical_defects ?? "",
          (r.payload?.error ?? "").toString().slice(0, 300),
          r.job_status ?? "",
          (r.job_error ?? "").toString().slice(0, 300),
        ]
          .map(escape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-audit-${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const exportJson = useCallback(() => {
    const payload = filtered.map((r) => ({
      id: r.id,
      timestamp: r.created_at,
      event_type: r.event_type,
      actor: r.actor_name ?? null,
      actor_id: r.user_id ?? null,
      project: r.project_title ?? null,
      project_id: r.project_id ?? null,
      scene_id: r.entity_id ?? null,
      scene_number: r.payload?.scene_number ?? null,
      request_id: r.payload?.request_id ?? null,
      attempt: r.payload?.attempt ?? null,
      outcome: r.payload?.outcome ?? null,
      defects: r.payload?.defects ?? null,
      critical_defects: r.payload?.critical_defects ?? null,
      summary: r.payload?.summary ?? null,
      error: r.payload?.error ?? null,
      job_status: r.job_status ?? null,
      job_error: r.job_error ?? null,
      payload: r.payload ?? null,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-audit-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const exportAllServer = useCallback(
    async (format: "csv" | "json" = "csv") => {
      setExportingAll(true);
      const toastId = toast.loading("Preparing server-side export…");
      try {
        // Narrow event_type set server-side using current kind/outcome filters
        const eligibleTypes = (EVENT_TYPES as readonly string[]).filter((t) => {
          if (kindFilter !== "all" && kindOf(t) !== kindFilter) return false;
          if (outcomeFilter !== "all" && outcomeOf(t) !== outcomeFilter) return false;
          return true;
        });
        if (eligibleTypes.length === 0) {
          toast.dismiss(toastId);
          toast.message("No event types match the current filters");
          return;
        }

        const sceneRaw = sceneFilter.trim();
        const PAGE = 1000;
        const HARD_CAP = 50000;
        let from = 0;
        const all: any[] = [];

        // Paginate audit_events with server-side filters
        // eslint-disable-next-line no-constant-condition
        while (true) {
          let q = supabase
            .from("audit_events")
            .select(
              "id, event_type, entity_id, entity_type, project_id, user_id, payload, created_at",
            )
            .in("event_type", eligibleTypes)
            .order("created_at", { ascending: false })
            .range(from, from + PAGE - 1);

          if (projectFilter !== "all") q = q.eq("project_id", projectFilter);
          if (actorFilter !== "all") q = q.eq("user_id", actorFilter);
          if (sceneRaw) {
            // Match scene by UUID (entity_id / payload.scene_id) or scene_number text
            q = q.or(
              `entity_id.eq.${sceneRaw},payload->>scene_id.eq.${sceneRaw},payload->>scene_number.eq.${sceneRaw}`,
            );
          }

          const { data, error } = await q;
          if (error) throw error;
          const batch = data ?? [];
          all.push(...batch);
          toast.loading(`Fetched ${all.length} events…`, { id: toastId });
          if (batch.length < PAGE) break;
          from += PAGE;
          if (all.length >= HARD_CAP) {
            toast.warning(`Capped at ${HARD_CAP} rows — narrow filters for more`, { id: toastId });
            break;
          }
        }

        // Enrich projects, profiles, jobs
        const projectIds = Array.from(
          new Set(all.map((e: any) => e.project_id).filter(Boolean)),
        ) as string[];
        const userIds = Array.from(
          new Set(all.map((e: any) => e.user_id).filter(Boolean)),
        ) as string[];
        const jobIds = Array.from(
          new Set(all.map((e: any) => e.payload?.job_id).filter(Boolean)),
        ) as string[];

        const chunk = <T,>(arr: T[], n: number): T[][] => {
          const out: T[][] = [];
          for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
          return out;
        };
        const fetchInChunks = async <T,>(
          ids: string[],
          fn: (ids: string[]) => Promise<{ data: T[] | null }>,
        ): Promise<T[]> => {
          if (!ids.length) return [];
          const results: T[] = [];
          for (const part of chunk(ids, 500)) {
            const { data } = await fn(part);
            results.push(...((data as T[]) ?? []));
          }
          return results;
        };

        const [projects, profiles, jobs] = await Promise.all([
          fetchInChunks<any>(projectIds, (ids) =>
            supabase.from("projects").select("id, title").in("id", ids) as any,
          ),
          fetchInChunks<any>(userIds, (ids) =>
            supabase.from("profiles").select("user_id, display_name").in("user_id", ids) as any,
          ),
          fetchInChunks<any>(jobIds, (ids) =>
            supabase.from("scene_qa_jobs").select("id, status, error").in("id", ids) as any,
          ),
        ]);

        const projectMap = new Map(projects.map((p: any) => [p.id, p.title]));
        const actorMap = new Map(profiles.map((p: any) => [p.user_id, p.display_name || null]));
        const jobMap = new Map(jobs.map((j: any) => [j.id, j]));

        const enriched: AuditRow[] = all.map((e: any) => {
          const job = e.payload?.job_id ? jobMap.get(e.payload.job_id) : null;
          return {
            ...e,
            project_title: e.project_id ? projectMap.get(e.project_id) ?? null : null,
            actor_name: e.user_id ? actorMap.get(e.user_id) ?? null : null,
            job_status: job?.status ?? null,
            job_error: job?.error ?? null,
          };
        });

        // Apply the free-text search client-side (cannot be pushed to PostgREST cleanly)
        const q = search.trim().toLowerCase();
        const finalRows = q
          ? enriched.filter((r) => {
              const hay = [
                r.event_type,
                r.actor_name ?? "",
                r.user_id ?? "",
                r.project_title ?? "",
                r.project_id ?? "",
                r.entity_id ?? "",
                String(r.payload?.scene_number ?? ""),
                r.payload?.outcome ?? "",
                r.payload?.summary ?? "",
                r.payload?.error ?? "",
              ]
                .join(" ")
                .toLowerCase();
              return hay.includes(q);
            })
          : enriched;

        if (finalRows.length === 0) {
          toast.dismiss(toastId);
          toast.message("No matching rows to export");
          return;
        }

        const stamp = new Date().toISOString().slice(0, 19);
        let blob: Blob;
        let filename: string;

        if (format === "json") {
          const payload = finalRows.map((r) => ({
            id: r.id,
            timestamp: r.created_at,
            event_type: r.event_type,
            actor: r.actor_name ?? null,
            actor_id: r.user_id ?? null,
            project: r.project_title ?? null,
            project_id: r.project_id ?? null,
            scene_id: r.entity_id ?? null,
            scene_number: r.payload?.scene_number ?? null,
            request_id: r.payload?.request_id ?? null,
            attempt: r.payload?.attempt ?? null,
            outcome: r.payload?.outcome ?? null,
            defects: r.payload?.defects ?? null,
            critical_defects: r.payload?.critical_defects ?? null,
            summary: r.payload?.summary ?? null,
            error: r.payload?.error ?? null,
            job_status: r.job_status ?? null,
            job_error: r.job_error ?? null,
            payload: r.payload ?? null,
          }));
          blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
          filename = `qa-audit-all-${stamp}.json`;
        } else {
          const header = [
            "timestamp",
            "event_type",
            "actor",
            "actor_id",
            "project",
            "project_id",
            "scene_id",
            "scene_number",
            "request_id",
            "attempt",
            "outcome",
            "defects",
            "critical_defects",
            "error",
            "job_status",
            "job_error",
          ];
          const escape = (v: unknown) => {
            const s = v == null ? "" : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          };
          const lines = [header.join(",")];
          for (const r of finalRows) {
            lines.push(
              [
                r.created_at,
                r.event_type,
                r.actor_name ?? "",
                r.user_id ?? "",
                r.project_title ?? "",
                r.project_id ?? "",
                r.entity_id ?? "",
                r.payload?.scene_number ?? "",
                r.payload?.request_id ?? "",
                r.payload?.attempt ?? "",
                r.payload?.outcome ?? "",
                r.payload?.defects ?? "",
                r.payload?.critical_defects ?? "",
                (r.payload?.error ?? "").toString().slice(0, 300),
                r.job_status ?? "",
                (r.job_error ?? "").toString().slice(0, 300),
              ]
                .map(escape)
                .join(","),
            );
          }
          blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
          filename = `qa-audit-all-${stamp}.csv`;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${finalRows.length} rows`, { id: toastId });
      } catch (e) {
        console.error(e);
        toast.error("Server export failed", {
          id: toastId,
          description: (e as Error).message,
        });
      } finally {
        setExportingAll(false);
      }
    },
    [kindFilter, outcomeFilter, projectFilter, actorFilter, sceneFilter, search],
  );

  const activeFilterCount =
    (kindFilter !== "all" ? 1 : 0) +
    (outcomeFilter !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0) +
    (projectFilter !== "all" ? 1 : 0) +
    (sceneFilter.trim() ? 1 : 0) +
    (actorFilter !== "all" ? 1 : 0);

  return (
    <AdminSection
      title="QA Audit Log"
      description="Who re-ran scene QA or normalization, when, and what the outcome was."
      icon={ScrollText}
      action={
        <div className="flex items-center gap-2">
          <Select value={limit} onValueChange={(v) => setLimit(v as (typeof LIMITS)[number])}>
            <SelectTrigger className="h-8 w-[90px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LIMITS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportJson} disabled={filtered.length === 0}>
            <FileJson className="h-4 w-4 mr-1.5" />
            Export JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportAllServer("csv")}
            disabled={exportingAll}
            title="Fetches every row matching current filters from the server (bypasses page limit)"
          >
            <Download className={`h-4 w-4 mr-1.5 ${exportingAll ? "animate-pulse" : ""}`} />
            {exportingAll ? "Exporting…" : "Export all (server)"}
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Stat label="QA events" value={counts.qa} icon={<ShieldCheck className="h-3.5 w-3.5" />} />
        <Stat label="Normalize events" value={counts.normalize} icon={<PlayCircle className="h-3.5 w-3.5" />} />
        <Stat label="Completed" value={counts.completed} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />} />
        <Stat label="Failed" value={counts.failed} icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, project, scene, error…"
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
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="qa">QA only</SelectItem>
            <SelectItem value="normalize">Normalize only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={outcomeFilter} onValueChange={(v) => setOutcomeFilter(v as OutcomeFilter)}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="started">Started</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="fallback">Fallback</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={(v) => setProjectFilter(v)}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="All projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projectOptions.map(([id, title]) => (
              <SelectItem key={id} value={id}>{title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Input
            value={sceneFilter}
            onChange={(e) => setSceneFilter(e.target.value)}
            placeholder="Scene ID or #"
            className="h-8 w-[150px] text-xs"
          />
          {sceneFilter && (
            <button
              onClick={() => setSceneFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear scene filter"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Select value={actorFilter} onValueChange={(v) => setActorFilter(v)}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="All actors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            {actorOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeFilterCount > 0 && (
          <>
            <Badge variant="outline" className="text-[11px]">
              {filtered.length}/{rows.length}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => {
                setKindFilter("all");
                setOutcomeFilter("all");
                setSearch("");
                setProjectFilter("all");
                setSceneFilter("");
                setActorFilter("all");
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">Event</th>
              <th className="text-left px-3 py-2">Actor</th>
              <th className="text-left px-3 py-2">Project / Scene</th>
              <th className="text-left px-3 py-2">Result</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground py-8">
                  {loading ? "Loading…" : "No audit events match the current filter."}
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const p = r.payload ?? {};
              const sceneLabel = p.scene_number != null ? `Scene #${p.scene_number}` : "—";
              const isFailure = outcomeOf(r.event_type) === "failed";
              const isFallback = outcomeOf(r.event_type) === "fallback";
              return (
                <tr
                  key={r.id}
                  onClick={() => openDetails(r)}
                  className="border-t border-border/40 hover:bg-muted/30 align-top cursor-pointer"
                >

                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <div className="flex items-center gap-1 text-foreground/90">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {relTime(r.created_at)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{fmtTime(r.created_at)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {eventBadge(r.event_type)}
                      {p.attempt && (
                        <span className="text-[11px] text-muted-foreground">attempt #{p.attempt}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium">{r.actor_name ?? <span className="text-muted-foreground">unknown</span>}</div>
                    {r.user_id && (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {r.user_id.slice(0, 8)}…
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="truncate max-w-[220px]" title={r.project_title ?? r.project_id ?? ""}>
                      {r.project_title ?? (
                        <span className="text-muted-foreground">{r.project_id?.slice(0, 8) ?? "—"}…</span>
                      )}
                    </div>
                    <div className="text-muted-foreground">{sceneLabel}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {p.outcome && (
                      <div>
                        Outcome: <span className="font-medium">{p.outcome}</span>
                      </div>
                    )}
                    {typeof p.defects === "number" && (
                      <div className="text-muted-foreground">
                        {p.defects} defect{p.defects === 1 ? "" : "s"}
                        {p.critical_defects ? ` · ${p.critical_defects} critical` : ""}
                      </div>
                    )}
                    {p.summary && (
                      <div className="text-muted-foreground line-clamp-2 max-w-[320px]">{p.summary}</div>
                    )}
                    {(isFailure || isFallback) && p.error && (
                      <div className="text-red-400 line-clamp-2 max-w-[320px]">{p.error}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const sceneId = p.scene_id ?? r.entity_id ?? null;
                      const canRerun = kindOf(r.event_type) === "qa" && !!sceneId;
                      if (!canRerun) {
                        return <span className="text-[11px] text-muted-foreground">—</span>;
                      }
                      const busy = !!rerunBusy[r.id];
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={busy}
                          onClick={() => rerunQa(r)}
                        >
                          <Repeat className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`} />
                          {busy ? "Re-running…" : "Re-run QA"}
                        </Button>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <DetailsDrawer
        row={selected}
        related={related}
        loading={relatedLoading}
        rerunBusy={selected ? !!rerunBusy[selected.id] : false}
        onRerun={selected ? () => rerunQa(selected) : undefined}
        onClose={() => {
          setSelected(null);
          setRelated(null);
        }}
      />
    </AdminSection>
  );
}

function CopyableId({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`));
        }}
        className="font-mono text-[11px] hover:text-foreground text-foreground/80 truncate max-w-[260px]"
        title={value}
      >
        {value}
      </button>
    </div>
  );
}

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      <pre className="text-[11px] bg-muted/30 border border-border/40 rounded-md p-2 overflow-x-auto max-h-[260px]">
        {JSON.stringify(data ?? null, null, 2)}
      </pre>
    </div>
  );
}

function DetailsDrawer({
  row,
  related,
  loading,
  rerunBusy,
  onRerun,
  onClose,
}: {
  row: AuditRow | null;
  related: { before: AuditRow | null; jobs: any[] } | null;
  loading: boolean;
  rerunBusy?: boolean;
  onRerun?: () => void;
  onClose: () => void;
}) {
  const p = row?.payload ?? {};
  const sceneId = p?.scene_id ?? row?.entity_id ?? null;
  const jobId = p?.job_id ?? null;
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {eventBadge(row.event_type)}
                <span className="text-sm font-normal text-muted-foreground">
                  {relTime(row.created_at)}
                </span>
              </SheetTitle>
              <SheetDescription>{fmtTime(row.created_at)}</SheetDescription>
              {onRerun && kindOf(row.event_type) === "qa" && sceneId && (
                <div className="pt-2">
                  <Button size="sm" variant="outline" disabled={rerunBusy} onClick={onRerun}>
                    <Repeat className={`h-3.5 w-3.5 mr-1.5 ${rerunBusy ? "animate-spin" : ""}`} />
                    {rerunBusy ? "Re-running QA…" : "Re-run QA for this scene"}
                  </Button>
                </div>
              )}
            </SheetHeader>
            <ScrollArea className="flex-1 -mx-6 px-6 mt-3">
              <div className="space-y-4 pb-6">
                <div className="rounded-md border border-border/40 p-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Linked IDs
                  </div>
                  <CopyableId label="Event ID" value={row.id} />
                  <CopyableId label="Scene ID" value={sceneId} />
                  <CopyableId label="Job ID" value={jobId} />
                  <CopyableId label="Project ID" value={row.project_id} />
                  <CopyableId label="Actor ID" value={row.user_id} />
                  {p?.scene_number != null && (
                    <div className="flex items-center justify-between text-xs py-1">
                      <span className="text-muted-foreground">Scene #</span>
                      <span className="font-medium">{p.scene_number}</span>
                    </div>
                  )}
                  {p?.attempt != null && (
                    <div className="flex items-center justify-between text-xs py-1">
                      <span className="text-muted-foreground">Attempt</span>
                      <span className="font-medium">#{p.attempt}</span>
                    </div>
                  )}
                </div>

                {related?.before && related.before.id !== row.id ? (
                  <div className="grid grid-cols-1 gap-3">
                    <JsonBlock
                      title={`Before · ${related.before.event_type} · ${fmtTime(related.before.created_at)}`}
                      data={related.before.payload}
                    />
                    <JsonBlock title={`After · ${row.event_type}`} data={row.payload} />
                  </div>
                ) : (
                  <JsonBlock title="Payload" data={row.payload} />
                )}

                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Linked job records {loading && "· loading…"}
                  </div>
                  {related?.jobs?.length ? (
                    <div className="space-y-2">
                      {related.jobs.map((j) => (
                        <div
                          key={j.id}
                          className="rounded-md border border-border/40 p-2 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-[10px]">
                              {j.kind} · {j.status}
                            </Badge>
                            <span className="text-muted-foreground text-[10px]">
                              attempt #{j.attempt ?? 1} · {relTime(j.created_at)}
                            </span>
                          </div>
                          <CopyableId label="Job ID" value={j.id} />
                          {j.error && (
                            <div className="text-red-400 text-[11px] line-clamp-3">{j.error}</div>
                          )}
                          {j.output && (
                            <details>
                              <summary className="cursor-pointer text-muted-foreground text-[11px]">
                                Output
                              </summary>
                              <pre className="text-[10px] bg-muted/30 rounded p-2 mt-1 overflow-x-auto max-h-[180px]">
                                {JSON.stringify(j.output, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    !loading && (
                      <div className="text-xs text-muted-foreground italic">
                        No linked job records found.
                      </div>
                    )
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="glass-card px-3 py-2 flex items-center justify-between">
      <span className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
