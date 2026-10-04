/**
 * SceneProgressBar — Per-segment status visualizer for storyboard generation.
 * Shows colored segments for each scene's status (generating / pending / image
 * / video / approved / error) and lets the user click an errored segment to
 * retry generation for that segment alone.
 */

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import type { Scene } from "@/contexts/ProjectContext";

type SegState = "generating" | "success" | "error";
interface SegStatus { state: SegState; error?: string; at: number }

interface SceneProgressBarProps {
  scenes: Scene[];
  activeReviewIndex: number;
  sceneApproved: Record<number, boolean>;
  onSelectScene: (idx: number) => void;
  /** Indexed by audio-segment index (== scene_number - 1). */
  segmentStatus?: Record<number, SegStatus>;
  /**
   * Per-scene video render errors keyed by scene index (0-based).
   * Sourced from `render_jobs.error` / edge-function failure reason so users
   * can see WHY a segment failed inline, not just that it failed.
   */
  videoJobErrors?: Record<number, string | undefined>;
  /** Retry generation for a single segment. */
  onRetrySegment?: (segIndex: number) => void;
  /** Retry all errored segments. */
  onRetryAllFailed?: () => void;
  /** True while a generation request is in flight. */
  generating?: boolean;
}

/** Trim long provider errors so the inline row stays readable. */
function shortenError(msg: string, max = 160): string {
  const clean = msg.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

export default function SceneProgressBar({
  scenes,
  activeReviewIndex,
  sceneApproved,
  onSelectScene,
  segmentStatus = {},
  videoJobErrors = {},
  onRetrySegment,
  onRetryAllFailed,
  generating = false,
}: SceneProgressBarProps) {
  if (scenes.length <= 1) return null;

  // Merge authoring errors (segmentStatus) with downstream video-render errors
  // so a failed render_jobs row surfaces inline even when scene authoring
  // itself succeeded.
  const resolveError = (sceneIdx: number, segIdx: number): string | undefined => {
    const seg = segmentStatus[segIdx];
    if (seg?.state === "error" && seg.error) return seg.error;
    const vid = videoJobErrors[sceneIdx];
    return vid || seg?.error;
  };

  const approvedCount = Object.values(sceneApproved).filter(Boolean).length;
  const erroredSegs = scenes
    .map((s, i) => {
      const segIdx = (s.scene_number ?? i + 1) - 1;
      const seg = segmentStatus[segIdx];
      const isAuthoringError = seg?.state === "error";
      const isVideoError = !isAuthoringError && !!videoJobErrors[i];
      if (!isAuthoringError && !isVideoError) return null;
      return {
        i,
        segIdx,
        error: resolveError(i, segIdx) || "Generation failed",
        source: (isAuthoringError ? "authoring" : "render") as "authoring" | "render",
      };
    })
    .filter((x): x is { i: number; segIdx: number; error: string; source: "authoring" | "render" } => x !== null);
  const generatingCount = Object.values(segmentStatus).filter(s => s.state === "generating").length;


  return (
    <div className="glass-card px-5 py-3 space-y-2">
      <div className="flex items-center justify-between text-xs gap-3 flex-wrap">
        <span className="font-medium text-foreground">Scene Generation Status</span>
        <div className="flex items-center gap-3 flex-wrap">
          {generatingCount > 0 && (
            <span className="flex items-center gap-1 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {generatingCount} generating
            </span>
          )}
          {erroredSegs.length > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3 w-3" />
              {erroredSegs.length} failed
            </span>
          )}
          <span className="text-muted-foreground">{approvedCount}/{scenes.length} approved</span>
          {erroredSegs.length > 0 && onRetryAllFailed && (
            <button
              type="button"
              disabled={generating}
              onClick={onRetryAllFailed}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
              title="Retry every failed segment"
            >
              <RefreshCw className="h-3 w-3" />
              Retry all failed
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        {scenes.map((s, idx) => {
          const segIdx = (s.scene_number ?? idx + 1) - 1;
          const status = segmentStatus[segIdx];
          const videoErr = videoJobErrors[idx];
          const isAuthoringError = status?.state === "error";
          const isVideoError = !isAuthoringError && !!videoErr;
          const isError = isAuthoringError || isVideoError;
          const isGenerating = status?.state === "generating";
          const errorText = isError ? resolveError(idx, segIdx) : undefined;
          const cls = isError
            ? "bg-destructive animate-pulse"
            : isGenerating
              ? "bg-primary animate-pulse"
              : sceneApproved[idx]
                ? "bg-accent"
                : idx === activeReviewIndex
                  ? "bg-primary animate-pulse"
                  : s.videoUrl
                    ? "bg-primary/40"
                    : s.imageUrl
                      ? "bg-muted-foreground/40"
                      : "bg-secondary";
          const title = isError
            ? `Scene ${idx + 1} — ${isVideoError ? "Render failed" : "Failed"}: ${errorText || "unknown error"}. Click to retry.`
            : isGenerating
              ? `Scene ${idx + 1} — Generating…`
              : `Scene ${idx + 1}${
                  sceneApproved[idx]
                    ? " ✓ Approved"
                    : idx === activeReviewIndex
                      ? " — Current"
                      : s.imageUrl && !s.videoUrl
                        ? " — Image ready"
                        : ""
                }`;
          return (
            <button
              key={idx}
              onClick={() => {
                if (isError && onRetrySegment) onRetrySegment(segIdx);
                else onSelectScene(idx);
              }}
              className={`flex-1 h-2 rounded-full transition-all cursor-pointer ${cls}`}
              title={title}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-secondary inline-block" /> Pending</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" /> Generating</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" /> Image</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary/40 inline-block" /> Video</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent inline-block" /> Approved</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> Failed</span>
      </div>

      {erroredSegs.length > 0 && (
        <div className="mt-2 border-t border-destructive/20 pt-2 space-y-1">
          {erroredSegs.slice(0, 6).map(({ i, segIdx, error, source }) => (
            <div key={segIdx} className="flex items-start gap-2 text-[11px]">
              <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
              <span className="font-medium text-destructive shrink-0">Scene {i + 1}</span>
              <span
                className="px-1.5 py-0.5 rounded-sm bg-destructive/10 text-destructive/80 text-[9px] uppercase tracking-wide shrink-0"
                title={source === "render" ? "Video render job failure (render_jobs.error)" : "Scene authoring failure"}
              >
                {source === "render" ? "Render" : "Author"}
              </span>
              <span className="text-muted-foreground flex-1 break-words" title={error}>
                {shortenError(error)}
              </span>
              {onRetrySegment && (
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => onRetrySegment(segIdx)}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
            </div>
          ))}
          {erroredSegs.length > 6 && (
            <div className="text-[10px] text-muted-foreground">+{erroredSegs.length - 6} more failed — use “Retry all failed”.</div>
          )}
        </div>
      )}
    </div>
  );
}
