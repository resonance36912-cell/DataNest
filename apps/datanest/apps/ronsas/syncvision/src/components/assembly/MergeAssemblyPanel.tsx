import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Film, Loader2, CheckCircle2, AlertCircle, Download, RotateCcw, Settings2, ChevronDown, ChevronRight, AlertTriangle, RefreshCw, CreditCard, ExternalLink, Activity, Ban, ClipboardCopy, HelpCircle, FileJson, FileSpreadsheet, Package, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ProcessProgressBar from "@/components/ProcessProgressBar";
import { ProgressSourceHint } from "@/components/ui/progress-source-hint";
import JobDetailsDrawer from "@/components/jobs/JobDetailsDrawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Settings as SettingsIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MergeJobState } from "@/hooks/useAssemblyMerge";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import type { SceneTrim } from "@/components/assembly/SceneTrimEditor";
import {
  MASTER_OUTPUT_FPS,
  MASTER_OUTPUT_RESOLUTIONS,
  MASTER_QUALITY_PROFILE,
} from "@/lib/master-quality";
import type { CsvExportMode } from "@/lib/merge-debug-report";
import { buildMergeDebugReport } from "@/lib/merge-debug-report";
import StuckDetailsExpander from "@/components/assembly/StuckDetailsExpander";

export interface MergeOutputSettings {
  resolution: string;
  fps: number;
}

interface MergeAssemblyPanelProps {
  mergeState: MergeJobState;
  onMerge: (settings: MergeOutputSettings) => void;
  onReset: () => void;
  sceneCount: number;
  hasAllVideos: boolean;
  hasAudio: boolean;
  scenes?: SavedScene[];
  /** Manually re-poll the provider for stuck jobs (calls forceProviderPoll). */
  onForceRefresh?: () => void | Promise<unknown>;
  /** True when no progress/phase change in ~20s while processing. */
  isStuck?: boolean;
  /** True while a forceRefresh request is in flight. */
  refreshing?: boolean;
  /** Remaining cooldown in ms before the user can refresh again. 0 = ready. */
  cooldownRemainingMs?: number;
  /** Epoch ms of the most recent successful provider/reconcile poll. */
  lastPollAt?: number | null;
  /** When true, the hook auto-triggers Force refresh after 20s of no movement. */
  autoRefreshOnStuck?: boolean;
  onAutoRefreshChange?: (v: boolean) => void;
  /** When true, the hook continuously auto-polls the provider during the merge until it finishes. */
  autoRefreshContinuous?: boolean;
  onAutoRefreshContinuousChange?: (v: boolean) => void;
  /** Total number of Force refresh attempts since the merge started. */
  refreshAttempts?: number;
  /** Consecutive refreshes that returned no new movement (warning signal). */
  consecutiveFailures?: number;
  /** Total number of Retry-merge presses since the page was opened. */
  retryAttempts?: number;
  /** Whether the most recent retry was triggered by the user or auto-recovery. */
  lastRetrySource?: "manual" | "auto" | null;
  /** Epoch ms timestamp of the most recent retry (manual or auto). */
  lastRetryAt?: number | null;
  /** True while a Retry-merge press is being processed. Disables retry buttons. */
  retryPending?: boolean;
  /** Cancel the in-flight merge job (best-effort fal cancel + DB terminal). */
  onCancel?: () => void | Promise<unknown>;
  /** True while a cancel request is in flight. Disables the cancel button. */
  canceling?: boolean;
  /** Smoothed display value (0-100) for the progress bar. Falls back to mergeState.progress when omitted. */
  displayedProgress?: number;
  /** Whether `displayedProgress` is currently driven by real DB updates or a simulated baseline. */
  progressSource?: import("@/hooks/useSmoothedProgress").ProgressSource;
  /** Epoch ms of the most recent real backend sample, or null. */
  progressLastRealAt?: number | null;
  /** Show a stale-poll warning when no provider update arrives within this many ms. Default 45000. */
  stalePollThresholdMs?: number;
  /** Where lastPollAt came from — used to label the timestamp tooltip. */
  lastPollSource?: "envelope" | "wallclock" | null;
  /** Optional alternate merge providers the user can switch to mid-stuck. Empty/undefined hides the button. */
  alternateProviders?: Array<{ id: string; label: string; description?: string }>;
  /** Invoked when the user picks an alternate provider from the stuck panel. */
  onSwitchProvider?: (providerId: string) => void | Promise<unknown>;
  /** True while a provider switch is in flight. */
  switchingProvider?: boolean;
  /** True when auto Force-refresh has been paused after repeated ineffective polls. */
  autoRefreshSuspended?: boolean;
  /** Clear the ineffective-poll counter so auto Force-refresh can resume. */
  onResumeAutoRefresh?: () => void;
  /** Persisted-per-job refresh attempt history (oldest first). */
  refreshHistory?: import("@/hooks/useAssemblyMerge").RefreshHistoryEntry[];
  /** Configurable confidence thresholds (0-1) for auto-marking effectiveness. */
  confidenceThresholds?: { effectiveAtLeast: number; ineffectiveBelow: number };
  /** Update one or both confidence thresholds. */
  onConfidenceThresholdsChange?: (next: Partial<{ effectiveAtLeast: number; ineffectiveBelow: number }>) => void;
  /** Build and download the merge debug report (JSON). Shown after success/failure. */
  onDownloadDebugReport?: () => void | Promise<unknown>;
  /** Build and download the merge debug report CSV sheets. Shown after success/failure. */
  onDownloadDebugCsv?: (mode: CsvExportMode) => void | Promise<unknown>;
  /** Build and download the merge debug report as a ZIP (JSON + CSVs). Shown after success/failure. */
  onDownloadDebugZip?: () => void | Promise<unknown>;
  projectId?: string | null;
  audioUrl?: string | null;
  audioDurationSec?: number | null;
  trims?: Record<number, SceneTrim>;
}

const phaseLabels: Record<string, string> = {
  idle: "Ready to merge",
  concat: "Stitching scene videos…",
  audio: "Syncing with master audio…",
  lipsync: "Applying Sync Lipsync 2 Pro…",
  normalize: "Normalizing master quality / -14 LUFS…",
  done: "Final video ready!",
  error: "Merge failed",
};

/** Warn when refresh BPM jumps by this much or more — usually signals re-detection misfire. */
const BPM_DRIFT_THRESHOLD = 5;

/** Likely audio/upstream causes for a low transcription confidence score (0-1). */
function lyricsLowConfReasons(score: number | null | undefined): string[] {
  if (typeof score !== "number") return [];
  if (score >= 0.8) return [];
  const reasons = [
    "Background noise, hiss, or room echo masking the vocal",
    "Heavy effects (autotune, reverb, distortion) on the lead vocal",
    "Overlapping vocals (ad-libs, choir, double-tracking)",
    "Mumbled, slurred, or whispered delivery",
    "Non-English / mixed-language lyrics the model can't align",
  ];
  if (score < 0.5) {
    reasons.unshift("Audio clipping or distortion at peaks");
    reasons.push("Very low input level — vocal is buried under the instrumental");
  }
  return reasons;
}

/** Likely musical / upstream causes for a low BPM detection confidence score (0-1). */
function bpmLowConfReasons(score: number | null | undefined): string[] {
  if (typeof score !== "number") return [];
  if (score >= 0.8) return [];
  const reasons = [
    "Tempo changes mid-song (rubato, ramp-up, breakdowns)",
    "Weak or missing percussive transients (ambient/orchestral material)",
    "Polyrhythms or syncopation confusing the beat tracker",
    "Half-time / double-time ambiguity (detector locked an octave off)",
  ];
  if (score < 0.5) {
    reasons.unshift("Audio clipping or heavy compression flattening transients");
    reasons.push("Long intro/outro of silence skewing the global tempo estimate");
  }
  return reasons;
}

