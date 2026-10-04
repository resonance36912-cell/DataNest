import { useState } from "react";
import { Download, Loader2, Package, FileJson } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { buildAccountExport, downloadBlob } from "@/lib/account-export";

const CONTENTS = [
  "Profile and account metadata",
  "Linked identities (providers only — never tokens)",
  "Projects, scenes and characters",
  "Render job history and credit activity",
  "Device security audit log",
];

export default function AccountDataExport() {
  const { user, hubUser, session, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [lastCounts, setLastCounts] = useState<Record<string, number> | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setProgress({ done: 0, total: 7, label: "Starting" });
    try {
      const { blob, fileName, counts } = await buildAccountExport({
        user,
        hubUser,
        session,
        profile,
        onProgress: setProgress,
      });
      downloadBlob(blob, fileName);
      setLastCounts(counts);
      toast.success("Account export ready", { description: fileName });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Card className="mb-4 border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Export my data</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">ZIP</Badge>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Download a single package containing everything this app stores for your account.
      </p>
      <Separator className="mb-2" />

      <ul className="space-y-1">
        {CONTENTS.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <FileJson className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" />
            {item}
          </li>
        ))}
      </ul>

      {progress && (
        <div className="mt-3 space-y-1">
          <Progress value={(progress.done / progress.total) * 100} className="h-1.5" />
          <p className="text-[10px] text-muted-foreground">{progress.label}…</p>
        </div>
      )}

      {lastCounts && !busy && (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Last export:{" "}
          {Object.entries(lastCounts)
            .map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`)
            .join(" · ")}
        </p>
      )}

      <Button size="sm" className="mt-3" onClick={handleExport} disabled={busy || !user}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Download my data
      </Button>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Media files aren’t bundled — asset links are included in the JSON so large videos stay in cloud storage.
      </p>
    </Card>
  );
}
