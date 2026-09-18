import { useState } from "react";
import { RefreshCw, Loader2, Video, X, AlertTriangle, Clock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scene } from "@/contexts/ProjectContext";
import ProcessProgressBar from "@/components/ProcessProgressBar";
import ScenePhaseTimeline from "@/components/storyboard/ScenePhaseTimeline";
import SceneErrorTimeline from "@/components/storyboard/SceneErrorTimeline";
import JobEstimateBadge from "@/components/JobEstimateBadge";
import { VIDEO_PROVIDER_OPTIONS } from "@/lib/providers";
import type { VideoJobState } from "@/types/storyboard";
import { useFeatureGate } from "@/lib/featureGates";
import { LockedButton } from "@/components/brand/LockedButton";
import { TierRequiredState } from "@/components/brand/TierRequiredState";
import CouponUnlockField from "@/components/storyboard/CouponUnlockField";

interface VideoGenerateButtonProps {
  scene: Scene;
  sceneIndex: number;
  globalProvider: string;
  videoJob?: VideoJobState;
  referenceSceneIndex: number | null;
  gen: {
    cancelVideoJob: (idx: number) => void;
    submitVideoJob: (idx: number, quality: string, provider?: string, refIdx?: number | null) => void;
  };
  confirmJob: (provider: string, count: number) => Promise<boolean>;
}

