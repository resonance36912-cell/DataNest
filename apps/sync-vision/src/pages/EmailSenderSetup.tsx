import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_SENDER_CONFIG,
  clearSenderConfig,
  loadSenderConfig,
  overallState,
  runSenderChecks,
  saveSenderConfig,
  type SenderCheck,
  type SenderConfig,
} from "@/lib/email-sender-status";

/**
 * Internal ops page: configure the sender identity used for automated report
 * delivery and see whether the delivery pipeline is actually ready.
 * Lives under /admin so it is never indexed.
 */

const HUB_SUPPORT = "https://www.reson8.life/support";

const stateBadge = (state: string) => {
  switch (state) {
    case "ready":
      return { label: "Verified", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 };
    case "pending":
      return { label: "Pending", className: "bg-amber-500/15 text-amber-400 border-amber-500/30", Icon: Clock };
    case "error":
      return { label: "Action needed", className: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertTriangle };
    default:
      return { label: "Not checked", className: "bg-muted text-muted-foreground border-border", Icon: Clock };
  }
};

const EmailSenderSetup = () => {
  const [config, setConfig] = useState<SenderConfig>(DEFAULT_SENDER_CONFIG);
  const [checks, setChecks] = useState<SenderCheck[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setConfig(loadSenderConfig());
  }, []);

  const verify = useCallback(
    async (target?: SenderConfig) => {
      const cfg = target ?? config;
      setChecking(true);
      try {
        const results = await runSenderChecks(cfg);
        setChecks(results);
        const state = overallState(results);
        if (state === "ready") {
          const updated = { ...cfg, lastVerifiedAt: new Date().toISOString() };
          setConfig(updated);
          saveSenderConfig(updated);
          toast.success("Sender is verified and ready for report delivery");
        } else if (state === "pending") {
          toast.info("Sender setup is incomplete — see the checks below");
        } else {
          toast.error("Sender verification failed — see the checks below");
        }
      } finally {
        setChecking(false);
      }
    },
    [config],
  );

  const handleSave = () => {
    saveSenderConfig(config);
    toast.success("Sender settings saved");
    void verify(config);
  };

  const handleReset = () => {
    clearSenderConfig();
    setConfig({ ...DEFAULT_SENDER_CONFIG });
    setChecks([]);
    toast.success("Sender settings cleared");
  };

  const status = stateBadge(checking ? "checking" : overallState(checks));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold">
              <Mail className="h-5 w-5 text-primary" /> Email sender setup
            </h1>
            <p className="text-sm text-muted-foreground">
              Sender identity and delivery readiness for automated report emails.
            </p>
          </div>
          <Badge variant="outline" className={`gap-1.5 ${status.className}`}>
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <status.Icon className="h-3.5 w-3.5" />}
            {checking ? "Checking…" : status.label}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sender identity</CardTitle>
            <CardDescription>
              Use the verified sending subdomain (for example <code>notify.syncvision.life</code>), not the root
              domain.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sender-domain">Sender domain</Label>
                <Input
                  id="sender-domain"
                  placeholder="notify.syncvision.life"
                  value={config.senderDomain}
                  onChange={(e) => setConfig((c) => ({ ...c, senderDomain: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="from-name">From name</Label>
                <Input
                  id="from-name"
                  placeholder="SyncVision Reports"
                  value={config.fromName}
                  onChange={(e) => setConfig((c) => ({ ...c, fromName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="reply-to">Reply-to address</Label>
                <Input
                  id="reply-to"
                  placeholder="support@syncvision.life"
                  value={config.replyTo}
                  onChange={(e) => setConfig((c) => ({ ...c, replyTo: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} className="gap-2">
                <Save className="h-4 w-4" /> Save &amp; verify
              </Button>
              <Button variant="outline" onClick={() => void verify()} disabled={checking} className="gap-2">
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Re-check status
              </Button>
              <Button variant="ghost" onClick={handleReset} className="gap-2 text-muted-foreground">
                <Trash2 className="h-4 w-4" /> Clear
              </Button>
            </div>

            {config.lastVerifiedAt && (
              <p className="text-xs text-muted-foreground">
                Last verified {new Date(config.lastVerifiedAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification status</CardTitle>
            <CardDescription>Each check must pass before report emails can be delivered.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {checks.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No checks run yet. Use “Re-check status” to probe the sender and delivery pipeline.
              </p>
            )}
            {checks.map((check) => {
              const badge = stateBadge(check.state);
              return (
                <div key={check.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{check.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 gap-1 ${badge.className}`}>
                      <badge.Icon className="h-3 w-3" />
                      {badge.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Domain provisioning</CardTitle>
            <CardDescription>
              DNS delegation for the sending subdomain is handled by the platform, not by this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Provision the sending subdomain on a domain you own (syncvision.life).</li>
              <li>Wait for DNS verification to complete — it can take up to 72 hours.</li>
              <li>Save the verified subdomain above and re-check the status.</li>
            </ol>
            <Separator />
            <Button variant="outline" size="sm" asChild className="gap-2">
              <a href={HUB_SUPPORT} target="_blank" rel="noopener noreferrer">
                Hub support <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmailSenderSetup;
