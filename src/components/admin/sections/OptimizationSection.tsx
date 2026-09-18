import { useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCw, Check, X, Play, Undo2, Clock } from "lucide-react";
import { AdminSection } from "../AdminSection";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  validateTransition,
  REQUIRES_NOTE,
} from "@/lib/optimizationLifecycle";
import { HubStatusStrip } from "./HubStatusStrip";

type Status = "pending" | "approved" | "rejected" | "applied" | "reverted";

interface Suggestion {
  id: string;
  source: string;
  category: string;
  title: string;
  rationale: string;
  evidence: Record<string, unknown>;
  target_key: string | null;
  current_value: unknown;
  suggested_value: unknown;
  status: Status;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  reverted_at: string | null;
  created_at: string;
}

interface Tunable {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

type Action = "approved" | "rejected" | "apply" | "revert";

const STATUS_VARIANTS: Record<Status, "secondary" | "default" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  applied: "default",
  reverted: "outline",
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
  reverted: "Reverted",
};

const ACTION_COPY: Record<Action, { title: string; verb: string; needsNote: boolean }> = {
  approved: { title: "Approve suggestion", verb: "Approve", needsNote: false },
  rejected: { title: "Reject suggestion", verb: "Reject", needsNote: true },
  apply:    { title: "Apply suggestion",  verb: "Apply",  needsNote: false },
  revert:   { title: "Revert suggestion", verb: "Revert", needsNote: true },
};

function fmt(ts: string | null) {
  return ts ? new Date(ts).toLocaleString() : "—";
}

