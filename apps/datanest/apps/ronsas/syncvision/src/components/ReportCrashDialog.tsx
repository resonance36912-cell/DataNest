import { useEffect, useMemo, useState } from "react";
import { Bug, Copy, Download, RefreshCw, Trash2, Check, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  clearCrashLogs, formatCrashReport, getKnownTraceIds, getRecentCrashLogs,
} from "@/lib/crashLogger";
import { redactSecrets, redactValue } from "@/lib/redactSecrets";

interface ReportCrashDialogProps {
  /** Optional preselected trace id (e.g. the active upload attempt). */
  defaultTraceId?: string;
  /** Optional additional context to embed in the report. */
  context?: Record<string, unknown>;
  /** Render a compact icon-only trigger. */
  compact?: boolean;
  /** Label override for the trigger button. */
  label?: string;
}

export default function ReportCrashDialog({
  defaultTraceId,
  context,
  compact = false,
  label = "Report crash",
}: ReportCrashDialogProps) {
  const [open, setOpen] = useState(false);
  const [traceId, setTraceId] = useState<string>(defaultTraceId ?? "__all__");
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0); // force re-read of ring buffer
  const [copied, setCopied] = useState(false);
  const [autoUpload, setAutoUpload] = useState(true);
  const [redact, setRedact] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadedId, setUploadedId] = useState<string | null>(null);

  // Refresh the available traces when the dialog opens.
  useEffect(() => {
    if (open) setTick((t) => t + 1);
  }, [open]);

  const traces = useMemo(() => {
    void tick;
    return getKnownTraceIds();
  }, [tick]);

  const redactionOpts = useMemo(() => {
    const fileNames: string[] = [];
    const ctx = (context ?? {}) as Record<string, unknown>;
    if (typeof ctx.fileName === "string") fileNames.push(ctx.fileName);
    return { fileNames };
  }, [context]);

  const report = useMemo(() => {
    void tick;
    const raw = formatCrashReport({
      userNote: note,
      traceId: traceId === "__all__" ? undefined : traceId,
      context,
    });
    return redact ? redactSecrets(raw, redactionOpts) : raw;
  }, [tick, note, traceId, context, redact, redactionOpts]);

  const redactedContext = useMemo(
    () => (redact ? redactValue(context ?? {}, redactionOpts) : (context ?? {})),
    [context, redact, redactionOpts],
  );

  const entryCount = useMemo(() => {
    void tick;
    return getRecentCrashLogs(500, traceId === "__all__" ? undefined : traceId).length;
  }, [tick, traceId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      toast.success("Crash report copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Clipboard blocked — use Download instead");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const tag = traceId === "__all__" ? "all" : traceId;
    a.href = url;
    a.download = `crash-report-${tag}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Crash report downloaded");
  };

  const handleUpload = async () => {
    setUploading(true);
    setUploadedId(null);
    try {
      const effectiveTraceId = traceId === "__all__" ? undefined : traceId;
      const { data, error } = await supabase.functions.invoke("submit-crash-report", {
        body: {
          report,
          note: redact && note ? redactSecrets(note, redactionOpts) : (note || null),
          trace_id: effectiveTraceId ?? null,
          project_id: (context as any)?.projectId ?? null,
          url: typeof window !== "undefined"
            ? (redact ? redactSecrets(window.location.href, redactionOpts) : window.location.href)
            : null,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          context: redactedContext,
          redacted: redact,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Upload failed");
      setUploadedId(data.id);
      toast.success("Crash report securely uploaded", {
        description: `Report ID: ${data.id.slice(0, 8)}…`,
      });
      return data.id as string;
    } catch (err: any) {
      console.error("[ReportCrashDialog] upload failed", err);
      toast.error("Upload failed — copy or download instead", {
        description: err?.message ?? String(err),
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Auto-upload the first time the user opens the dialog (if enabled and signed in).
  useEffect(() => {
    if (!open || !autoUpload || uploadedId || uploading) return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      await handleUpload();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoUpload]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          className="gap-2"
          title="Report a crash with attached step-by-step logs"
        >
          <Bug className="h-4 w-4" />
          {!compact && <span>{label}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Report a crash</DialogTitle>
          <DialogDescription>
            We auto-attached your recent step timestamps and traceIds so the team
            can see exactly where the page failed. Add any extra notes below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Trace
              </label>
              <Select value={traceId} onValueChange={setTraceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a trace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All recent logs</SelectItem>
                  {traces.map((id) => (
                    <SelectItem key={id} value={id}>{id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTick((t) => t + 1)}
              title="Refresh trace list"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => { clearCrashLogs(); setTick((t) => t + 1); toast.success("Crash buffer cleared"); }}
              title="Clear captured logs"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              What happened? (optional)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Clicked Analyze Track, progress reached ~30%, then the page went blank."
              rows={3}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Auto-attached log ({entryCount} entries)</span>
              <span>{report.length.toLocaleString()} chars</span>
            </div>
            <Textarea
              value={report}
              readOnly
              rows={10}
              className="font-mono text-[11px] leading-snug"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="auto-upload" className="text-sm font-medium">
                Securely upload to support
              </Label>
              <span className="text-xs text-muted-foreground">
                Stored against your account and tagged with the selected traceId.
                {uploadedId && <> Last upload: <span className="font-mono">{uploadedId.slice(0, 8)}…</span></>}
              </span>
            </div>
            <Switch
              id="auto-upload"
              checked={autoUpload}
              onCheckedChange={(v) => { setAutoUpload(v); setUploadedId(null); }}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="redact-secrets" className="text-sm font-medium">
                Redact secrets before sending
              </Label>
              <span className="text-xs text-muted-foreground">
                Strips cookies, auth tokens, JWTs, signed URLs, and file names from the report.
              </span>
            </div>
            <Switch
              id="redact-secrets"
              checked={redact}
              onCheckedChange={(v) => { setRedact(v); setUploadedId(null); }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          <Button variant="outline" onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" /> Download .txt
          </Button>
          <Button variant="outline" onClick={handleCopy} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button onClick={handleUpload} disabled={uploading} className="gap-2">
            {uploading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
              : <><Upload className="h-4 w-4" /> {uploadedId ? "Re-upload" : "Upload"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
