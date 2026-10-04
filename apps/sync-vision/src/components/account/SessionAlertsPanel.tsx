import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BellRing, LogOut, MonitorSmartphone, ShieldAlert, Trash2 } from "lucide-react";
import {
  SessionAlert,
  SESSION_ALERT_LABELS,
  SESSION_ALERT_MESSAGES,
  clearSessionAlerts,
  loadSessionAlerts,
  markSessionAlertsRead,
  onSessionAlertsChange,
} from "@/lib/session-alerts";

function iconFor(type: SessionAlert["type"]) {
  return type === "signed_out_everywhere" ? LogOut : MonitorSmartphone;
}

export default function SessionAlertsPanel() {
  const [alerts, setAlerts] = useState<SessionAlert[]>([]);

  const refresh = useCallback(() => setAlerts(loadSessionAlerts()), []);

  useEffect(() => {
    refresh();
    return onSessionAlertsChange(refresh);
  }, [refresh]);

  const unread = alerts.filter((a) => !a.read).length;

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="h-4 w-4 text-primary" />
              Session alerts
              {unread > 0 && (
                <Badge variant="destructive" className="h-5 px-2 text-[10px]">
                  {unread} new
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              You're notified when your account is signed out everywhere, or when a new
              session is created on another device.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            {unread > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAlerts(markSessionAlertsRead().sort((a, b) => b.at - a.at))}
              >
                Mark read
              </Button>
            )}
            {alerts.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setAlerts(clearSessionAlerts())}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            No session alerts. We'll notify you here (and with a toast) if anything changes.
          </p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => {
              const Icon = iconFor(a.type);
              return (
                <li
                  key={a.id}
                  className={`flex gap-3 rounded-lg border p-3 ${
                    a.read ? "border-border/50 bg-background/30" : "border-primary/40 bg-primary/5"
                  }`}
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      a.type === "signed_out_everywhere" ? "text-destructive" : "text-primary"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium">{SESSION_ALERT_LABELS[a.type]}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(a.at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {SESSION_ALERT_MESSAGES[a.type]}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground/80">
                      {[a.email, a.device, a.detail].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {alerts.some((a) => a.type === "new_session") && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Didn't recognise a sign-in? Use "Sign out everywhere" below and review your linked
            identities.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