export function OptimizationSection() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [tunables, setTunables] = useState<Tunable[]>([]);
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "all">("pending");
  const [dialog, setDialog] = useState<{ suggestion: Suggestion; action: Action } | null>(null);
  const [note, setNote] = useState("");

  async function load() {
    setLoading(true);
    const [sug, tun] = await Promise.all([
      supabase
        .from("optimization_suggestions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("pipeline_tunables").select("*").order("key"),
    ]);
    if (sug.error) toast.error(`Suggestions: ${sug.error.message}`);
    if (tun.error) toast.error(`Tunables: ${tun.error.message}`);
    const list = (sug.data ?? []) as Suggestion[];
    setItems(list);
    setTunables((tun.data ?? []) as Tunable[]);

    const ids = Array.from(new Set(list.map((s) => s.reviewed_by).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", ids);
      const map: Record<string, string> = {};
      (profiles ?? []).forEach((p: any) => {
        if (p.user_id) map[p.user_id] = p.display_name || p.user_id.slice(0, 8);
      });
      setReviewerNames(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("optimization_suggestions_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "optimization_suggestions" },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  async function runScan() {
    setScanning(true);
    const { data, error } = await supabase.functions.invoke("generate-optimization-suggestions");
    setScanning(false);
    if (error) return toast.error(`Scan failed: ${error.message}`);
    toast.success(`Generated ${data?.generated ?? 0} suggestions`);
    void load();
  }

  function openAction(suggestion: Suggestion, action: Action) {
    setDialog({ suggestion, action });
    setNote(suggestion.review_notes ?? "");
  }

  async function confirm() {
    if (!dialog) return;
    const { suggestion, action } = dialog;

    const check = validateTransition({
      from: suggestion.status,
      action,
      note,
      targetKey: suggestion.target_key,
    });
    if (!check.ok) {
      toast.error(check.error ?? "Invalid transition");
      return;
    }

    setBusyId(suggestion.id);
    try {
      if (action === "approved" || action === "rejected") {
        const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
        const { error } = await supabase
          .from("optimization_suggestions")
          .update({
            status: check.nextStatus!,
            review_notes: note.trim() || null,
            reviewed_by: userId,
            ...check.timestamps,
          })
          .eq("id", suggestion.id);
        if (error) throw error;
        toast.success(`Suggestion ${check.nextStatus}`);
      } else {
        const { data, error } = await supabase.functions.invoke(
          "apply-optimization-suggestion",
          { body: { suggestion_id: suggestion.id, action, notes: note.trim() || null } }
        );
        if (error || (data as any)?.error) {
          throw new Error(error?.message ?? (data as any)?.error);
        }
        toast.success(`Suggestion ${check.nextStatus}`);
      }
      setDialog(null);
      setNote("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(
    () => items.filter((i) => filter === "all" || i.status === filter),
    [items, filter]
  );

  return (
    <div className="space-y-6">
      <HubStatusStrip />
      <AdminSection
        icon={Sparkles}
        title="Optimization Suggestions"
        description="Lifecycle: Pending Review → Approved/Rejected → Applied → (Reverted). Every transition is timestamped and audited."
        action={
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-md border border-border/60 p-0.5 text-xs">
              {(["pending", "approved", "applied", "rejected", "reverted", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-2 py-1 rounded capitalize ${
                    filter === s ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={runScan} disabled={scanning}>
              <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
              <span className="ml-1.5">Run scan</span>
            </Button>
          </div>
        }
      >
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">No suggestions in this view.</p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-border/60 bg-background/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_VARIANTS[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {s.source}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {s.category}
                      </Badge>
                    </div>
                    <h3 className="mt-2 text-sm font-medium">{s.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{s.rationale}</p>

                    {s.target_key && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <code className="rounded bg-muted/60 px-1.5 py-0.5">{s.target_key}</code>
                        <span className="text-muted-foreground">
                          {JSON.stringify(s.current_value)} → {JSON.stringify(s.suggested_value)}
                        </span>
                      </div>
                    )}

                    <LifecycleTimeline s={s} reviewerName={s.reviewed_by ? reviewerNames[s.reviewed_by] : null} />

                    {s.review_notes && (
                      <div className="mt-2 rounded border border-border/40 bg-muted/30 px-2.5 py-1.5 text-[11px]">
                        <span className="font-medium text-muted-foreground">Note: </span>
                        <span>{s.review_notes}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    {s.status === "pending" && (
                      <>
                        <Button size="sm" variant="default" disabled={busyId === s.id}
                          onClick={() => openAction(s, "approved")}>
                          <Check className="h-3.5 w-3.5" /><span className="ml-1">Approve</span>
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busyId === s.id}
                          onClick={() => openAction(s, "rejected")}>
                          <X className="h-3.5 w-3.5" /><span className="ml-1">Reject</span>
                        </Button>
                      </>
                    )}
                    {s.status === "approved" && s.target_key && (
                      <Button size="sm" variant="default" disabled={busyId === s.id}
                        onClick={() => openAction(s, "apply")}>
                        <Play className="h-3.5 w-3.5" /><span className="ml-1">Apply</span>
                      </Button>
                    )}
                    {s.status === "applied" && (
                      <Button size="sm" variant="outline" disabled={busyId === s.id}
                        onClick={() => openAction(s, "revert")}>
                        <Undo2 className="h-3.5 w-3.5" /><span className="ml-1">Revert</span>
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection
        title="Active Pipeline Tunables"
        description="Live values written by approved & applied suggestions."
      >
        {tunables.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tunables yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="py-2 text-left font-medium">Key</th>
                  <th className="py-2 text-left font-medium">Value</th>
                  <th className="py-2 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {tunables.map((t) => (
                  <tr key={t.key} className="border-b border-border/30">
                    <td className="py-2 pr-3 font-mono">{t.key}</td>
                    <td className="py-2 pr-3">{JSON.stringify(t.value)}</td>
                    <td className="py-2 text-muted-foreground">{fmt(t.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle>{ACTION_COPY[dialog.action].title}</DialogTitle>
                <DialogDescription>{dialog.suggestion.title}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Admin notes {REQUIRES_NOTE[dialog.action] && <span className="text-destructive">*</span>}
                </label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why are you making this decision? (recorded in audit trail)"
                  rows={4}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
                <Button onClick={confirm} disabled={busyId === dialog.suggestion.id}>
                  {ACTION_COPY[dialog.action].verb}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LifecycleTimeline({
  s, reviewerName,
}: { s: Suggestion; reviewerName: string | null }) {
  const steps: { label: string; ts: string | null; active: boolean }[] = [
    { label: "Created", ts: s.created_at, active: true },
    {
      label: s.status === "rejected" ? "Rejected" : "Reviewed",
      ts: s.reviewed_at,
      active: !!s.reviewed_at,
    },
    { label: "Applied", ts: s.applied_at, active: !!s.applied_at },
    { label: "Reverted", ts: s.reverted_at, active: !!s.reverted_at },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-[10.5px] text-muted-foreground">
      {steps.map((st, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Clock className={`h-3 w-3 ${st.active ? "text-primary" : "opacity-40"}`} />
          <span className={st.active ? "text-foreground" : ""}>
            <span className="font-medium">{st.label}:</span> {fmt(st.ts)}
          </span>
          {st.label === "Reviewed" && reviewerName && (
            <span className="opacity-70">by {reviewerName}</span>
          )}
        </div>
      ))}
    </div>
  );
}