export default function VideoGenerateButton({
  scene, sceneIndex: i, globalProvider, videoJob, referenceSceneIndex, gen, confirmJob,
}: VideoGenerateButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [overrideProvider, setOverrideProvider] = useState<string | null>(null);
  const localProvider = overrideProvider ?? globalProvider;
  const videoGate = useFeatureGate("storyboard_video");
  const videoLocked = !videoGate.allowed && !videoGate.loading;

  if (!scene.imageUrl) return null;

  const isRunning = scene.generatingVideo;
  const option = VIDEO_PROVIDER_OPTIONS.find((o) => o.value === localProvider) || VIDEO_PROVIDER_OPTIONS[0];
  const isPreview = scene.videoQuality === "preview";
  // Bar reflects the latest *real* backend sample only — no simulated drift.
  // Until the provider/DB reports a number, the bar stays at 0 and the label
  // explains the current phase ("Queued at provider", "Processing", …).
  const realPct = typeof videoJob?.realProgress === "number" ? Math.max(0, Math.min(100, Math.round(videoJob.realProgress))) : 0;
  const progressValue = realPct;
  const phaseLabel = (() => {
    if (!videoJob) return null;
    if (videoJob.phase === "queued") return "Queued at provider — waiting for a worker";
    if (videoJob.phase === "processing") return realPct > 0 ? `Provider processing — ${realPct}%` : "Provider processing — awaiting first progress sample";
    if (videoJob.phase === "succeeded") return "Provider finished — finalising";
    if (videoJob.phase === "failed") return "Provider reported a failure";
    return realPct > 0 ? `Live progress — ${realPct}%` : "Waiting for provider status…";
  })();
  const hasError = !isRunning && videoJob?.status === "error" && !!videoJob.error;
  const wasCanceled = !isRunning && videoJob?.status === "canceled" && !scene.videoUrl;
  const timedOut = !!videoJob?.timedOut;

  const handleGenerate = async () => {
    if (isRunning && hovered) { gen.cancelVideoJob(i); return; }
    const ok = await confirmJob(option.value, 1);
    if (!ok) return;
    gen.submitVideoJob(i, option.quality || "hd", localProvider, referenceSceneIndex);
  };

  const handleRetry = async () => {
    // Replay the same provider+quality the failed attempt used, falling back to current selection.
    const retryProvider = videoJob?.lastProvider || localProvider;
    const retryQuality = videoJob?.lastQuality || option.quality || "hd";
    const ok = await confirmJob(retryProvider, 1);
    if (!ok) return;
    gen.submitVideoJob(i, retryQuality, retryProvider, referenceSceneIndex);
  };

  return (
    <div className="space-y-2">
      {/* Provider selector per scene */}
      {!isRunning && (
        <div className="space-y-1">
          <Select value={localProvider} onValueChange={setOverrideProvider}>
            <SelectTrigger className="h-7 text-xs w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_PROVIDER_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-1.5"><Video className="h-3 w-3" />{opt.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {overrideProvider && overrideProvider !== globalProvider && (
            <button
              onClick={() => setOverrideProvider(null)}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              ↩ Reset to global ({VIDEO_PROVIDER_OPTIONS.find(o => o.value === globalProvider)?.label || globalProvider})
            </button>
          )}
        </div>
      )}

      {!isRunning && <JobEstimateBadge provider={option.value} />}

      {/* Progress bar ABOVE button when running */}
      {isRunning && videoJob && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
          <ProcessProgressBar
            progress={progressValue}
            active={isRunning}
            label={phaseLabel || `${option.label} — Scene ${scene.scene_number}`}
            barHeight="h-3"
            realProgress={videoJob.realProgress ?? null}
          />
          <ScenePhaseTimeline
            phase={videoJob.phase}
            phaseUpdatedAt={videoJob.phaseUpdatedAt}
          />
          {videoJob.reconcileWarning && (
            <div
              role="status"
              className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300"
            >
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="leading-snug">{videoJob.reconcileWarning}</span>
            </div>
          )}
          <SceneErrorTimeline
            events={videoJob.pollEvents}
            status={videoJob.status}
          />
        </div>
      )}
      {isRunning && !videoJob && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <ProcessProgressBar progress={2} active={true} label={`Starting ${option.label}…`} barHeight="h-3" />
        </div>
      )}

      {/* Failure / timeout panel — surfaces details + dedicated Retry button */}
      {hasError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
          <div className="flex items-start gap-2">
            {timedOut ? (
              <Clock className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-destructive">
                {timedOut ? "Generation timed out" : "Video generation failed"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                {videoJob!.error}
              </p>
              {(videoJob?.lastProvider || videoJob?.lastQuality) && (
                <p className="text-[10px] text-muted-foreground/80 mt-1">
                  Last attempt:{" "}
                  {VIDEO_PROVIDER_OPTIONS.find(o => o.value === videoJob.lastProvider)?.label || videoJob.lastProvider || "—"}
                  {videoJob.lastQuality ? ` · ${videoJob.lastQuality}` : ""}
                </p>
              )}
              {videoJob?.timeoutSource && (
                <p className="text-[10px] mt-1">
                  <span className="text-muted-foreground/80">Source: </span>
                  <span
                    className={
                      videoJob.timeoutSource === "polling"
                        ? "text-amber-400 font-medium"
                        : videoJob.timeoutSource === "upstream"
                          ? "text-destructive font-medium"
                          : "text-sky-400 font-medium"
                    }
                    title={
                      videoJob.timeoutSource === "polling"
                        ? "Client gave up waiting after the per-provider polling threshold."
                        : videoJob.timeoutSource === "upstream"
                          ? "Provider/inference reported a failure."
                          : "Network/transport errors talking to job-status."
                    }
                  >
                    {videoJob.timeoutSource === "polling" && "polling timeout"}
                    {videoJob.timeoutSource === "upstream" && "upstream inference"}
                    {videoJob.timeoutSource === "network" && "network error"}
                  </span>
                </p>
              )}
            </div>
          </div>
          <ScenePhaseTimeline
            phase={videoJob?.phase ?? "failed"}
            phaseUpdatedAt={videoJob?.phaseUpdatedAt}
          />
          <SceneErrorTimeline
            events={videoJob?.pollEvents}
            finalError={videoJob?.error}
            timedOut={timedOut}
            status="error"
          />
          <Button
            onClick={handleRetry}
            size="sm"
            variant="outline"
            className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry scene {scene.scene_number}
          </Button>
        </div>
      )}

      {/* Canceled panel — confirms user cancellation + offers a quick re-run */}
      {wasCanceled && (
        <div className="rounded-lg border border-muted-foreground/30 bg-muted/40 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Ban className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Generation canceled</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Scene {scene.scene_number} stopped before completion.
              </p>
              {(videoJob?.lastProvider || videoJob?.lastQuality) && (
                <p className="text-[10px] text-muted-foreground/80 mt-1">
                  Last attempt:{" "}
                  {VIDEO_PROVIDER_OPTIONS.find(o => o.value === videoJob.lastProvider)?.label || videoJob.lastProvider || "—"}
                  {videoJob.lastQuality ? ` · ${videoJob.lastQuality}` : ""}
                </p>
              )}
            </div>
          </div>
          <Button onClick={handleRetry} size="sm" variant="outline" className="w-full gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Run scene {scene.scene_number} again
          </Button>
        </div>
      )}

      {videoLocked && !isRunning ? (
        <div className="space-y-2">
          <TierRequiredState
            gate={videoGate}
            feature="storyboard_video"
            variant="compact"
          />
          <LockedButton gate={videoGate} feature="storyboard_video">Unlock Video Generation</LockedButton>
          <CouponUnlockField />
        </div>
      ) : (
        <Button
          onClick={handleGenerate}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          title={isRunning ? "Click to cancel this video generation" : scene.videoUrl ? "Regenerate a new 10s video" : "Generate a 10s video from the scene image"}
          className={`w-full gap-2 ${isRunning && hovered ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-accent text-accent-foreground hover:bg-accent/90"}`}
          size="sm"
        >
          {isRunning ? (
            hovered ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
          ) : scene.videoUrl ? (
            <><RefreshCw className="h-3.5 w-3.5" /> Regenerate</>
          ) : (
            <><Video className="h-3.5 w-3.5" /> Generate Video</>
          )}
        </Button>
      )}
      {scene.videoUrl && !isRunning && (
        <Badge variant="outline" className={isPreview ? "bg-accent/10 text-accent-foreground border-accent/20 text-[10px]" : "bg-primary/10 text-primary border-primary/20 text-[10px]"}>
          {isPreview ? "Preview" : "HD"}
        </Badge>
      )}
    </div>
  );
}
