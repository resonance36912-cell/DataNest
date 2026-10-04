/**
 * Ops Cockpit — Admin-only observability panel.
 * Shows provider_health, filtered audit_events, retry/cancel controls, debug toggle.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getRecentErrors, clearErrorLog } from "@/lib/error-logger";
import type { ErrorLogEntry } from "@/lib/error-logger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, RefreshCw, Search, Bug, CheckCircle2, XCircle, AlertTriangle, Clock, Trash2, ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";
import AlertsPanel from "@/components/ops/AlertsPanel";
import MergeRefreshLog from "@/components/ops/MergeRefreshLog";

interface ProviderHealth {
  id: string;
  provider_name: string;
  status: string;
  latency_ms: number | null;
  error_rate: number;
  last_check_at: string;
  metadata: Record<string, unknown>;
}

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

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  down: XCircle,
  unknown: Clock,
};

const STATUS_COLOR: Record<string, string> = {
  healthy: "text-green-500",
  degraded: "text-yellow-500",
  down: "text-destructive",
  unknown: "text-muted-foreground",
};

export default function OpsCockpit() {
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [eventFilter, setEventFilter] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);

  const refreshErrorLogs = useCallback(() => {
    setErrorLogs(getRecentErrors(50));
  }, []);

  const handleClearErrors = useCallback(() => {
    clearErrorLog();
    setErrorLogs([]);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: ph }, { data: ae }] = await Promise.all([
      supabase.from("provider_health").select("*").order("provider_name"),
      supabase.from("audit_events").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (ph) setProviders(ph as unknown as ProviderHealth[]);
    if (ae) setEvents(ae as unknown as AuditEvent[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); refreshErrorLogs(); }, [fetchData, refreshErrorLogs]);

  const filteredEvents = eventFilter
    ? events.filter(e =>
        e.event_type.toLowerCase().includes(eventFilter.toLowerCase()) ||
        (e.entity_type ?? "").toLowerCase().includes(eventFilter.toLowerCase())
      )
    : events;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Ops Cockpit</h2>
          <Badge variant="outline" className="text-xs">Admin Only</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="debug-toggle" className="text-xs">Debug</Label>
            <Switch id="debug-toggle" checked={debugMode} onCheckedChange={setDebugMode} />
          </div>
          <Button size="sm" variant="outline" onClick={fetchData}>
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Provider Health */}
      <section>
        <h3 className="text-sm font-semibold mb-2">Provider Health</h3>
        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No provider health data available.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map(p => {
              const Icon = STATUS_ICON[p.status] || Clock;
              const color = STATUS_COLOR[p.status] || "text-muted-foreground";
              return (
                <div key={p.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", color)} />
                      <span className="text-sm font-medium">{p.provider_name}</span>
                    </div>
                    <Badge variant="outline" className={cn("text-xs", color)}>
                      {p.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-3">
                    {p.latency_ms != null && <span>Latency: {p.latency_ms}ms</span>}
                    <span>Error rate: {(p.error_rate * 100).toFixed(1)}%</span>
                  </div>
                  {debugMode && p.metadata && Object.keys(p.metadata).length > 0 && (
                    <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-1 overflow-auto max-h-20">
                      {JSON.stringify(p.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Monitoring Alerts */}
      <AlertsPanel debugMode={debugMode} />

      {/* Merge Force-Refresh Log */}
      <MergeRefreshLog events={events} debugMode={debugMode} />

      {/* Audit Events */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Audit Trail</h3>
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={eventFilter}
              onChange={e => setEventFilter(e.target.value)}
              placeholder="Filter events…"
              className="pl-7 h-7 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="h-[400px] rounded-lg border">
          <div className="divide-y">
            {filteredEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">No audit events found.</p>
            ) : (
              filteredEvents.map(e => (
                <div key={e.id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{e.event_type}</Badge>
                      {e.entity_type && (
                        <span className="text-xs text-muted-foreground">{e.entity_type}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </div>
                  {debugMode && (
                    <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-1 overflow-auto max-h-24">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </section>

      {/* Client Error Log */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold">Client Error Log</h3>
            <Badge variant="outline" className="text-xs">{errorLogs.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={refreshErrorLogs} className="h-7 px-2 text-xs gap-1">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
            <Button size="sm" variant="ghost" onClick={handleClearErrors} className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3" /> Clear
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[300px] rounded-lg border">
          <div className="divide-y">
            {errorLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">No client errors captured this session.</p>
            ) : (
              [...errorLogs].reverse().map((entry, i) => {
                const severityColor = entry.severity === "fatal" ? "text-destructive" : entry.severity === "error" ? "text-orange-500" : "text-yellow-500";
                const severityBg = entry.severity === "fatal" ? "bg-destructive/10" : entry.severity === "error" ? "bg-orange-500/10" : "bg-yellow-500/10";
                return (
                  <div key={`${entry.timestamp}-${i}`} className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-[10px] uppercase", severityBg, severityColor, "border-0")}>
                          {entry.severity}
                        </Badge>
                        <span className="text-xs font-medium">{entry.source}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{entry.message}</p>
                    {debugMode && entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-1 overflow-auto max-h-24">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </section>
    </div>
  );
}
