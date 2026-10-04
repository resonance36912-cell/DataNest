import { useEffect, useState, useCallback } from "react";
import { Download, Trash2, FileJson, FileText, FileSpreadsheet, RefreshCw, Archive, Loader2, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  listSavedConfidenceReports,
  downloadSavedConfidenceReport,
  deleteSavedConfidenceReport,
  type SavedConfidenceReport,
  type BrandingResolution,
  type BrandingFieldSource,
} from "@/lib/confidenceReport";
import { loadStoredBranding } from "@/components/analysis/ReportBrandingDialog";

interface Props {
  projectId: string | null;
  /** Bumped by parent after a save to force a refresh. */
  refreshKey?: number;
  /** Optional handler to re-load a saved JSON report into the Analysis step. */
  onLoad?: (report: SavedConfidenceReport) => Promise<void> | void;
}

const fmtIcon = (f: string) =>
  f === "json" ? <FileJson className="h-3.5 w-3.5 text-primary" />
  : f === "csv" ? <FileSpreadsheet className="h-3.5 w-3.5 text-success" />
  : <FileText className="h-3.5 w-3.5 text-warning" />;

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const FIELD_LABELS: Record<keyof BrandingResolution["fields"], string> = {
  logoSize: "Logo size",
  logoPadding: "Logo padding",
  pageSize: "Page size",
  watermarkOpacity: "Watermark opacity",
  watermarkFontSize: "Watermark font size",
  watermarkRotation: "Watermark rotation",
  logoDataUrl: "Logo image",
  watermarkText: "Watermark text",
  projectName: "Project name",
};

const SOURCE_STYLES: Record<BrandingFieldSource, { label: string; cls: string }> = {
  saved: { label: "saved", cls: "bg-success/15 text-success border-success/30" },
  "legacy-default": { label: "legacy default", cls: "bg-warning/15 text-warning border-warning/40" },
  override: { label: "override", cls: "bg-primary/15 text-primary border-primary/30" },
  default: { label: "default", cls: "bg-muted text-muted-foreground border-border" },
};

