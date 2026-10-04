import { useCallback, useEffect, useMemo, useState } from "react";
import { Webhook, RefreshCw, ShieldAlert, ShieldCheck, Copy, Download, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface WebhookEventRow {
  id: string;
  source: string;
  event_type: string | null;
  reason: string | null;
  recipient_email: string | null;
  message_id: string | null;
  signature_valid: boolean;
  http_status: number | null;
  processing_error: string | null;
  headers: any;
  raw_payload: any;
  raw_body: string | null;
  created_at: string;
}

const PAGE_SIZE = 25;

export function WebhookPayloadLog() {
  const [rows, setRows] = useState<WebhookEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_webhook_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error("Could not load webhook events", { description: error.message });
      return;
    }
    setRows((data ?? []) as WebhookEventRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("email-webhook-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "email_webhook_events" },
        (payload) => {
          setRows((prev) => [payload.new as WebhookEventRow, ...prev].slice(0, 500));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.recipient_email, r.message_id, r.reason, r.event_type, r.id, r.raw_body]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const prettyPayload = (row: WebhookEventRow) => {
    try {
      return JSON.stringify(row.raw_payload ?? {}, null, 2);
    } catch {
      return row.raw_body ?? "";
    }
  };

  const copyPayload = async (row: WebhookEventRow) => {
    await navigator.clipboard.writeText(row.raw_body || prettyPayload(row));
    toast.success("Raw payload copied");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-webhook-events-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Webhook className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Provider webhook payloads</h3>
        <Badge variant="outline" className="text-[10px]">
          {filtered.length} events
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search recipient, message ID, payload…"
            className="h-8 w-56"
          />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} disabled={!filtered.length}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> JSON
          </Button>
        </div>
      </div>

      {!filtered.length && !loading && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No webhook events recorded yet. Delivery, bounce and complaint callbacks appear here as
          soon as the provider sends them.
        </p>
      )}

      <div className="space-y-2">
        {paged.map((row) => {
          const isOpen = expanded === row.id;
          return (
            <div key={row.id} className="rounded-md border border-border/60 bg-background/40">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : row.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
                aria-expanded={isOpen}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
                {row.signature_valid ? (
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
                )}
                <span className="truncate text-xs font-medium">
                  {row.reason ?? row.event_type ?? "event"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {row.recipient_email ?? "—"}
                </span>
                <Badge
                  variant="outline"
                  className={`ml-auto shrink-0 text-[10px] ${
                    (row.http_status ?? 0) >= 400 ? "border-destructive/50 text-destructive" : ""
                  }`}
                >
                  {row.http_status ?? "—"}
                </Badge>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-2 border-t border-border/60 px-3 py-2">
                  <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                    <span>Source: {row.source}</span>
                    <span>Message ID: {row.message_id ?? "—"}</span>
                    <span>Event ID: {row.id}</span>
                    <span>
                      Signature: {row.signature_valid ? "verified" : "rejected"}
                    </span>
                  </div>
                  {row.processing_error && (
                    <p className="rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                      {row.processing_error}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium">Raw payload</span>
                    <Button variant="ghost" size="sm" onClick={() => copyPayload(row)}>
                      <Copy className="mr-1.5 h-3 w-3" /> Copy
                    </Button>
                  </div>
                  <pre className="max-h-72 overflow-auto rounded bg-muted/50 p-2 text-[11px] leading-relaxed">
                    {prettyPayload(row)}
                  </pre>
                  {row.headers && Object.keys(row.headers).length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-[11px] text-muted-foreground">
                        Request headers
                      </summary>
                      <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-[11px]">
                        {JSON.stringify(row.headers, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
