import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BellRing, Check, Loader2, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface AlertRow {
  id: string;
  severity: string;
  title: string;
  message: string;
  metadata: any;
  acknowledged: boolean;
  created_at: string;
}

export interface AlertThresholds {
  windowMinutes: number;
  minSample: number;
  failureRatePct: number;
  bounceCount: number;
}

const STORAGE_KEY = "email-delivery-alert-thresholds";
const DEFAULTS: AlertThresholds = {
  windowMinutes: 60,
  minSample: 5,
  failureRatePct: 25,
  bounceCount: 3,
};

function readThresholds(): AlertThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function EmailDeliveryAlerts() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [thresholds, setThresholds] = useState<AlertThresholds>(readThresholds);
  const [showSettings, setShowSettings] = useState(false);
  const [checking, setChecking] = useState(false);

  const loadAlerts = useCallback(async () => {
    const { data } = await supabase
      .from("system_alerts")
      .select("*")
      .eq("source", "email_delivery")
      .eq("acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(10);
    setAlerts((data ?? []) as AlertRow[]);
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Live: new delivery alerts appear without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel("email-delivery-alerts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_alerts" },
        (payload) => {
          const row = payload.new as (AlertRow & { source?: string }) | null;
          if (row && row.source && row.source !== "email_delivery") return;
          loadAlerts();

        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAlerts]);

  const persist = (next: AlertThresholds) => {
    setThresholds(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const runCheck = async () => {
    setChecking(true);
    const { data, error } = await supabase.functions.invoke("email-delivery-monitor", {
      body: thresholds,
    });
    setChecking(false);
    if (error) {
      toast.error("Delivery check failed", { description: error.message });
      return;
    }
    if (data?.breached) {
      toast.warning("Delivery threshold breached", { description: data.reason });
    } else {
      toast.success("Email delivery is healthy", {
        description: `${data?.total ?? 0} emails checked, ${data?.failure_rate_pct ?? 0}% failure rate.`,
      });
    }
    loadAlerts();
  };

  const acknowledge = async (id: string) => {
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("system_alerts")
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userRes?.user?.id ?? null,
      })
      .eq("id", id);
    if (error) {
      toast.error("Could not dismiss alert", { description: error.message });
      return;
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const numberField = (
    label: string,
    key: keyof AlertThresholds,
    suffix?: string
  ) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span>
        {label}
        {suffix ? ` (${suffix})` : ""}
      </span>
      <Input
        type="number"
        min={1}
        value={thresholds[key]}
        onChange={(e) =>
          persist({ ...thresholds, [key]: Math.max(1, Number(e.target.value) || 1) })
        }
        className="h-8 w-24"
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={runCheck} disabled={checking}>
          {checking ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <BellRing className="mr-1.5 h-3.5 w-3.5" />
          )}
          Run delivery check
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowSettings((s) => !s)}>
          <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Alert thresholds
        </Button>
        <span className="text-xs text-muted-foreground">
          Alerts admins in-app and by email when failures or bounces exceed these limits.
        </span>
      </div>

      {showSettings && (
        <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-muted/30 p-3">
          {numberField("Window", "windowMinutes", "minutes")}
          {numberField("Min sample", "minSample", "emails")}
          {numberField("Failure rate", "failureRatePct", "%")}
          {numberField("Bounces", "bounceCount", "count")}
        </div>
      )}

      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-start gap-3 rounded-lg border p-3 ${
            alert.severity === "critical"
              ? "border-destructive/40 bg-destructive/10"
              : "border-amber-500/40 bg-amber-500/10"
          }`}
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{alert.title}</p>
              <Badge variant="outline" className="text-[10px] uppercase">
                {alert.severity}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {new Date(alert.created_at).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 break-words text-xs text-muted-foreground">{alert.message}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => acknowledge(alert.id)}>
            <Check className="mr-1.5 h-3.5 w-3.5" /> Dismiss
          </Button>
        </div>
      ))}
    </div>
  );
}
