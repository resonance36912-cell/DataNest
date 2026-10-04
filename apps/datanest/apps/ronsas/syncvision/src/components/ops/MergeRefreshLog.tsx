/**
 * MergeRefreshLog — Admin-only sub-panel rendering the merge Force-refresh
 * audit trail. Pulls from the same `audit_events` rows the parent OpsCockpit
 * already fetched, filtered to event_type = 'MERGE_FORCE_REFRESH'.
 *
 * Each refresh emits two rows: an attempt outcome (success / error / cooldown)
 * and an effectiveness verdict (effective / ineffective) ~6s later. We render
 * them inline so admins can spot ineffective providers at a glance.
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditEvent {
  id: string;
  project_id: string | null;
  user_id: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface MergeRefreshLogProps {
  events: AuditEvent[];
  debugMode?: boolean;
}

const OUTCOME_META: Record<string, { color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  success:     { color: "text-cyan-500",    bg: "bg-cyan-500/10",    Icon: RefreshCw },
  effective:   { color: "text-green-500",   bg: "bg-green-500/10",   Icon: CheckCircle2 },
  ineffective: { color: "text-amber-500",   bg: "bg-amber-500/10",   Icon: AlertTriangle },
  error:       { color: "text-destructive", bg: "bg-destructive/10", Icon: XCircle },
  cooldown:    { color: "text-muted-foreground", bg: "bg-muted/50",  Icon: Clock },
};

export default function MergeRefreshLog({ events, debugMode = false }: MergeRefreshLogProps) {
  const merge = useMemo(
    () => events.filter((e) => e.event_type === "MERGE_FORCE_REFRESH"),
    [events],
  );

  const counts = useMemo(() => {
    const c = { total: merge.length, effective: 0, ineffective: 0, error: 0, cooldown: 0 };
    for (const e of merge) {
      const o = String(e.payload?.outcome ?? "");
      if (o === "effective") c.effective++;
      else if (o === "ineffective") c.ineffective++;
      else if (o === "error") c.error++;
      else if (o === "cooldown") c.cooldown++;
    }
    return c;
  }, [merge]);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-cyan-500" />
          <h3 className="text-sm font-semibold">Merge Force-Refresh Log</h3>
          <Badge variant="outline" className="text-xs">{counts.total}</Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="text-green-500">{counts.effective} effective</span>
          <span>·</span>
          <span className="text-amber-500">{counts.ineffective} ineffective</span>
          <span>·</span>
          <span className="text-destructive">{counts.error} errors</span>
          <span>·</span>
          <span>{counts.cooldown} cooldown</span>
        </div>
      </div>

      <ScrollArea className="h-[260px] rounded-lg border">
        <div className="divide-y">
          {merge.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">
              No merge Force-refresh attempts logged yet.
            </p>
          ) : (
            merge.map((e) => {
              const outcome = String(e.payload?.outcome ?? "");
              const source = String(e.payload?.source ?? "");
              const attempt = e.payload?.attempt as number | null | undefined;
              const durationMs = e.payload?.duration_ms as number | null | undefined;
              const error = e.payload?.error as string | null | undefined;
              const jobId = String(e.payload?.merge_job_id ?? e.entity_id ?? "");
              const meta = OUTCOME_META[outcome] || OUTCOME_META.cooldown;
              const Icon = meta.Icon;
              return (
                <div key={e.id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge className={cn("text-[10px] uppercase border-0 gap-1", meta.bg, meta.color)}>
                        <Icon className="h-3 w-3" />
                        {outcome || "—"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground truncate">{source}</span>
                      {attempt != null && (
                        <span className="text-[10px] text-muted-foreground">#{attempt}</span>
                      )}
                      {durationMs != null && (
                        <span className="text-[10px] text-muted-foreground">{durationMs}ms</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    job {jobId.slice(0, 8)}…
                    {error ? ` · ${error}` : ""}
                  </p>
                  {debugMode && (
                    <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-1 overflow-auto max-h-24">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
