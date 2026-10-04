import { useCallback, useEffect, useState } from "react";
import {
  History,
  Trash2,
  Download,
  LogIn,
  LogOut,
  RefreshCw,
  Globe,
  Link2,
  Unlink,
  Mail,
  KeyRound,
  ShieldAlert,
  TimerOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  EVENT_LABELS,
  clearSecurityAuditLog,
  describeDevice,
  loadSecurityAuditLog,
  onSecurityAuditChange,
  type SecurityAuditEntry,
  type SecurityEventType,
} from "@/lib/security-audit-log";

const ICONS: Record<SecurityEventType, typeof LogIn> = {
  sign_in: LogIn,
  session_refresh: RefreshCw,
  sign_out: LogOut,
  identity_connect: Link2,
  identity_relink: RefreshCw,
  identity_remove: Unlink,
  otp_send: Mail,
  otp_verify_success: KeyRound,
  otp_verify_failure: ShieldAlert,
  otp_timeout: TimerOff,
};


function formatWhen(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

export default function SecurityAuditLog() {
  const [entries, setEntries] = useState<SecurityAuditEntry[]>([]);

  const reload = useCallback(() => setEntries(loadSecurityAuditLog()), []);

  useEffect(() => {
    reload();
    return onSecurityAuditChange(reload);
  }, [reload]);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="mb-4 border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Security audit log</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {entries.length} event{entries.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Sign-in, session refresh, and sign-out activity recorded on this device.
      </p>
      <Separator className="mb-2" />

      {entries.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">
          No activity recorded yet. Events appear here as you sign in, refresh, or sign out.
        </p>
      ) : (
        <ScrollArea className="h-[300px] pr-2">
          <ul className="space-y-2">
            {entries.map((e) => {
              const Icon = ICONS[e.type] ?? History;
              return (
                <li key={e.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      {EVENT_LABELS[e.type]}
                    </span>
                    {e.scope === "global" && (
                      <Badge variant="secondary" className="text-[10px]">All devices</Badge>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {formatWhen(e.at)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {e.ip ?? "IP unavailable"}
                    </span>
                    <span>{describeDevice(e.userAgent)}</span>
                    {e.email && <span className="break-all">{e.email}</span>}
                    {e.provider && <span>via {e.provider}</span>}
                    {e.detail && <span className="break-all">{e.detail}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={reload}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
        <Button size="sm" variant="ghost" onClick={handleExport} disabled={entries.length === 0}>
          <Download className="h-3.5 w-3.5" /> Export JSON
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => setEntries(clearSecurityAuditLog())}
          disabled={entries.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>
    </Card>
  );
}
