import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Download,
  Ban,
  Search,
  X,
} from "lucide-react";
import { AdminSection } from "../AdminSection";
import { EmailDeliveryAlerts } from "../EmailDeliveryAlerts";
import { WebhookPayloadLog } from "../WebhookPayloadLog";


import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface SendLogRow {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  metadata: any;
  created_at: string;
}

interface SuppressedRow {
  id: string;
  email: string;
  reason: string;
  created_at: string;
  metadata: any;
}

const RANGES = [
  { key: "24h", label: "Last 24h", hours: 24 },
  { key: "7d", label: "7 days", hours: 24 * 7 },
  { key: "30d", label: "30 days", hours: 24 * 30 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "pending", label: "Pending" },
  { value: "dlq", label: "Failed" },
  { value: "failed", label: "Failed (immediate)" },
  { value: "bounced", label: "Bounced" },
  { value: "complained", label: "Complained" },
  { value: "suppressed", label: "Suppressed" },
];

const PAGE_SIZE = 50;

function statusTone(status: string) {
  switch (status) {
    case "sent":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "pending":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "suppressed":
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
    default:
      return "bg-red-500/15 text-red-400 border-red-500/30";
  }
}

/** Latest row per message_id — one email can log pending → sent/dlq. */
function dedupeByMessage(rows: SendLogRow[]): SendLogRow[] {
  const seen = new Map<string, SendLogRow>();
  for (const row of rows) {
    const key = row.message_id ?? `row:${row.id}`;
    const existing = seen.get(key);
    if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
      seen.set(key, row);
    }
  }
  return [...seen.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function EmailDeliverySection() {
  const [rows, setRows] = useState<SendLogRow[]>([]);
  const [suppressed, setSuppressed] = useState<SuppressedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("7d");
  const [template, setTemplate] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [live, setLive] = useState(false);


  const load = useCallback(async () => {
    setLoading(true);
    const hours = RANGES.find((r) => r.key === range)!.hours;
    const since = new Date(Date.now() - hours * 3600_000).toISOString();

    const [logRes, supRes] = await Promise.all([
      supabase
        .from("email_send_log")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("suppressed_emails")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (logRes.error) {
      toast.error("Could not load email log", { description: logRes.error.message });
      setRows([]);
    } else {
      setRows((logRes.data ?? []) as SendLogRow[]);
    }
    if (!supRes.error) setSuppressed((supRes.data ?? []) as SuppressedRow[]);
    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: merge inserts/updates as they arrive instead of refetching.
  useEffect(() => {
    const channel = supabase
      .channel("email-delivery-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_send_log" },
        (payload) => {
          const row = payload.new as SendLogRow | null;
          if (!row?.id) return;
          setRows((prev) => {
            const next = prev.filter((r) => r.id !== row.id);
            next.unshift(row);
            return next.slice(0, 2000);
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "suppressed_emails" },
        (payload) => {
          const row = payload.new as SuppressedRow | null;
          if (!row?.id) return;
          setSuppressed((prev) => [row, ...prev.filter((r) => r.id !== row.id)].slice(0, 200));
        }
      )
      .subscribe((s) => setLive(s === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [range, template, status, query]);


  const deduped = useMemo(() => dedupeByMessage(rows), [rows]);

  const templates = useMemo(
    () => [...new Set(deduped.map((r) => r.template_name))].sort(),
    [deduped]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deduped.filter(
      (r) =>
        (template === "all" || r.template_name === template) &&
        (status === "all" || r.status === status) &&
        (!q ||
          r.recipient_email.toLowerCase().includes(q) ||
          (r.message_id ?? "").toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q))
    );
  }, [deduped, template, status, query]);

  const stats = useMemo(() => {
    const scoped = deduped.filter((r) => template === "all" || r.template_name === template);
    const count = (s: string[]) => scoped.filter((r) => s.includes(r.status)).length;
    return {
      total: scoped.length,
      sent: count(["sent"]),
      failed: count(["dlq", "failed", "bounced", "complained"]),
      suppressed: count(["suppressed"]),
      pending: count(["pending"]),
    };
  }, [deduped, template]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const exportCsv = () => {
    const head = "created_at,template,recipient,status,message_id,error\n";
    const body = filtered
      .map((r) =>
        [
          r.created_at,
          r.template_name,
          r.recipient_email,
          r.status,
          r.message_id ?? "",
          (r.error_message ?? "").replace(/[\r\n,]+/g, " "),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([head + body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-delivery-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <AdminSection
        icon={Mail}
        title="Email delivery"
        description="Every auth and app email, deduplicated by message — with failures, bounces and suppressions."
        action={
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground"
              aria-live="polite"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"}`}
              />
              {live ? "Live" : "Offline"}
            </span>

            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      >
        <EmailDeliveryAlerts />
        {/* Filters */}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border/60 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`rounded-md px-3 py-1 text-xs transition ${
                  range === r.key
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger className="h-8 w-[190px] text-xs">
              <SelectValue placeholder="All email types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All email types</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipient email or message ID"
              aria-label="Search by recipient email or message ID"
              className="h-8 pl-8 pr-8 text-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>


        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Emails" value={stats.total} icon={Mail} />
          <StatCard label="Sent" value={stats.sent} icon={CheckCircle2} tone="text-emerald-400" />
          <StatCard label="Failed" value={stats.failed} icon={AlertTriangle} tone="text-red-400" />
          <StatCard label="Pending" value={stats.pending} icon={Clock} tone="text-amber-400" />
          <StatCard
            label="Suppressed"
            value={stats.suppressed}
            icon={ShieldAlert}
            tone="text-slate-300"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium">Recipient</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && !pageRows.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    No emails logged for this filter yet.
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t border-border/40 align-top">
                  <td className="px-3 py-2 font-mono">{r.template_name}</td>
                  <td className="px-3 py-2">{r.recipient_email}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={statusTone(r.status)}>
                      {r.status}
                    </Badge>
                    {r.error_message && (
                      <div className="mt-1 max-w-[380px] text-[11px] text-red-400/80">
                        {r.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page + 1} of {pageCount} · {filtered.length} emails
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
        <div className="mt-4">
          <WebhookPayloadLog />
        </div>
      </AdminSection>



      <AdminSection
        icon={Ban}
        title="Blocked addresses"
        description="Bounces, spam complaints and unsubscribes. These addresses are skipped on future sends."
        delay={0.05}
      >
        {!suppressed.length ? (
          <p className="text-xs text-muted-foreground">No blocked addresses — nothing has bounced.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {suppressed.map((s) => (
                  <tr key={s.id} className="border-t border-border/40">
                    <td className="px-3 py-2">{s.email}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                        {s.reason}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  icon: typeof Mail;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
