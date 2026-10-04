import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, Loader2, RefreshCw, CheckCircle2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { Scene } from "@/contexts/ProjectContext";
import {
  analyzeLyricsHealth,
  loadAutoResyncPreference,
  saveAutoResyncPreference,
  previewResync,
  type ResyncReason,
  type DiffToken,
  type TranscriptWordLike,
} from "@/lib/lyrics-health";

interface LyricsValidationBannerProps {
  scenes: Scene[];
  /** Whether the active transcript has word-level timings (re-segmentation only works if true). */
  hasTranscriptWords: boolean;
  /** Transcript words used to compute predicted new lyrics in the diff view. */
  transcriptWords?: TranscriptWordLike[];
  /** True while a re-sync (re-segment + regen) is in flight. */
  resyncing: boolean;
  /** Disables the action button while other long-running ops are active. */
  busy?: boolean;
  /** Triggered when the user clicks "Re-run segmentation". Optional selected scene numbers (1-based) come from the preview dialog. */
  onResync: (selectedSceneNumbers?: Set<number>) => void;
  /** Notifies the parent when the user toggles the auto-resync preference. */
  onAutoResyncChange?: (enabled: boolean) => void;

}

export default function LyricsValidationBanner({
  scenes,
  hasTranscriptWords,
  transcriptWords,
  resyncing,
  busy = false,
  onResync,
  onAutoResyncChange,
}: LyricsValidationBannerProps) {
  const health = useMemo(() => analyzeLyricsHealth(scenes), [scenes]);
  const preview = useMemo(
    () => previewResync(scenes, transcriptWords ?? []),
    [scenes, transcriptWords],
  );
  const [autoResync, setAutoResync] = useState<boolean>(() => loadAutoResyncPreference());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedSceneNumbers, setSelectedSceneNumbers] = useState<Set<number>>(new Set());

  useEffect(() => {
    onAutoResyncChange?.(autoResync);
  }, [autoResync, onAutoResyncChange]);

  const handleToggleAuto = (next: boolean) => {
    setAutoResync(next);
    saveAutoResyncPreference(next);
  };

  const openPreview = () => {
    const defaults = new Set(preview.rows.filter((r) => r.willUpdate).map((r) => r.scene_number));
    setSelectedSceneNumbers(defaults);
    setPreviewOpen(true);
  };


  const toggleScene = (sceneNumber: number) => {
    setSelectedSceneNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(sceneNumber)) next.delete(sceneNumber);
      else next.add(sceneNumber);
      return next;
    });
  };

  const selectAllChanged = () => {
    setSelectedSceneNumbers(new Set(preview.rows.filter((r) => r.changed).map((r) => r.scene_number)));
  };

  const selectOnlyFlagged = () => {
    setSelectedSceneNumbers(new Set(preview.rows.filter((r) => r.willUpdate).map((r) => r.scene_number)));
  };

  const handleConfirmFromPreview = () => {
    setPreviewOpen(false);
    onResync(selectedSceneNumbers);
  };


  const reasonMeta: Record<ResyncReason, { label: string; tone: string }> = {
    empty: { label: "Empty", tone: "bg-warning/20 text-warning-foreground border-warning/40" },
    garbage: { label: "Corrupt", tone: "bg-destructive/20 text-destructive-foreground border-destructive/40" },
    instrumental: { label: "Instrumental", tone: "bg-muted text-muted-foreground border-border" },
    ok: { label: "OK", tone: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30" },
  };

  const renderDiff = (tokens: DiffToken[], side: "old" | "new") => {
    if (tokens.length === 0) {
      return <span className="italic text-muted-foreground">(empty)</span>;
    }
    return (
      <span className="leading-relaxed">
        {tokens.map((tok, i) => {
          if (tok.kind === "same") {
            return <span key={i} className="text-foreground/90">{tok.text} </span>;
          }
          if (side === "old" && tok.kind === "removed") {
            return (
              <span
                key={i}
                className="bg-destructive/20 text-destructive-foreground px-1 rounded line-through decoration-destructive/60"
              >
                {tok.text}{" "}
              </span>
            );
          }
          if (side === "new" && tok.kind === "added") {
            return (
              <span
                key={i}
                className="bg-emerald-500/20 text-emerald-100 px-1 rounded"
              >
                {tok.text}{" "}
              </span>
            );
          }
          return null;
        })}
      </span>
    );
  };

  const previewDialog = (
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview re-segmentation</DialogTitle>
          <DialogDescription>
            {!preview.hasPredictions
              ? "Predicted lyrics need a transcript with word-level timings — run Analyze Track first."
              : preview.willUpdateCount === 0
                ? "No scenes need re-bucketing — every populated scene already carries transcribed lyrics."
                : `${preview.willUpdateCount} of ${preview.rows.length} scene${preview.rows.length === 1 ? "" : "s"} will be re-bucketed. ${preview.unchangedCount} populated and ${preview.instrumentalCount} instrumental scene${preview.instrumentalCount === 1 ? "" : "s"} will be preserved.`}
          </DialogDescription>
        </DialogHeader>

        {preview.hasPredictions && (
          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-destructive/40" /> removed
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/40" /> added
            </span>
            <span className="ml-auto">
              {preview.rows.filter((r) => r.changed).length} scene
              {preview.rows.filter((r) => r.changed).length === 1 ? "" : "s"} with changes
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1.5 text-[10px] uppercase tracking-wide"
                onClick={selectAllChanged}
              >
                Select all changes
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1.5 text-[10px] uppercase tracking-wide"
                onClick={selectOnlyFlagged}
              >
                Select flagged only
              </Button>
            </div>
          </div>
        )}


        <ScrollArea className="max-h-[55vh] rounded-md border">
          <ul className="divide-y divide-border/60">
            {preview.rows.map((row) => {
              const meta = reasonMeta[row.reason];
              return (
                <li key={row.scene_number} className="px-3 py-3 text-xs">
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2">
                      {(row.willUpdate || row.changed) && (
                        <Checkbox
                          checked={selectedSceneNumbers.has(row.scene_number)}
                          onCheckedChange={() => toggleScene(row.scene_number)}
                          aria-label={`Select scene ${row.scene_number} for re-segmentation`}
                        />
                      )}
                      <span className="font-mono text-muted-foreground">#{row.scene_number}</span>
                      <Badge variant="outline" className={meta.tone}>{meta.label}</Badge>
                      {row.willUpdate ? (
                        <span className="text-[10px] uppercase tracking-wide text-amber-300">
                          Will update
                        </span>
                      ) : row.changed && preview.hasPredictions ? (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Preserved (manual edits kept)
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Unchanged
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] tabular-nums text-muted-foreground">
                      {selectedSceneNumbers.has(row.scene_number) ? "Selected" : ""}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded border border-border/60 bg-background/40 p-2">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Current
                      </div>
                      <div className="break-words">{renderDiff(row.currentDiff, "old")}</div>
                    </div>
                    <div className="rounded border border-border/60 bg-background/40 p-2">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Predicted after resync
                      </div>
                      <div className="break-words">
                        {preview.hasPredictions
                          ? renderDiff(row.predictedDiff, "new")
                          : <span className="italic text-muted-foreground">No transcript words available</span>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setPreviewOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmFromPreview}
            disabled={resyncing || busy || !hasTranscriptWords || selectedSceneNumbers.size === 0}
            className="gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Confirm re-segmentation ({selectedSceneNumbers.size})
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );

  // Nothing to validate yet
  if (health.total === 0) return null;

  if (!health.needsResync) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Lyrics validated — {health.populated} of {health.total} scenes carry transcribed lyrics
            {health.instrumental > 0 ? ` (${health.instrumental} marked instrumental)` : ""}.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-[11px] text-emerald-200 hover:text-emerald-100"
            onClick={openPreview}
          >
            <Eye className="h-3 w-3" /> Preview resync
          </Button>

          <Switch
            id="auto-resync-lyrics"
            checked={autoResync}
            onCheckedChange={handleToggleAuto}
            aria-label="Auto re-run segmentation when corrupt lyrics are detected"
          />
          <Label htmlFor="auto-resync-lyrics" className="text-[10px] uppercase tracking-wide opacity-75">
            Auto re-sync
          </Label>
        </div>
        {previewDialog}
      </div>
    );
  }

  const severity = health.garbage > 0 ? "critical" : "warning";
  const palette =
    severity === "critical"
      ? "border-destructive/50 bg-destructive/10 text-destructive-foreground"
      : "border-warning/50 bg-warning/10 text-warning-foreground";

  const headline =
    severity === "critical"
      ? `${health.garbage} scene${health.garbage === 1 ? "" : "s"} contain corrupt lyric data ("undefined")`
      : `${health.missing} of ${health.total} scenes are missing transcribed lyrics`;

  const reason = !hasTranscriptWords
    ? "Re-run Analyze Track first — no word-level timings are available to re-segment."
    : autoResync && resyncing
      ? "Auto re-sync is in progress — re-bucketing transcribed words into each scene."
      : autoResync
        ? "Auto re-sync is enabled — segmentation will retry automatically when the editor loads."
        : severity === "critical"
          ? "This usually means segmentation ran before the Whisper payload-shape fix. Re-run segmentation to overwrite the bad lyrics."
          : "Re-run segmentation to re-bucket transcribed words into each scene.";

  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 rounded-md border px-4 py-3 text-sm ${palette}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <div className="font-medium">{headline}</div>
            <p className="text-xs opacity-90">{reason}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10px] uppercase tracking-wide opacity-75">
              <span>Populated: {health.populated}</span>
              {health.instrumental > 0 && <span>Instrumental: {health.instrumental}</span>}
              {health.empty > 0 && <span>Empty: {health.empty}</span>}
              {health.garbage > 0 && <span>Corrupt: {health.garbage}</span>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button
            size="sm"
            variant={severity === "critical" ? "destructive" : "default"}
            onClick={() => onResync()}
            disabled={resyncing || busy || !hasTranscriptWords}
            className="gap-2"
          >

            {resyncing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            {resyncing ? "Re-syncing…" : "Re-run segmentation"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={openPreview}
            disabled={resyncing}
            className="gap-2"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview resync ({preview.willUpdateCount})
          </Button>

        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-current/10 pt-2">
        <Switch
          id="auto-resync-lyrics"
          checked={autoResync}
          onCheckedChange={handleToggleAuto}
          aria-label="Auto re-run segmentation when corrupt lyrics are detected"
        />
        <Label htmlFor="auto-resync-lyrics" className="text-[10px] uppercase tracking-wide opacity-75 cursor-pointer">
          Auto re-sync on load
        </Label>
      </div>
      {previewDialog}
    </div>
  );
}
