import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Bell, BellOff, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2, ShieldCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SystemAlert {
  id: string;
  severity: string;
  source: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

const SEVERITY_CONFIG: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
  warning: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  info: { icon: CheckCircle2, color: "text-blue-500", bg: "bg-blue-500/10" },
};

export default function AlertsPanel({ debugMode }: { debugMode: boolean }) {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("system_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!showAcknowledged) {
      query = query.eq("acknowledged", false);
    }

    const { data } = await query;
    if (data) setAlerts(data as unknown as SystemAlert[]);
    setLoading(false);
  }, [showAcknowledged]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const acknowledgeAlert = async (id: string) => {
    const { error } = await supabase
      .from("system_alerts")
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() } as any)
      .eq("id", id);

    if (error) {
      toast.error("Failed to acknowledge alert");
    } else {
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true, acknowledged_at: new Date().toISOString() } : a));
    }
  };

  const acknowledgeAll = async () => {
    const unacked = alerts.filter(a => !a.acknowledged).map(a => a.id);
    if (unacked.length === 0) return;

    for (const id of unacked) {
      await supabase
        .from("system_alerts")
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString() } as any)
        .eq("id", id);
    }
    toast.success(`Acknowledged ${unacked.length} alerts`);
    fetchAlerts();
  };

  const runHealthCheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("monitor-health");
      if (error) throw error;
      const result = data as { alerts_detected: number; alerts_inserted: number };
      toast.success(`Health check complete: ${result.alerts_detected} issues detected, ${result.alerts_inserted} new alerts`);
      fetchAlerts();
    } catch (e: any) {
      toast.error(`Health check failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const activeCount = alerts.filter(a => !a.acknowledged).length;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Bell className={cn("h-4 w-4", activeCount > 0 ? "text-destructive" : "text-muted-foreground")} />
          <h3 className="text-sm font-semibold">Monitoring Alerts</h3>
          {activeCount > 0 && (
            <Badge variant="destructive" className="text-xs">{activeCount} active</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Switch
              id="show-acked"
              checked={showAcknowledged}
              onCheckedChange={setShowAcknowledged}
              className="scale-75"
            />
            <Label htmlFor="show-acked" className="text-[10px] text-muted-foreground">History</Label>
          </div>
          {activeCount > 0 && (
            <Button size="sm" variant="ghost" onClick={acknowledgeAll} className="h-7 px-2 text-xs gap-1">
              <BellOff className="h-3 w-3" /> Ack All
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={runHealthCheck} disabled={running} className="h-7 px-2 text-xs gap-1">
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Run Check
          </Button>
          <Button size="sm" variant="ghost" onClick={fetchAlerts} className="h-7 px-2">
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[300px] rounded-lg border">
        <div className="divide-y">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <ShieldCheck className="h-8 w-8 mb-2 text-green-500" />
              <p className="text-sm font-medium">All systems healthy</p>
              <p className="text-xs">No active alerts</p>
            </div>
          ) : (
            alerts.map(alert => {
              const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
              const Icon = config.icon;
              return (
                <div key={alert.id} className={cn("p-3 space-y-1", alert.acknowledged && "opacity-50")}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", config.color)} />
                      <Badge className={cn("text-[10px] uppercase border-0", config.bg, config.color)}>
                        {alert.severity}
                      </Badge>
                      <span className="text-xs font-medium">{alert.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(alert.created_at).toLocaleString()}
                      </span>
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="h-6 px-1.5 text-[10px]"
                        >
                          Ack
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                  <Badge variant="outline" className="text-[10px]">{alert.source}</Badge>
                  {debugMode && alert.metadata && Object.keys(alert.metadata).length > 0 && (
                    <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-1 overflow-auto max-h-24">
                      {JSON.stringify(alert.metadata, null, 2)}
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