interface SceneValidation {
  sceneNumber: number;
  audioDuration: number;
  hasVideo: boolean;
  timeStart: string;
  timeEnd: string;
  lyric: string;
  drift: boolean;
}

export default function MergeAssemblyPanel({
  mergeState,
  onMerge,
  onReset,
  sceneCount,
  hasAllVideos,
  hasAudio,
  scenes,
  onForceRefresh,
  isStuck = false,
  refreshing = false,
  cooldownRemainingMs = 0,
  lastPollAt = null,
  autoRefreshOnStuck = false,
  onAutoRefreshChange,
  autoRefreshContinuous = false,
  onAutoRefreshContinuousChange,
  refreshAttempts = 0,
  consecutiveFailures = 0,
  retryAttempts = 0,
  lastRetrySource = null,
  lastRetryAt = null,
  retryPending = false,
  onCancel,
  canceling = false,
  displayedProgress,
  progressSource,
  progressLastRealAt,
  stalePollThresholdMs = 45_000,
  lastPollSource = null,
  alternateProviders = [],
  onSwitchProvider,
  switchingProvider = false,
  autoRefreshSuspended = false,
  onResumeAutoRefresh,
  refreshHistory = [],
  confidenceThresholds = { effectiveAtLeast: 0.8, ineffectiveBelow: 0.4 },
  onConfidenceThresholdsChange,
  onDownloadDebugReport,
  onDownloadDebugCsv,
  onDownloadDebugZip,
  projectId,
  audioUrl,
  audioDurationSec,
  trims,
}: MergeAssemblyPanelProps) {
  // Prefer the smoothed value from the hook; fall back to the raw real value
  // when callers haven't wired it through (preserves backwards compatibility).
  const barProgress = typeof displayedProgress === "number" ? displayedProgress : mergeState.progress;
  const [resolution, setResolution] = useState<string>(MASTER_QUALITY_PROFILE.assembly.resolution);
  const [fps, setFps] = useState(String(MASTER_QUALITY_PROFILE.assembly.fps));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [selectedRefreshId, setSelectedRefreshId] = useState<string | null>(null);
  const [csvMode, setCsvMode] = useState<CsvExportMode>("both");
  const selectedRefresh = useMemo(
    () => refreshHistory.find((e) => e.id === selectedRefreshId) ?? null,
    [refreshHistory, selectedRefreshId],
  );

  const debugReport = useMemo(() => {
    if (!scenes || scenes.length === 0) return null;
    return buildMergeDebugReport({
      projectId: projectId ?? null,
      audioUrl: audioUrl ?? null,
      audioDurationSec,
      scenes,
      trims: trims ?? {},
      mergeState,
    });
  }, [projectId, audioUrl, audioDurationSec, scenes, trims, mergeState]);

  // Backoff retry: exponential schedule keyed off retryAttempts so each
  // successive failure waits longer before re-firing the merge. Countdown
  // ticks once per second; clearing on unmount avoids stray timers.
  const BACKOFF_LADDER_SEC = [5, 15, 45, 120];
  const nextBackoffSec =
    BACKOFF_LADDER_SEC[Math.min(retryAttempts, BACKOFF_LADDER_SEC.length - 1)];
  const [backoffRemainingSec, setBackoffRemainingSec] = useState(0);
  const [altProviderId, setAltProviderId] = useState<string>(
    () => alternateProviders[0]?.id ?? "",
  );
  useEffect(() => {
    if (!alternateProviders.find((p) => p.id === altProviderId)) {
      setAltProviderId(alternateProviders[0]?.id ?? "");
    }
  }, [alternateProviders, altProviderId]);
  useEffect(() => {
    if (backoffRemainingSec <= 0) return;
    const id = window.setInterval(() => {
      setBackoffRemainingSec((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          // Fire the actual retry: clear current job state then re-submit
          // with the user's current resolution/fps selections.
          onReset();
          onMerge({ resolution, fps: parseInt(fps) });
          return 0;
        }
        return s - 1;
      });
    }, 1_000);
    return () => window.clearInterval(id);
  }, [backoffRemainingSec, onReset, onMerge, resolution, fps]);

  // Re-render every 10s so the "X ago" label stays fresh.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (!lastPollAt) return;
    const id = setInterval(() => setNowTick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, [lastPollAt]);
  const lastPollLabel = useMemo(() => {
    if (!lastPollAt) return null;
    const secs = Math.max(0, Math.round((Date.now() - lastPollAt) / 1000));
    if (secs < 5) return "just now";
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }, [lastPollAt]);
  // Stale-poll detection: warn when no provider update has arrived in
  // `stalePollThresholdMs`. Re-evaluated on the same 5s tick that refreshes
  // `lastPollLabel`, so the badge shows up promptly without a dedicated timer.
  const pollAgeMs = lastPollAt ? Date.now() - lastPollAt : null;
  const pollIsStale = pollAgeMs !== null && pollAgeMs >= stalePollThresholdMs;
  const staleThresholdLabel = stalePollThresholdMs >= 60_000
    ? `${Math.round(stalePollThresholdMs / 60_000)}m`
    : `${Math.round(stalePollThresholdMs / 1_000)}s`;

  const isProcessing = mergeState.phase === "concat" || mergeState.phase === "audio" || mergeState.phase === "lipsync" || mergeState.phase === "normalize";
  const isDone = mergeState.phase === "done";
  const isError = mergeState.phase === "error";
  const canMerge = hasAllVideos && hasAudio && !isProcessing;
  const isIdle = mergeState.phase === "idle";

  // Build validation data
  const validation = useMemo<{ rows: SceneValidation[]; totalAudio: number; mismatchCount: number; missingVideo: number }>(() => {
    if (!scenes || scenes.length === 0) return { rows: [], totalAudio: 0, mismatchCount: 0, missingVideo: 0 };

    const rows: SceneValidation[] = scenes.map((s) => {
      const audioDur = s.durationSec;
      // We don't have independent video duration metadata, so we flag scenes where audio segment is unusually short/long
      const drift = audioDur < 1 || audioDur > 35;
      return {
        sceneNumber: s.sceneNumber,
        audioDuration: audioDur,
        hasVideo: !!s.videoUrl,
        timeStart: s.timeStart || "—",
        timeEnd: s.timeEnd || "—",
        lyric: (s.lyricSegment || "").slice(0, 40),
        drift,
      };
    });

    const totalAudio = rows.reduce((sum, r) => sum + r.audioDuration, 0);
    const mismatchCount = rows.filter((r) => r.drift).length;
    const missingVideo = rows.filter((r) => !r.hasVideo).length;

    return { rows, totalAudio, mismatchCount, missingVideo };
  }, [scenes]);

  const hasIssues = validation.mismatchCount > 0 || validation.missingVideo > 0;

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            Stitch &amp; Export Final Video
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isDone
              ? "Your final video is ready to download"
              : `Merge ${sceneCount} scenes with the master audio into one MP4`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isIdle && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs"
              onClick={() => setShowSettings(s => !s)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {showSettings ? "Hide" : "Quality"}
            </Button>
          )}

          {isDone && mergeState.finalUrl && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" asChild>
              <a href={mergeState.finalUrl} target="_blank" rel="noopener noreferrer" download>
                <Download className="h-3.5 w-3.5" /> Download MP4
              </a>
            </Button>
          )}

          {(isDone || isError) && onDownloadDebugReport && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => onDownloadDebugReport()}
              title="Download merge debug report (effective windows, timeline gaps, job metadata)"
            >
              <FileJson className="h-3.5 w-3.5" />
              Debug JSON
            </Button>
          )}

          {(isDone || isError) && onDownloadDebugCsv && (
            <>
              <Select value={csvMode} onValueChange={(v) => setCsvMode(v as CsvExportMode)}>
                <SelectTrigger className="h-7 w-[100px] text-xs px-2" title="CSV export mode">
                  <SelectValue placeholder="Both" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both</SelectItem>
                  <SelectItem value="windows">Windows</SelectItem>
                  <SelectItem value="gaps">Gaps</SelectItem>
                  <SelectItem value="overlaps">Overlaps</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => onDownloadDebugCsv(csvMode)}
                title="Download merge debug CSV"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Debug CSV
              </Button>
            </>
          )}

          {(isDone || isError) && onDownloadDebugZip && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => onDownloadDebugZip()}
              title="Download merge debug ZIP (JSON + CSVs)"
            >
              <Package className="h-3.5 w-3.5" />
              Debug ZIP
            </Button>
          )}

          {(isDone || isError) && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => onReset()} disabled={retryPending}>
                {retryPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {retryPending ? "Retrying…" : isError ? "Retry" : "Re-merge"}
              </Button>
              {retryAttempts > 0 && (
                <Badge
                  variant="outline"
                  className={`h-5 px-1.5 text-[10px] font-normal ${
                    lastRetrySource === "auto"
                      ? "border-amber-500/50 text-amber-500"
                      : "border-border text-muted-foreground"
                  }`}
                  title={
                    lastRetryAt
                      ? `Last retry ${new Date(lastRetryAt).toLocaleTimeString()} · ${
                          lastRetrySource === "auto" ? "auto-recovery" : "manual"
                        }`
                      : undefined
                  }
                >
                  {retryAttempts}× · {lastRetrySource === "auto" ? "auto" : "manual"}
                </Badge>
              )}
            </div>
          )}

          {mergeState.mergeJobId && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs"
              onClick={() => setDetailsOpen(true)}
              title="Inspect job timeline, segments, and errors"
            >
              <Activity className="h-3.5 w-3.5" />
              Details
            </Button>
          )}

          {!isDone && !isError && (
            <Button
              size="sm"
              onClick={() => onMerge({ resolution, fps: parseInt(fps) })}
              disabled={!canMerge}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isProcessing ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Merging…</>
              ) : (
                <><Film className="h-3.5 w-3.5" /> Merge All</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Post-merge debug preview tables */}
      {(isDone || isError) && debugReport && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-card/50 p-3">
          {/* Effective windows preview */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              <Eye className="h-3 w-3" />
              effective_windows
              <span className="text-[10px] normal-case text-muted-foreground/70">
                ({debugReport.effective_windows.length} row{debugReport.effective_windows.length === 1 ? "" : "s"})
              </span>
            </div>
            <div className="rounded border border-border overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-x-3 px-2 py-1.5 bg-muted/40 text-[10px] font-mono text-muted-foreground border-b border-border">
                <span>#</span>
                <span>start_offset</span>
                <span>end_offset</span>
                <span>kept</span>
                <span>src_dur</span>
                <span>flag</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {debugReport.effective_windows.map((w) => (
                  <div
                    key={w.scene_number}
                    className={`grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-x-3 px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0 ${
                      w.overflow ? "bg-destructive/10 text-destructive" : "text-foreground"
                    }`}
                  >
                    <span>S{String(w.scene_number).padStart(2, "0")}</span>
                    <span>{w.start_offset_sec.toFixed(2)}s</span>
                    <span>{w.end_offset_sec.toFixed(2)}s</span>
                    <span>{w.kept_sec.toFixed(2)}s</span>
                    <span>{w.source_duration_sec !== null ? `${w.source_duration_sec.toFixed(2)}s` : "—"}</span>
                    <span className="text-[9px]">
                      {w.overflow ? `+${w.overflow_sec.toFixed(2)}s EOF` : w.is_default ? "default" : "edited"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline gaps preview */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              <Eye className="h-3 w-3" />
              timeline_gaps
              <span className="text-[10px] normal-case text-muted-foreground/70">
                ({debugReport.timeline_gaps.length} row{debugReport.timeline_gaps.length === 1 ? "" : "s"})
              </span>
            </div>
            {debugReport.timeline_gaps.length === 0 ? (
              <div className="rounded border border-border bg-muted/20 px-2 py-2 text-[10px] text-muted-foreground italic">
                No gaps or overlaps detected on the song timeline.
              </div>
            ) : (
              <div className="rounded border border-border overflow-hidden">
                <div className="max-h-40 overflow-y-auto">
                  {debugReport.timeline_gaps.map((g, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0 ${
                        g.kind === "overlap"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : g.kind === "tail"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          : "text-foreground"
                      }`}
                    >
                      <span className="uppercase text-[9px] font-semibold w-12">{g.kind}</span>
                      <span className="flex-1">
                        {g.from_scene !== null ? `S${String(g.from_scene).padStart(2, "0")}` : "—"}
                        {" → "}
                        {g.to_scene !== null ? `S${String(g.to_scene).padStart(2, "0")}` : "audio end"}
                      </span>
                      <span>{g.from_sec.toFixed(2)}s → {g.to_sec.toFixed(2)}s</span>
                      <span className="font-semibold">{g.delta_sec >= 0 ? "+" : ""}{g.delta_sec.toFixed(2)}s</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pre-merge validation panel */}
      {scenes && scenes.length > 0 && isIdle && (
        <Collapsible open={validationOpen} onOpenChange={setValidationOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md hover:bg-secondary/50 transition-colors">
              {validationOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="text-xs font-medium">Pre-merge Validation</span>
              {hasIssues ? (
                <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                  {validation.mismatchCount + validation.missingVideo} issue{validation.mismatchCount + validation.missingVideo > 1 ? "s" : ""}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 text-emerald-600">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                  All clear
                </Badge>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                Total: {validation.totalAudio.toFixed(1)}s across {scenes.length} scenes
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-lg border border-border overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border">
                    <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Scene</th>
                    <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Time Range</th>
                    <th className="text-right px-2.5 py-1.5 font-medium text-muted-foreground">Audio Dur.</th>
                    <th className="text-center px-2.5 py-1.5 font-medium text-muted-foreground">Video</th>
                    <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Lyrics</th>
                    <th className="text-center px-2.5 py-1.5 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.rows.map((row, i) => (
                    <tr
                      key={row.sceneNumber}
                      className={`border-b border-border/50 last:border-0 ${
                        row.drift || !row.hasVideo ? "bg-destructive/5" : i % 2 === 0 ? "bg-background" : "bg-secondary/20"
                      }`}
                    >
                      <td className="px-2.5 py-1.5 font-mono font-medium">S{String(row.sceneNumber).padStart(2, "0")}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{row.timeStart} → {row.timeEnd}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono">{row.audioDuration.toFixed(1)}s</td>
                      <td className="px-2.5 py-1.5 text-center">
                        {row.hasVideo ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-destructive inline" />
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[140px]">{row.lyric || "—"}</td>
                      <td className="px-2.5 py-1.5 text-center">
                        {!row.hasVideo ? (
                          <span className="text-destructive font-medium">No video</span>
                        ) : row.drift ? (
                          <span className="text-amber-500 font-medium">⚠ Duration</span>
                        ) : (
                          <span className="text-emerald-600">✓ OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Output settings */}
      {showSettings && isIdle && (
        <div className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Resolution</label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MASTER_OUTPUT_RESOLUTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Frame Rate</label>
            <Select value={fps} onValueChange={setFps}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MASTER_OUTPUT_FPS.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Progress */}
      {(isProcessing || isDone) && (
        <div className="space-y-1.5">
          {progressSource && (isProcessing || isDone) && (
            <div className="flex items-center justify-end">
              <ProgressSourceHint
                source={isDone ? "complete" : progressSource}
                lastRealAt={progressLastRealAt ?? null}
              />
            </div>
          )}
          <ProcessProgressBar
            progress={barProgress}
            active={isProcessing}
            label={phaseLabels[mergeState.phase] || "Processing…"}
            barHeight="h-2"
          />
          {isProcessing && (
            <div className="flex items-start justify-between gap-3">
              <p className="text-[10px] text-muted-foreground flex-1">
                {mergeState.phase === "concat"
                  ? `Phase 1/4: Composing ${sceneCount} video clips with audio…`
                  : mergeState.phase === "lipsync"
                  ? "Phase 3/4: Applying Sync Lipsync 2 Pro for lip synchronisation…"
                  : mergeState.phase === "normalize"
                  ? "Phase 4/4: Normalizing to 1920×1080, 48 kHz, -14 LUFS…"
                  : "Phase 2/4: Mixing master audio track with video…"}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                {onForceRefresh && (() => {
                  const cooldownActive = cooldownRemainingMs > 0;
                  const cooldownSecs = Math.ceil(cooldownRemainingMs / 1000);
                  // Stay clickable during cooldown so the click surfaces a
                  // toast with the remaining time — only block while a real
                  // refresh request is in flight.
                  const disabled = refreshing;
                  return (
                    <Button
                      size="sm"
                      variant={isStuck && !cooldownActive ? "default" : "ghost"}
                      className="h-6 gap-1 text-[10px] px-2 tabular-nums"
                      onClick={() => onForceRefresh()}
                      disabled={disabled}
                      title={
                        cooldownActive
                          ? `Wait ${cooldownSecs}s — provider was just polled.`
                          : "Re-poll the provider for the latest job status"
                      }
                    >
                      <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                      {refreshing
                        ? "Refreshing…"
                        : cooldownActive
                          ? `Wait ${cooldownSecs}s`
                          : isStuck ? "Force refresh" : "Refresh"}
                    </Button>
                  );
                })()}
                {onCancel && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 text-[10px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onCancel()}
                    disabled={canceling}
                    title="Cancel this merge job and stop polling the provider"
                  >
                    {canceling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Ban className="h-3 w-3" />
                    )}
                    {canceling ? "Cancelling…" : "Cancel"}
                  </Button>
                )}
              </div>
            </div>
          )}
          {isProcessing && (lastPollLabel || lastPollAt) && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
              <Activity className="h-3 w-3" />
              <span>Last provider update</span>
              {lastPollAt && (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-mono text-foreground/90 underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 cursor-help">
                        {new Date(lastPollAt).toLocaleString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <div className="space-y-1">
                        <p className="font-semibold">
                          Source: {lastPollSource === "envelope"
                            ? "Provider envelope (DB updatedAt)"
                            : lastPollSource === "wallclock"
                              ? "Local wall clock (manual refresh / fallback)"
                              : "Unknown"}
                        </p>
                        <p className="text-muted-foreground">
                          {lastPollSource === "envelope"
                            ? "Timestamp parsed from the render_jobs.updated_at column returned by the unified poller — reflects when the worker actually wrote to the DB."
                            : "Timestamp captured from the browser clock right after a Force refresh succeeded (or when the envelope had no updatedAt to parse)."}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {new Date(lastPollAt).toISOString()}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {lastPollLabel && (
                <span className="text-muted-foreground/80">· {lastPollLabel}</span>
              )}
            </p>
          )}
          {isProcessing && pollIsStale && pollAgeMs !== null && (
            <p
              className="text-[10px] text-amber-500 flex items-center gap-1"
              role="status"
              aria-live="polite"
            >
              <AlertTriangle className="h-3 w-3" />
              No provider update in {Math.round(pollAgeMs / 1000)}s (threshold {staleThresholdLabel}) — the merge job may be stuck.
            </p>
          )}
          {isProcessing && onAutoRefreshChange && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5">
              <Label htmlFor="auto-refresh-stuck" className="text-[10px] text-muted-foreground cursor-pointer">
                Auto Force refresh after 20s stuck
              </Label>
              <Switch
                id="auto-refresh-stuck"
                checked={autoRefreshOnStuck}
                onCheckedChange={onAutoRefreshChange}
                aria-label="Auto Force refresh when stuck"
              />
            </div>
          )}
          {isProcessing && onAutoRefreshContinuousChange && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5">
              <Label htmlFor="auto-refresh-continuous" className="text-[10px] text-muted-foreground cursor-pointer">
                Auto-poll provider until merge finishes
              </Label>
              <Switch
                id="auto-refresh-continuous"
                checked={autoRefreshContinuous}
                onCheckedChange={onAutoRefreshContinuousChange}
                aria-label="Continuously auto-poll provider during merge"
              />
            </div>
          )}
          {isProcessing && isStuck && cooldownRemainingMs <= 0 && (
            <p className="text-[10px] text-amber-500 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              No progress for 20s — try Force refresh to re-poll fal.ai.
            </p>
          )}
          {isProcessing && cooldownRemainingMs > 0 && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              Cooldown active — next manual refresh available in {Math.ceil(cooldownRemainingMs / 1000)}s.
            </p>
          )}
          {/* Stuck diagnostics — short snapshot for debugging when no movement */}
          {isProcessing && isStuck && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Stuck diagnostics
                </p>
                <button
                  type="button"
                  onClick={() => {
                    // Snapshot exactly what's visible so support tickets / chat
                    // pastes contain the same numbers the user is staring at.
                    const lines = [
                      "Stuck diagnostics",
                      `Phase: ${phaseLabels[mergeState.phase] || mergeState.phase || "—"}`,
                      `Progress: ${Math.round(mergeState.progress || 0)}%`,
                      `Last poll: ${lastPollLabel ?? "—"}${lastPollAt ? ` (${new Date(lastPollAt).toISOString()})` : ""}${lastPollSource ? ` [source: ${lastPollSource}]` : ""}`,
                      `Time since poll: ${pollAgeMs !== null ? `${(pollAgeMs / 1000).toFixed(1)}s` : "—"} / threshold ${staleThresholdLabel}${pollIsStale ? " — STALE" : ""}`,
                      `Refreshes: ${refreshAttempts}${consecutiveFailures > 0 ? ` (${consecutiveFailures} ineffective)` : ""}`,
                    ];
                    if (retryAttempts > 0) {
                      lines.push(
                        `Retries: ${retryAttempts}× ${lastRetrySource === "auto" ? "auto-recovery" : "manual"}${lastRetryAt ? ` at ${new Date(lastRetryAt).toISOString()}` : ""}`,
                      );
                    }
                    if (mergeState.mergeJobId) lines.push(`Job: ${mergeState.mergeJobId}`);
                    if (mergeState.error || mergeState.errorCode) {
                      lines.push(`Error: ${mergeState.errorCode ? `[${mergeState.errorCode}] ` : ""}${mergeState.error || "Unknown error"}`);
                    }
                    if (consecutiveFailures >= 3) {
                      lines.push(`Note: provider unresponsive after ${consecutiveFailures} refreshes`);
                    }
                    lines.push(`Captured: ${new Date().toISOString()}`);
                    const text = lines.join("\n");
                    navigator.clipboard.writeText(text).then(
                      () => toast.success("Diagnostics copied"),
                      () => toast.error("Copy failed"),
                    );
                  }}
                  className="inline-flex items-center gap-1 rounded border border-amber-500/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-400 hover:bg-amber-500/10 transition-colors"
                  title="Copy these diagnostics to clipboard"
                >
                  <ClipboardCopy className="h-2.5 w-2.5" />
                  Copy
                </button>
              </div>
              <dl className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 text-[10px] tabular-nums">
                <dt className="text-muted-foreground">Phase</dt>
                <dd className="text-foreground/90">{phaseLabels[mergeState.phase] || mergeState.phase || "—"}</dd>
                <dt className="text-muted-foreground">Progress</dt>
                <dd className="text-foreground/90">{Math.round(mergeState.progress || 0)}%</dd>
                <dt className="text-muted-foreground">Last poll</dt>
                <dd className="text-foreground/90">{lastPollLabel ?? "—"}</dd>
                <dt className="text-muted-foreground">Time since</dt>
                <dd
                  className={pollIsStale ? "text-amber-400" : "text-foreground/90"}
                  title={
                    pollAgeMs !== null
                      ? `Exact: ${(pollAgeMs / 1000).toFixed(1)}s · Stale threshold: ${staleThresholdLabel}`
                      : "No poll recorded yet"
                  }
                >
                  {pollAgeMs !== null
                    ? `${Math.round(pollAgeMs / 1000)}s / ${staleThresholdLabel}`
                    : "—"}
                </dd>
                <dt className="text-muted-foreground">Refreshes</dt>
                <dd className={consecutiveFailures >= 3 ? "text-red-400" : "text-foreground/90"}>
                  {refreshAttempts}
                  {consecutiveFailures > 0 && (
                    <span className="text-muted-foreground"> ({consecutiveFailures} ineffective)</span>
                  )}
                </dd>
                {(() => {
                  const last = refreshHistory.length > 0 ? refreshHistory[refreshHistory.length - 1] : null;
                  if (!last) return null;
                  const ageSec = Math.max(0, Math.round((Date.now() - last.at) / 1000));
                  const ageLabel = ageSec < 60
                    ? `${ageSec}s ago`
                    : ageSec < 3600
                    ? `${Math.round(ageSec / 60)}m ago`
                    : `${Math.round(ageSec / 3600)}h ago`;
                  const before = typeof last.progressBefore === "number" ? last.progressBefore : null;
                  const after = typeof last.progressAfter === "number" ? last.progressAfter : null;
                  const advBefore = typeof last.lastAdvanceBefore === "number" ? last.lastAdvanceBefore : null;
                  const advAfter = typeof last.lastAdvanceAfter === "number" ? last.lastAdvanceAfter : null;
                  // Build inline delta string: "+5% / +3.2s" — progress and
                  // job-advance timestamp shifts since the attempt started.
                  const deltaParts: string[] = [];
                  let deltaCls = "text-muted-foreground";
                  if (before !== null && after !== null) {
                    const dp = after - before;
                    deltaParts.push(`${dp > 0 ? "+" : ""}${dp}%`);
                    if (dp > 0) deltaCls = "text-emerald-400";
                    else if (dp < 0) deltaCls = "text-amber-400";
                  } else if (before !== null && after === null) {
                    deltaParts.push(`${before}%→…`);
                  }
                  if (advBefore !== null && advAfter !== null) {
                    const dt = (advAfter - advBefore) / 1000;
                    deltaParts.push(`${dt > 0 ? "+" : ""}${dt.toFixed(1)}s`);
                    if (dt > 0 && deltaCls === "text-muted-foreground") deltaCls = "text-emerald-400";
                  }
                  let bpmDrift = 0;
                  if (typeof last.bpmBefore === "number" && typeof last.bpmAfter === "number") {
                    const db = last.bpmAfter - last.bpmBefore;
                    bpmDrift = db;
                    deltaParts.push(`${db > 0 ? "+" : ""}${db} BPM`);
                    if (db !== 0 && deltaCls === "text-muted-foreground") deltaCls = db > 0 ? "text-emerald-400" : "text-amber-400";
                  } else if (typeof last.bpmBefore === "number" && last.bpmAfter === null) {
                    deltaParts.push(`${last.bpmBefore} BPM→…`);
                  }
                  const bpmDriftLarge = Math.abs(bpmDrift) >= BPM_DRIFT_THRESHOLD;
                  const movedLabel =
                    last.outcome === "cooldown"
                      ? { text: "cooldown", cls: "text-muted-foreground" }
                      : last.outcome === "error"
                      ? { text: "error", cls: "text-red-400" }
                      : last.effective === null
                      ? { text: "checking…", cls: "text-muted-foreground" }
                      : last.effective
                      ? { text: "moved progress", cls: "text-emerald-400" }
                      : { text: "no movement", cls: "text-amber-400" };
                  const fmtPct = (v: number | null | undefined) =>
                    typeof v === "number" ? `${v}%` : "—";
                  const fmtBpm = (v: number | null | undefined) =>
                    typeof v === "number" ? `${v} BPM` : "n/a";
                  const fmtConf = (v: number | null | undefined) =>
                    typeof v === "number" ? `${Math.round(v * 100)}%` : "n/a";
                  const beforeAfterTitle =
                    ` · progress ${fmtPct(before)} → ${after === null ? "…" : fmtPct(after)}` +
                    ` · BPM ${fmtBpm(last.bpmBefore)} → ${last.bpmAfter === null ? "…" : fmtBpm(last.bpmAfter)}` +
                    ` · confidence: lyrics ${fmtConf(last.confidenceLyrics)} / BPM ${fmtConf(last.confidenceBpm)}`;
                  const lyricsReasons = lyricsLowConfReasons(last.confidenceLyrics);
                  const bpmReasons = bpmLowConfReasons(last.confidenceBpm);
                  return (
                    <>
                      <dt className="text-muted-foreground">Last refresh</dt>
                      <dd className="text-foreground/90">
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                {new Date(last.at).toLocaleTimeString()}{" "}
                                <span className="text-muted-foreground">({ageLabel})</span>{" "}
                                ·{" "}
                                <span className={movedLabel.cls}>
                                  {movedLabel.text}
                                  {deltaParts.length > 0 && (
                                    <span className={`${deltaCls} ml-1`}>
                                      ({deltaParts.join(" / ")})
                                    </span>
                                  )}
                                </span>
                                {bpmDriftLarge && (
                                  <span
                                    className="ml-1.5 inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0 text-[9px] font-medium uppercase tracking-wider text-amber-400 align-middle"
                                  >
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    BPM drift
                                  </span>
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-sm text-xs space-y-1.5">
                              <div className="font-medium">
                                {new Date(last.at).toLocaleString()}
                              </div>
                              <div className="text-muted-foreground space-y-0.5">
                                <div>source: <span className="text-foreground/90">{last.source}</span></div>
                                <div>{beforeAfterTitle.replace(/^ · /, "")}</div>
                                {last.error && <div className="text-red-400">{last.error}</div>}
                              </div>
                              {bpmDriftLarge && (
                                <div className="rounded border border-amber-500/40 bg-amber-500/10 p-1.5 text-amber-300">
                                  <div className="flex items-center gap-1 font-medium">
                                    <AlertTriangle className="h-3 w-3" /> Large BPM drift ({bpmDrift > 0 ? "+" : ""}{bpmDrift})
                                  </div>
                                  <div className="text-[10px] opacity-90">Tempo re-detection may have misfired.</div>
                                </div>
                              )}
                              {lyricsReasons.length > 0 && (
                                <div className="rounded border border-border/60 bg-card/40 p-1.5">
                                  <div className="font-medium text-foreground/90 mb-0.5">
                                    Why lyrics confidence is {last.confidenceLyrics! < 0.5 ? "low" : "borderline"} ({Math.round(last.confidenceLyrics! * 100)}%)
                                  </div>
                                  <ul className="list-disc pl-4 text-[10px] text-muted-foreground space-y-0.5">
                                    {lyricsReasons.map((r, i) => <li key={i}>{r}</li>)}
                                  </ul>
                                </div>
                              )}
                              {bpmReasons.length > 0 && (
                                <div className="rounded border border-border/60 bg-card/40 p-1.5">
                                  <div className="font-medium text-foreground/90 mb-0.5">
                                    Why BPM confidence is {last.confidenceBpm! < 0.5 ? "low" : "borderline"} ({Math.round(last.confidenceBpm! * 100)}%)
                                  </div>
                                  <ul className="list-disc pl-4 text-[10px] text-muted-foreground space-y-0.5">
                                    {bpmReasons.map((r, i) => <li key={i}>{r}</li>)}
                                  </ul>
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </dd>
                    </>
                  );
                })()}
                {retryAttempts > 0 && (
                  <>
                    <dt className="text-muted-foreground">Retries</dt>
                    <dd
                      className={
                        lastRetrySource === "auto"
                          ? "text-amber-400"
                          : "text-foreground/90"
                      }
                    >
                      {retryAttempts}× ·{" "}
                      <span className="uppercase tracking-wide">
                        {lastRetrySource === "auto" ? "auto-recovery" : "manual"}
                      </span>
                      {lastRetryAt && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {new Date(lastRetryAt).toLocaleTimeString()}
                        </span>
                      )}
                    </dd>
                  </>
                )}
                {mergeState.mergeJobId && (
                  <>
                    <dt className="text-muted-foreground">Job</dt>
                    <dd className="text-foreground/90 font-mono truncate" title={mergeState.mergeJobId}>
                      {mergeState.mergeJobId.slice(0, 8)}…
                    </dd>
                  </>
                )}
                {(mergeState.error || mergeState.errorCode) && (
                  <>
                    <dt className="text-muted-foreground">Error</dt>
                    <dd className="text-red-400 break-words">
                      {mergeState.errorCode ? `[${mergeState.errorCode}] ` : ""}
                      {mergeState.error || "Unknown error"}
                    </dd>
                  </>
                )}
              </dl>
              {consecutiveFailures >= 3 && (
                <p className="text-[10px] text-red-400 flex items-start gap-1 pt-1 border-t border-amber-500/20">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  Provider unresponsive — {consecutiveFailures} refreshes returned no movement. Consider cancelling and retrying the merge.
                </p>
              )}

              {autoRefreshSuspended && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-md border border-red-500/50 bg-red-500/10 px-2.5 py-2 space-y-1.5"
                >
                  <p className="text-[10px] font-semibold text-red-400 flex items-center gap-1">
                    <Ban className="h-3 w-3" />
                    Auto Force refresh paused
                  </p>
                  <p className="text-[10px] text-red-300/90 leading-relaxed">
                    {consecutiveFailures} consecutive polls returned no new data, so we stopped pinging the provider automatically. Retry the merge with a fresh job, cancel it, or resume polling if you think the provider has recovered.
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <Button
                      size="sm"
                      className="h-7 text-[10px] gap-1 bg-red-500 text-red-50 hover:bg-red-500/90"
                      disabled={retryPending || backoffRemainingSec > 0}
                      onClick={() => setBackoffRemainingSec(nextBackoffSec)}
                      title={`Wait ${nextBackoffSec}s, then re-submit the merge with current settings`}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry merge in {nextBackoffSec}s
                    </Button>
                    {onCancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1 border-red-500/40 text-red-300 hover:bg-red-500/10"
                        disabled={canceling}
                        onClick={() => onCancel()}
                        title="Cancel the in-flight merge job"
                      >
                        {canceling
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Ban className="h-3 w-3" />}
                        {canceling ? "Cancelling…" : "Cancel merge"}
                      </Button>
                    )}
                    {onResumeAutoRefresh && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => onResumeAutoRefresh()}
                        title="Reset the ineffective-poll counter and let auto Force refresh fire again"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Resume auto-refresh
                      </Button>
                    )}
                  </div>
                </div>
              )}


              {/* Recovery actions: manual re-poll + backoff retry + alternate provider switch (when configured). */}
              <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-amber-500/20">
                {onForceRefresh && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1"
                    disabled={refreshing || cooldownRemainingMs > 0 || autoRefreshSuspended}
                    onClick={() => onForceRefresh()}
                    title={
                      autoRefreshSuspended
                        ? `Disabled — provider returned no movement on ${consecutiveFailures} polls. Retry or cancel the merge instead.`
                        : cooldownRemainingMs > 0
                          ? `Cooldown active — wait ${Math.ceil(cooldownRemainingMs / 1000)}s before re-polling`
                          : "Force a fresh poll of the provider for this merge job"
                    }
                  >
                    <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing
                      ? "Refreshing…"
                      : cooldownRemainingMs > 0
                        ? `Retry refresh (${Math.ceil(cooldownRemainingMs / 1000)}s)`
                        : "Retry refresh"}
                  </Button>
                )}
                {backoffRemainingSec > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1"
                    onClick={() => setBackoffRemainingSec(0)}
                    title="Cancel the scheduled retry"
                  >
                    <Ban className="h-3 w-3" />
                    Cancel retry ({backoffRemainingSec}s)
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1"
                    disabled={retryPending}
                    onClick={() => setBackoffRemainingSec(nextBackoffSec)}
                    title={`Wait ${nextBackoffSec}s, then re-submit the merge with current settings (attempt ${retryAttempts + 1})`}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry in {nextBackoffSec}s
                  </Button>
                )}
                {alternateProviders.length > 0 && onSwitchProvider && (
                  <div className="flex items-center gap-1">
                    <Select value={altProviderId} onValueChange={setAltProviderId}>
                      <SelectTrigger className="h-7 w-[140px] text-[10px]">
                        <SelectValue placeholder="Alternate provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {alternateProviders.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-[11px]">
                            {p.label}
                            {p.description && (
                              <span className="text-muted-foreground ml-1">
                                · {p.description}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] gap-1"
                      disabled={!altProviderId || switchingProvider}
                      onClick={() => onSwitchProvider(altProviderId)}
                      title="Cancel the current job and re-route the merge through the selected provider"
                    >
                      {switchingProvider
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : <Activity className="h-3 w-3" />}
                      Switch provider
                    </Button>
                  </div>
                )}
              </div>

              {refreshHistory.length > 0 && (
                <div className="rounded border border-amber-500/20 bg-background/40 p-1.5 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Recent attempts (last {Math.min(5, refreshHistory.length)})
                    </p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-amber-500/10 transition-colors"
                          title="Configure confidence thresholds for marking refresh effectiveness"
                        >
                          <SettingsIcon className="h-2.5 w-2.5" />
                          Thresholds
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-3 space-y-3" align="end">
                        <div>
                          <p className="text-xs font-semibold">Confidence thresholds</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                            Combined with movement detection to auto-mark refresh attempts.
                            Uses min(lyrics, BPM) confidence.
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Effective at ≥</span>
                            <span className="font-mono tabular-nums text-emerald-400">
                              {Math.round(confidenceThresholds.effectiveAtLeast * 100)}%
                            </span>
                          </div>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={[Math.round(confidenceThresholds.effectiveAtLeast * 100)]}
                            onValueChange={(v) =>
                              onConfidenceThresholdsChange?.({ effectiveAtLeast: (v[0] ?? 80) / 100 })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Ineffective below</span>
                            <span className="font-mono tabular-nums text-red-400">
                              {Math.round(confidenceThresholds.ineffectiveBelow * 100)}%
                            </span>
                          </div>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={[Math.round(confidenceThresholds.ineffectiveBelow * 100)]}
                            onValueChange={(v) =>
                              onConfidenceThresholdsChange?.({ ineffectiveBelow: (v[0] ?? 40) / 100 })
                            }
                          />
                        </div>
                        <div className="rounded border border-border/60 bg-muted/30 p-2 text-[10px] leading-relaxed text-muted-foreground space-y-0.5">
                          <p><span className="text-emerald-400">Effective</span> ← moved AND minConf ≥ {Math.round(confidenceThresholds.effectiveAtLeast * 100)}%</p>
                          <p><span className="text-red-400">Ineffective</span> ← !moved OR minConf &lt; {Math.round(confidenceThresholds.ineffectiveBelow * 100)}%</p>
                          <p>Otherwise: movement signal alone decides.</p>
                        </div>
                        <button
                          type="button"
                          className="w-full text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                          onClick={() => onConfidenceThresholdsChange?.({ effectiveAtLeast: 0.8, ineffectiveBelow: 0.4 })}
                        >
                          Reset to defaults (80% / 40%)
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <ul className="space-y-0.5 font-mono text-[10px]">
                    {[...refreshHistory].slice(-5).reverse().map((entry) => {
                      const ageMs = Date.now() - entry.at;
                      const ageSec = Math.max(0, Math.round(ageMs / 1000));
                      const ageLabel = ageSec < 60
                        ? `${ageSec}s`
                        : ageSec < 3600
                          ? `${Math.round(ageSec / 60)}m`
                          : `${Math.round(ageSec / 3600)}h`;
                      const outcome =
                        entry.outcome === "error"
                          ? { text: "error", cls: "text-red-400", dot: "bg-red-400" }
                          : entry.outcome === "cooldown"
                            ? { text: "cooldown", cls: "text-muted-foreground", dot: "bg-muted-foreground" }
                            : entry.effective === true
                              ? { text: "moved", cls: "text-emerald-400", dot: "bg-emerald-400" }
                              : entry.effective === false
                                ? { text: "no move", cls: "text-amber-400", dot: "bg-amber-400" }
                                : { text: "checking", cls: "text-muted-foreground", dot: "bg-muted-foreground/60" };
                      const sourceLabel =
                        entry.source === "manual" ? "M" :
                        entry.source === "auto-stuck" ? "AS" : "AC";
                      const entryDrift = (typeof entry.bpmBefore === "number" && typeof entry.bpmAfter === "number")
                        ? entry.bpmAfter - entry.bpmBefore : 0;
                      const entryDriftLarge = Math.abs(entryDrift) >= BPM_DRIFT_THRESHOLD;
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedRefreshId(entry.id)}
                            className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-1.5 w-full text-left rounded px-1 py-0.5 hover:bg-amber-500/10 focus:outline-none focus:ring-1 focus:ring-amber-500/40 transition-colors"
                            title={`${new Date(entry.at).toLocaleString()} · source: ${entry.source}${entryDriftLarge ? ` · BPM drift ${entryDrift > 0 ? "+" : ""}${entryDrift}` : ""}${entry.error ? ` · ${entry.error}` : ""} · click for details`}
                          >
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${outcome.dot}`} aria-hidden />
                            <span className={`${outcome.cls} truncate`}>
                              {outcome.text}
                              <span className="text-muted-foreground ml-1">[{sourceLabel}]</span>
                              {entryDriftLarge && (
                                <AlertTriangle
                                  className="inline h-2.5 w-2.5 ml-1 text-amber-400 align-baseline"
                                  aria-label="Large BPM drift"
                                />
                              )}
                            </span>
                            <span className="text-muted-foreground tabular-nums">{ageLabel} ago</span>
                            <span className="text-muted-foreground/70 tabular-nums">
                              {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {refreshHistory.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="h-3 w-3 transition-transform data-[state=open]:rotate-90" />
                      Refresh history ({refreshHistory.length})
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto rounded border border-amber-500/20 bg-background/40 p-1.5 font-mono text-[10px]">
                      {[...refreshHistory].reverse().map((entry) => {
                        const ts = new Date(entry.at).toLocaleTimeString();
                        const effLabel =
                          entry.outcome === "error"
                            ? "error"
                            : entry.effective === true
                              ? "effective"
                              : entry.effective === false
                                ? "ineffective"
                                : "pending";
                        const effClass =
                          entry.outcome === "error"
                            ? "text-red-400"
                            : entry.effective === true
                              ? "text-emerald-400"
                              : entry.effective === false
                                ? "text-amber-400"
                                : "text-muted-foreground";
                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedRefreshId(entry.id)}
                              className="grid grid-cols-[60px_70px_1fr] gap-1 items-baseline w-full text-left rounded px-1 py-0.5 hover:bg-amber-500/10 focus:outline-none focus:ring-1 focus:ring-amber-500/40 transition-colors"
                              title={
                                entry.error
                                  ? `Error: ${entry.error} · click for details`
                                  : `${new Date(entry.at).toISOString()}${entry.durationMs != null ? ` · ${entry.durationMs}ms` : ""} · click for details`
                              }
                            >
                              <span className="text-muted-foreground tabular-nums">{ts}</span>
                              <span className="uppercase tracking-wider text-foreground/80">
                                {entry.source.replace("auto-", "auto·")}
                              </span>
                              <span className={effClass}>{effLabel}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <StuckDetailsExpander
                mergeJobId={mergeState.mergeJobId ?? null}
                errorText={mergeState.error ?? null}
                errorCode={mergeState.errorCode ?? null}
              />
            </div>
          )}
        </div>
      )}

      {isDone && (
        <div className="flex items-center gap-2 text-xs text-emerald-500">
          <CheckCircle2 className="h-4 w-4" />
          <span>Final video merged successfully</span>
        </div>
      )}

      {isError && mergeState.errorCode === "FAL_BILLING_EXHAUSTED" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <CreditCard className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                fal.ai balance exhausted
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Your fal.ai account ran out of credits mid-merge. Top up to resume video stitching and vocal sync.
              </p>
            </div>
          </div>
          <ol className="text-[11px] text-muted-foreground space-y-0.5 pl-6 list-decimal">
            <li>Open the fal.ai billing dashboard and add funds.</li>
            <li>Wait ~30 seconds for the balance to propagate.</li>
            <li>Click <span className="font-medium text-foreground">Retry merge</span> below to resume.</li>
          </ol>
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs bg-amber-500 text-amber-950 hover:bg-amber-500/90"
              onClick={() => window.open("https://fal.ai/dashboard/billing", "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3 w-3" />
              Top up fal.ai
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => onReset()}
              disabled={retryPending}
            >
              {retryPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              {retryPending ? "Retrying…" : "Retry merge"}
            </Button>
          </div>

          <BillingTechnicalDetails mergeState={mergeState} />
        </div>
      )}

      {isError && mergeState.errorCode !== "FAL_BILLING_EXHAUSTED" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-destructive">Merge failed</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                {mergeState.error || "Unknown error occurred"}
              </p>
            </div>
          </div>
          <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-6 list-disc">
            <li>Check that every scene has a generated video and the master audio is present.</li>
            <li>Wait a moment, then click <span className="font-medium text-foreground">Retry</span>.</li>
            <li>If it keeps failing, regenerate the offending scene from the Storyboard step.</li>
          </ul>
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => onReset()}
              disabled={retryPending}
            >
              {retryPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              {retryPending ? "Retrying…" : "Retry merge"}
            </Button>
          </div>
        </div>
      )}

      {!hasAllVideos && !isProcessing && !isDone && (
        <p className="text-[10px] text-amber-500">⚠ All scenes need generated videos before merging</p>
      )}
      {!hasAudio && !isProcessing && !isDone && (
        <p className="text-[10px] text-amber-500">⚠ Master audio track is required for merge</p>
      )}

      <JobDetailsDrawer
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        kind="merge"
        jobId={mergeState.mergeJobId}
        title="Final merge job"
      />

      <Dialog open={!!selectedRefresh} onOpenChange={(o) => !o && setSelectedRefreshId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Refresh attempt details</DialogTitle>
            <DialogDescription className="text-xs">
              Captured progress and BPM around this refresh attempt.
            </DialogDescription>
          </DialogHeader>
          {selectedRefresh && (() => {
            const e = selectedRefresh;
            const fmtPct = (v: number | null | undefined) =>
              typeof v === "number" ? `${v}%` : "—";
            const fmtBpm = (v: number | null | undefined) =>
              typeof v === "number" ? `${v}` : "—";
            const fmtTs = (v: number | null | undefined) =>
              typeof v === "number" ? new Date(v).toLocaleTimeString() : "—";
            const outcomeLabel =
              e.outcome === "error" ? "error" :
              e.outcome === "cooldown" ? "cooldown" :
              e.effective === true ? "moved progress" :
              e.effective === false ? "no movement" :
              "checking…";
            const outcomeCls =
              e.outcome === "error" ? "text-red-400" :
              e.effective === true ? "text-emerald-400" :
              e.effective === false ? "text-amber-400" :
              "text-muted-foreground";
            const dPct = (typeof e.progressBefore === "number" && typeof e.progressAfter === "number")
              ? e.progressAfter - e.progressBefore : null;
            const dBpm = (typeof e.bpmBefore === "number" && typeof e.bpmAfter === "number")
              ? e.bpmAfter - e.bpmBefore : null;
            return (
              <div className="space-y-3 text-xs">
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-muted-foreground">Outcome</dt>
                  <dd className={outcomeCls}>{outcomeLabel}</dd>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-mono uppercase tracking-wider">{e.source}</dd>
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="font-mono">{new Date(e.at).toLocaleString()}</dd>
                  {typeof e.durationMs === "number" && (
                    <>
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd className="font-mono tabular-nums">{e.durationMs} ms</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Progress</dt>
                  <dd className="font-mono tabular-nums">
                    {fmtPct(e.progressBefore)} → {e.progressAfter === null ? "…" : fmtPct(e.progressAfter)}
                    {dPct !== null && (
                      <span className={`ml-2 ${dPct > 0 ? "text-emerald-400" : dPct < 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                        ({dPct > 0 ? "+" : ""}{dPct}%)
                      </span>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">BPM</dt>
                  <dd className="font-mono tabular-nums">
                    {fmtBpm(e.bpmBefore)} → {e.bpmAfter === null ? "…" : fmtBpm(e.bpmAfter)}
                    {dBpm !== null && (
                      <span className={`ml-2 ${dBpm > 0 ? "text-emerald-400" : dBpm < 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                        ({dBpm > 0 ? "+" : ""}{dBpm})
                      </span>
                    )}
                    {dBpm !== null && Math.abs(dBpm) >= BPM_DRIFT_THRESHOLD && (
                      <AlertTriangle
                        className="inline h-3 w-3 ml-1.5 text-amber-400 align-text-bottom"
                        aria-label="Large BPM drift"
                      />
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Job advance</dt>
                  <dd className="font-mono tabular-nums">
                    {fmtTs(e.lastAdvanceBefore)} → {e.lastAdvanceAfter === null ? "…" : fmtTs(e.lastAdvanceAfter)}
                  </dd>
                  <dt className="text-muted-foreground">Confidence</dt>
                  <dd className="font-mono tabular-nums">
                    {(() => {
                      const fmtConfDlg = (v: number | null | undefined) =>
                        typeof v === "number" ? `${Math.round(v * 100)}%` : "n/a";
                      const confCls = (v: number | null | undefined) =>
                        typeof v !== "number" ? "text-muted-foreground" :
                        v >= 0.8 ? "text-emerald-400" :
                        v >= 0.5 ? "text-amber-400" :
                        "text-red-400";
                      const lyrR = lyricsLowConfReasons(e.confidenceLyrics);
                      const bpmR = bpmLowConfReasons(e.confidenceBpm);
                      const reasonTip = (label: string, score: number, reasons: string[]) => (
                        <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
                          <div className="font-medium">
                            Why {label} confidence is {score < 0.5 ? "low" : "borderline"} ({Math.round(score * 100)}%)
                          </div>
                          <ul className="list-disc pl-4 text-[10px] text-muted-foreground space-y-0.5">
                            {reasons.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </TooltipContent>
                      );
                      return (
                        <TooltipProvider delayDuration={150}>
                          <span className="inline-flex items-center gap-1">
                            lyrics <span className={confCls(e.confidenceLyrics)}>{fmtConfDlg(e.confidenceLyrics)}</span>
                            {lyrR.length > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Why lyrics confidence is low">
                                    <HelpCircle className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                {reasonTip("lyrics", e.confidenceLyrics as number, lyrR)}
                              </Tooltip>
                            )}
                          </span>
                          <span className="mx-1">·</span>
                          <span className="inline-flex items-center gap-1">
                            BPM <span className={confCls(e.confidenceBpm)}>{fmtConfDlg(e.confidenceBpm)}</span>
                            {bpmR.length > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Why BPM confidence is low">
                                    <HelpCircle className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                {reasonTip("BPM", e.confidenceBpm as number, bpmR)}
                              </Tooltip>
                            )}
                          </span>
                        </TooltipProvider>
                      );
                    })()}
                  </dd>
                </dl>
                {dBpm !== null && Math.abs(dBpm) >= BPM_DRIFT_THRESHOLD && (
                  <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-amber-400 mb-0.5">
                        Large BPM drift detected
                      </p>
                      <p className="text-[11px] text-amber-300/90 leading-relaxed">
                        BPM shifted by {dBpm > 0 ? "+" : ""}{dBpm} during this attempt (≥ {BPM_DRIFT_THRESHOLD}).
                        Tempo re-detection may have misfired — review the analysis if downstream timing looks off.
                      </p>
                    </div>
                  </div>
                )}
                {e.error && (
                  <div className="rounded border border-red-500/30 bg-red-500/5 p-2">
                    <p className="text-[10px] uppercase tracking-wider text-red-400 mb-1">Error</p>
                    <p className="font-mono text-[11px] text-red-300 break-words">{e.error}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Collapsible "Technical details" block shown inside the billing-exhausted
 * banner. Surfaces the fal job request id, full error payload, and key
 * timestamps so the user can paste them into a fal.ai support ticket.
 */
function BillingTechnicalDetails({ mergeState }: { mergeState: MergeJobState }) {
  const [open, setOpen] = useState(false);
  const fmt = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };
  const rawOutputStr = useMemo(() => {
    if (mergeState.rawOutput == null) return null;
    try {
      return JSON.stringify(mergeState.rawOutput, null, 2);
    } catch {
      return String(mergeState.rawOutput);
    }
  }, [mergeState.rawOutput]);
  const payload =
    mergeState.mergeErrorLog ||
    rawOutputStr ||
    mergeState.error ||
    "(no payload captured)";

  const copy = (label: string, value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => toast.success(`${label} copied`),
      () => toast.error(`Couldn't copy ${label.toLowerCase()}`),
    );
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="pt-1">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Technical details
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-2">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <span className="text-muted-foreground">Merge job</span>
          <span className="font-mono break-all">
            {mergeState.mergeJobId ?? "—"}
            {mergeState.mergeJobId && (
              <button
                type="button"
                onClick={() => copy("Job id", mergeState.mergeJobId!)}
                className="ml-2 text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                copy
              </button>
            )}
          </span>
          <span className="text-muted-foreground">fal request id</span>
          <span className="font-mono break-all">
            {mergeState.providerTaskId ?? "—"}
            {mergeState.providerTaskId && (
              <button
                type="button"
                onClick={() => copy("Request id", mergeState.providerTaskId!)}
                className="ml-2 text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                copy
              </button>
            )}
          </span>
          <span className="text-muted-foreground">Error code</span>
          <span className="font-mono">{mergeState.errorCode ?? "—"}</span>
          <span className="text-muted-foreground">Started</span>
          <span>{fmt(mergeState.createdAt)}</span>
          <span className="text-muted-foreground">Last update</span>
          <span>{fmt(mergeState.updatedAt)}</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Full payload</span>
            <button
              type="button"
              onClick={() => copy("Payload", payload)}
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              copy
            </button>
          </div>
          <pre className="max-h-48 overflow-auto rounded border border-border/60 bg-muted/40 p-2 text-[10px] leading-snug font-mono whitespace-pre-wrap break-words">
            {payload}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