function BrandingResolutionPanel({ resolution }: { resolution: BrandingResolution }) {
  const order = Object.keys(FIELD_LABELS) as Array<keyof BrandingResolution["fields"]>;
  const sv = resolution.schemaVersion;
  const versionCls = sv.migrated
    ? "bg-warning/15 text-warning border-warning/40"
    : "bg-success/15 text-success border-success/30";
  const legacyFields = order.filter((k) => resolution.fields[k] === "legacy-default");
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span>Branding sources used</span>
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] tracking-wide ${versionCls}`}
            title={`Marker source: ${sv.markerSource} · Current schema: v${sv.current}`}
          >
            schema v{sv.inferred}{sv.migrated ? ` → v${sv.current}` : ""}
            {sv.markerSource === "inferred" ? " (inferred)" : ""}
          </span>
        </span>
        <span className="flex gap-2 normal-case tracking-normal">
          <span className="text-success">{resolution.savedCount} saved</span>
          {resolution.legacyBackfilledCount > 0 && (
            <span className="text-warning">{resolution.legacyBackfilledCount} legacy</span>
          )}
          <span className="text-primary">{resolution.overrideCount} override</span>
        </span>
      </div>
      <p className="mb-2 text-[10px] normal-case leading-snug text-muted-foreground">
        {sv.reason}
      </p>
      {legacyFields.length > 0 && (
        <div
          className="mb-2 rounded border border-warning/40 bg-warning/10 px-2 py-1.5"
          role="status"
          aria-label="Legacy backfilled branding fields"
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-[9px] uppercase tracking-wide text-warning">
            <span>Legacy backfilled ({legacyFields.length})</span>
            <span className="normal-case tracking-normal text-muted-foreground">
              filled by migration defaults
            </span>
          </div>
          <ul className="flex flex-wrap gap-1">
            {legacyFields.map((k) => (
              <li
                key={k}
                className="rounded border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-[9px] text-warning"
                title={`${FIELD_LABELS[k]} was missing from the saved snapshot and filled with the layout default.`}
              >
                {FIELD_LABELS[k]}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {order.map((k) => {
          const src = resolution.fields[k];
          const s = SOURCE_STYLES[src];
          return (
            <li key={k} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="truncate text-muted-foreground">{FIELD_LABELS[k]}</span>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${s.cls}`}
                title={
                  src === "legacy-default"
                    ? `${FIELD_LABELS[k]} — filled by legacy migration default (snapshot pre-dated this field)`
                    : src === "saved"
                    ? `${FIELD_LABELS[k]} — taken from the saved snapshot`
                    : src === "override"
                    ? `${FIELD_LABELS[k]} — taken from your current override`
                    : `${FIELD_LABELS[k]} — using built-in default`
                }
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SavedReportsPanel({ projectId, refreshKey = 0, onLoad }: Props) {
  const [reports, setReports] = useState<SavedConfidenceReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, BrandingResolution>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await listSavedConfidenceReports(projectId));
    } catch (err) {
      toast.error("Failed to load saved reports", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const handleDownload = async (r: SavedConfidenceReport) => {
    setBusyId(r.id);
    const toastId = toast.loading(`Preparing ${r.file_name}…`, { description: "Resolving branding sources" });
    try {
      const branding = loadStoredBranding();
      const hasBranding = !!(branding.projectName || branding.watermarkText || branding.logoDataUrl || branding.logoSize != null || branding.logoPadding != null || branding.pageSize);
      const result = await downloadSavedConfidenceReport(r, hasBranding ? branding : null);
      if (result.usedSnapshot && result.resolution) {
        setResolutions((prev) => ({ ...prev, [r.id]: result.resolution! }));
        setExpanded((prev) => ({ ...prev, [r.id]: true }));
        const { savedCount, overrideCount, legacyBackfilledCount, fields } = result.resolution;
        const logoFromLegacy = fields.logoSize === "legacy-default" || fields.logoPadding === "legacy-default";
        const logoSrc =
          fields.logoSize === "saved" || fields.logoPadding === "saved" ? "saved snapshot"
          : logoFromLegacy ? "legacy defaults (older report)"
          : (fields.logoSize === "override" || fields.logoPadding === "override" ? "current overrides" : "defaults");
        const parts = [
          `${savedCount} from saved snapshot`,
          legacyBackfilledCount ? `${legacyBackfilledCount} legacy default${legacyBackfilledCount === 1 ? "" : "s"}` : null,
          `${overrideCount} from current overrides`,
        ].filter(Boolean).join(", ");
        const sv = result.resolution.schemaVersion;
        const versionTag = sv.migrated
          ? `Migrated v${sv.inferred} → v${sv.current}${sv.markerSource === "inferred" ? " (inferred)" : ""}`
          : `Schema v${sv.inferred}`;
        toast.success("Re-downloaded with merged branding", {
          id: toastId,
          description: `${versionTag} · Logo settings: ${logoSrc} · ${parts}`,
        });
      } else if (hasBranding && (r.format === "json" || r.format === "pdf")) {
        toast.success("Downloaded original file", { id: toastId, description: "No saved snapshot found to merge branding into." });
      } else {
        toast.success("Downloaded", { id: toastId });
      }
    } catch (err) { toast.error("Download failed", { id: toastId, description: err instanceof Error ? err.message : String(err) }); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (r: SavedConfidenceReport) => {
    if (!confirm(`Delete "${r.file_name}"? This cannot be undone.`)) return;
    setBusyId(r.id);
    try {
      await deleteSavedConfidenceReport(r);
      setReports(prev => prev.filter(p => p.id !== r.id));
      setResolutions(prev => { const n = { ...prev }; delete n[r.id]; return n; });
      setExpanded(prev => { const n = { ...prev }; delete n[r.id]; return n; });
      toast.success("Report deleted");
    } catch (err) {
      toast.error("Delete failed", { description: err instanceof Error ? err.message : String(err) });
    } finally { setBusyId(null); }
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Saved confidence reports</h3>
          <span className="text-[10px] text-muted-foreground">({reports.length})</span>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 gap-1 text-xs">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </Button>
      </div>

      {reports.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No saved reports yet. Use <span className="font-medium">Export confidence → Save to account</span> to keep one for later.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {reports.map(r => {
            const summary = r.summary as { lyrics_confidence_pct?: number; bpm_confidence_pct?: number; word_count?: number };
            const resolution = resolutions[r.id];
            const isExpanded = !!expanded[r.id];
            return (
              <li key={r.id} className="py-2 text-xs">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-secondary shrink-0">{fmtIcon(r.format)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.file_name}</span>
                      {r.source === "verified" && (
                        <span className="text-[9px] uppercase tracking-wide text-success border border-success/30 rounded px-1">verified</span>
                      )}
                      {resolution && (
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1">
                          {resolution.savedCount}s · {resolution.legacyBackfilledCount}l · {resolution.overrideCount}o
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                      <span>{formatBytes(r.file_size_bytes)}</span>
                      {summary.lyrics_confidence_pct != null && <span>Lyrics {summary.lyrics_confidence_pct}%</span>}
                      {summary.bpm_confidence_pct != null && <span>BPM {summary.bpm_confidence_pct}%</span>}
                      {summary.word_count != null && <span>{summary.word_count} words</span>}
                    </div>
                  </div>
                  {resolution && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                      title={isExpanded ? "Hide branding sources" : "Show branding sources"}
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                  {onLoad && r.format === "json" && (
                    <Button
                      variant="outline" size="sm" className="h-7 gap-1 text-xs"
                      disabled={busyId === r.id}
                      onClick={async () => {
                        setBusyId(r.id);
                        try { await onLoad(r); }
                        catch (err) { toast.error("Load failed", { description: err instanceof Error ? err.message : String(err) }); }
                        finally { setBusyId(null); }
                      }}
                      title="Load this report back into the Analysis step"
                    >
                      <Upload className="h-3 w-3" />
                      <span className="hidden sm:inline">Load</span>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={busyId === r.id} onClick={() => handleDownload(r)}>
                    {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" disabled={busyId === r.id} onClick={() => handleDelete(r)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {resolution && isExpanded && <BrandingResolutionPanel resolution={resolution} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
