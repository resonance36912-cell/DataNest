import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, RefreshCw, Check, CircleSlash, Archive } from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

import { AdminSection } from "../AdminSection";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Severity = "info" | "low" | "medium" | "high" | "critical";
type Status = "open" | "fixed" | "accepted" | "ignored";

interface Finding {
  id: string;
  tool: string;
  external_id: string | null;
  title: string;
  description: string | null;
  severity: Severity;
  status: Status;
  category: string | null;
  remediation: string | null;
  metadata: Record<string, unknown>;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  medium:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low:      "bg-sky-500/15 text-sky-400 border-sky-500/30",
  info:     "bg-muted text-muted-foreground border-border",
};

const STATUS_STYLES: Record<Status, string> = {
  open:     "bg-rose-500/15 text-rose-400 border-rose-500/30",
  fixed:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  accepted: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  ignored:  "bg-muted text-muted-foreground border-border",
};

export function SecurityFindingsSection() {
  const { user } = useAuth();
  const [items, setItems] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("open");
  const [toolFilter, setToolFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [resolving, setResolving] = useState<{ finding: Finding; target: Status } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("security_findings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load findings", { description: error.message });
    } else {
      setItems((data ?? []) as Finding[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tools = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.tool));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => severityFilter === "all" || i.severity === severityFilter)
      .filter((i) => statusFilter === "all" || i.status === statusFilter)
      .filter((i) => toolFilter === "all" || i.tool === toolFilter)
      .filter((i) => !q ||
        i.title.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q) ||
        i.tool.toLowerCase().includes(q) ||
        i.external_id?.toLowerCase().includes(q)
      )
      .sort((a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
      );
  }, [items, severityFilter, statusFilter, toolFilter, search]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { open: 0, fixed: 0, accepted: 0, ignored: 0 };
    items.forEach((i) => { c[i.status] += 1; });
    return c;
  }, [items]);

  const openResolve = (finding: Finding, target: Status) => {
    setNote(finding.resolution_note ?? "");
    setResolving({ finding, target });
  };

  const applyStatus = async (finding: Finding, target: Status, resolutionNote: string | null) => {
    setBusy(true);
    const isClosing = target !== "open";
    const { error } = await supabase
      .from("security_findings")
      .update({
        status: target,
        resolution_note: resolutionNote,
        resolved_at: isClosing ? new Date().toISOString() : null,
        resolved_by: isClosing ? (user?.id ?? null) : null,
      })
      .eq("id", finding.id);
    setBusy(false);
    if (error) {
      toast.error("Update failed", { description: error.message });
      return;
    }
    toast.success(`Marked as ${target}`);
    setResolving(null);
    setNote("");
    load();
  };

  const reopen = (finding: Finding) => applyStatus(finding, "open", null);

  return (
    <AdminSection
      icon={ShieldAlert}
      title="Security Findings"
      description="Browse scanner findings, filter by severity or tool, and track remediation."
      action={
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
    >
      {/* Summary chips */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["open","fixed","accepted","ignored"] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`rounded-lg border px-3 py-2 text-left transition ${
              statusFilter === s ? "border-primary/40 bg-primary/5" : "border-border bg-card/40 hover:bg-card/70"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s}</div>
            <div className="text-lg font-semibold">{counts[s]}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, tool, id…"
          className="h-8 max-w-xs text-xs"
        />
        <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as typeof severityFilter)}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {SEVERITY_ORDER.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
        <Select value={toolFilter} onValueChange={setToolFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Tool" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tools</SelectItem>
            {tools.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {filtered.length} of {items.length}
        </span>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading findings…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No findings match the current filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f, idx) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.015, 0.2) }}
              className="rounded-lg border border-border bg-card/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={`capitalize ${SEVERITY_STYLES[f.severity]}`}>
                      {f.severity}
                    </Badge>
                    <Badge variant="outline" className={`capitalize ${STATUS_STYLES[f.status]}`}>
                      {f.status}
                    </Badge>
                    <Badge variant="outline" className="bg-muted/40 text-[10px] uppercase tracking-wider">
                      {f.tool}
                    </Badge>
                    {f.category && (
                      <Badge variant="outline" className="bg-muted/40 text-[10px]">{f.category}</Badge>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold leading-snug">{f.title}</h3>
                  {f.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                  )}
                  {f.remediation && (
                    <p className="mt-2 text-xs text-foreground/80">
                      <span className="font-medium text-foreground">Remediation: </span>
                      {f.remediation}
                    </p>
                  )}
                  {f.status !== "open" && f.resolution_note && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/80">Note: </span>
                      {f.resolution_note}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Created {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}</span>
                    {f.resolved_at && (
                      <span>Resolved {formatDistanceToNow(new Date(f.resolved_at), { addSuffix: true })}</span>
                    )}
                    {f.external_id && <span>ID {f.external_id}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  {f.status === "open" ? (
                    <>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => openResolve(f, "fixed")}>
                        <Check className="h-3 w-3" /> Fixed
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => openResolve(f, "accepted")}>
                        <Archive className="h-3 w-3" /> Accept
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => openResolve(f, "ignored")}>
                        <CircleSlash className="h-3 w-3" /> Ignore
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => reopen(f)} disabled={busy}>
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">Mark finding as {resolving?.target}</DialogTitle>
            <DialogDescription className="line-clamp-2">{resolving?.finding.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Verification note (optional)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder={
                resolving?.target === "fixed"
                  ? "What was changed to remediate this finding?"
                  : resolving?.target === "accepted"
                  ? "Why is this risk acceptable in this context?"
                  : "Why is this finding being ignored?"
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolving(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={() => resolving && applyStatus(resolving.finding, resolving.target, note.trim() || null)}
              disabled={busy}
            >
              {busy ? "Saving…" : `Mark ${resolving?.target}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminSection>
  );
}
