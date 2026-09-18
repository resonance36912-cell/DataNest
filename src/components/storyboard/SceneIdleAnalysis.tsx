import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Wand2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  analyzeSceneMotion,
  CAPTION_SENSITIVITY_PRESETS,
  type SceneMotionReport,
} from "@/lib/scene-motion-analyzer";
import {
  FIX_OVERLAID_CAPTIONS_PATCH,
  isAutoFixCaptionsEnabled,
  setAutoFixCaptionsEnabled,
  getCaptionSensitivity,
  setCaptionSensitivity,
} from "@/lib/director-preset-patches";
import { recordMotionAudit } from "@/lib/scene-motion-audit-store";



interface SceneIdleAnalysisProps {
  videoUrl: string;
  /** Key that changes when the video is regenerated — resets cached report. */
  videoKey?: string;
  /** Skip analysis for scenes tagged B-Roll (motion is optional there). */
  isBroll?: boolean;
  /** Applies a Scene Director patch to the current scene. Enables auto-fix. */
  onApplyPatch?: (patch: Record<string, any>) => void;
}

/**
 * Post-generation motion analysis panel.
 *
 * Runs once per (videoUrl, videoKey) — samples 8 frames, computes per-region
 * motion, and if the clip reads as idle surfaces which Scene Director fields
 * to adjust. Cheap CPU-only, no network, no server round-trip.
 */
export default function SceneIdleAnalysis({ videoUrl, videoKey, isBroll, onApplyPatch }: SceneIdleAnalysisProps) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [report, setReport] = useState<SceneMotionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoFix, setAutoFix] = useState<boolean>(() => isAutoFixCaptionsEnabled());
  const [autoApplied, setAutoApplied] = useState(false);
  const [sensitivity, setSensitivity] = useState<number>(() => getCaptionSensitivity());
  const runIdRef = useRef(0);
  const appliedForKeyRef = useRef<string | null>(null);

  const run = async (level = sensitivity) => {
    const myRun = ++runIdRef.current;
    setState("running");
    setError(null);
    setReport(null);
    setAutoApplied(false);
    try {
      const r = await analyzeSceneMotion(videoUrl, {
        captionDetector: CAPTION_SENSITIVITY_PRESETS[level],
      });
      if (runIdRef.current !== myRun) return;
      recordMotionAudit(videoUrl, videoKey, r);
      setReport(r);
      setState("done");
    } catch (e: any) {
      if (runIdRef.current !== myRun) return;
      setError(e?.message || "analysis-failed");
      setState("error");
    }
  };


  useEffect(() => {
    if (!videoUrl) return;
    void run();
    return () => { runIdRef.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, videoKey]);

  /* Auto-apply the Fix Overlaid Captions preset once per videoKey, when
   * the toggle is on and the analyzer flagged burned-in captions. */
  useEffect(() => {
    if (!report?.hasBurnedInCaptions) return;
    if (!autoFix || !onApplyPatch) return;
    const key = videoKey || videoUrl;
    if (appliedForKeyRef.current === key) return;
    appliedForKeyRef.current = key;
    onApplyPatch({ ...FIX_OVERLAID_CAPTIONS_PATCH });
    setAutoApplied(true);
    toast.success("Auto-applied \"Fix Overlaid Captions\" preset", {
      description: "Burned-in captions were detected — re-run this scene to regenerate.",
    });
  }, [report, autoFix, onApplyPatch, videoKey, videoUrl]);

  if (!videoUrl) return null;



  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground/90">Motion Analysis</span>
        {state === "running" && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Analyzing…
          </Badge>
        )}
        {state === "done" && report && (
          report.isIdle ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-500 gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> Idle
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-500 gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> Motion OK
            </Badge>
          )
        )}
        {state === "done" && report?.hasBurnedInCaptions && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-500 gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> Captions in frame
          </Badge>
        )}
        {state === "error" && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive/40 text-destructive">
            Failed
          </Badge>
        )}
        {autoApplied && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-500 gap-1">
            <Wand2 className="h-2.5 w-2.5" /> Auto-fixed
          </Badge>
        )}
        {onApplyPatch && (
          <label className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground select-none cursor-pointer" title="When on, applies the Fix Overlaid Captions preset automatically if burned-in text is detected.">
            <Switch
              checked={autoFix}
              onCheckedChange={(v) => { setAutoFix(v); setAutoFixCaptionsEnabled(v); }}
              className="scale-75 -my-1"
            />
            Auto-fix captions
          </label>
        )}
        <div className={`flex items-center gap-1 ${onApplyPatch ? "" : "ml-auto"}`}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
              title={`Caption detection sensitivity: ${sensitivity}/5`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Sens {sensitivity}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium">Caption Sensitivity</span>
              <span className="tabular-nums text-muted-foreground">{sensitivity} / 5</span>
            </div>
            <Slider
              value={[sensitivity]}
              min={1}
              max={5}
              step={1}
              onValueChange={(v) => {
                const lvl = v[0] ?? 3;
                setSensitivity(lvl);
                setCaptionSensitivity(lvl);
              }}
            />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>Lenient</span>
              <span>Balanced</span>
              <span>Aggressive</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Higher = catches faint or partial captions but more likely to flag high-contrast graphics.
            </p>
            <div className="flex gap-1">
              {[
                { label: "Low", level: 1 },
                { label: "Medium", level: 3 },
                { label: "High", level: 5 },
              ].map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  variant={sensitivity === p.level ? "default" : "outline"}
                  className="flex-1 h-7 text-[10px]"
                  onClick={() => {
                    setSensitivity(p.level);
                    setCaptionSensitivity(p.level);
                    run(p.level);
                  }}
                  disabled={state === "running"}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-[10px] gap-1"
              onClick={() => run(sensitivity)}
              disabled={state === "running"}
            >
              <RefreshCw className="h-3 w-3" /> Re-analyze with sensitivity {sensitivity}
            </Button>
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
          onClick={() => run(sensitivity)}
          disabled={state === "running"}
        >
          <RefreshCw className="h-3 w-3" /> Re-analyze
        </Button>
        </div>
      </div>



      {state === "done" && report && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-4 gap-1.5 text-[10px]">
            <MotionStat label="Overall" value={report.scores.overall} />
            <MotionStat label="Head" value={report.scores.head} />
            <MotionStat label="Mouth" value={report.scores.mouth} highlight={report.mouthFrozen} />
            <MotionStat label="Hands" value={report.scores.hands} />
          </div>
          {isBroll && report.isIdle && (
            <p className="text-[10px] text-muted-foreground">
              Scene is tagged B-Roll — a still frame may be intentional. Suggestions apply if you switch to A-Roll.
            </p>
          )}
          {report.suggestions.length > 0 && (
            <ul className="space-y-1 pt-0.5">
              {report.suggestions.map((s, idx) => (
                <li key={idx} className="flex items-start gap-1.5 text-[10px] text-amber-500/90">
                  <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
          {report.hasBurnedInCaptions && report.captionFrames && report.captionFrames.length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Detected caption band (amber overlay)</span>
                <span className="tabular-nums">
                  {report.captionFrames.filter(f => f.hasCaption).length}/{report.captionFrames.length} frames
                </span>
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {report.captionFrames.map((f, idx) => (
                  <div
                    key={idx}
                    className={`relative shrink-0 rounded border overflow-hidden ${
                      f.hasCaption ? "border-amber-500/70" : "border-border/50 opacity-60"
                    }`}
                    style={{ width: 88 }}
                    title={`t=${f.t.toFixed(2)}s${f.hasCaption ? " · caption detected" : ""}`}
                  >
                    <img src={f.dataUrl} alt={`Frame at ${f.t.toFixed(2)}s`} className="block w-full h-auto" />
                    {f.hasCaption && f.band && (
                      <div
                        className="absolute left-0 right-0 bg-amber-500/30 border-y border-amber-500/80"
                        style={{
                          top: `${f.band.y1 * 100}%`,
                          height: `${(f.band.y2 - f.band.y1) * 100}%`,
                        }}
                      />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-background/70 text-[9px] text-center tabular-nums px-0.5">
                      {f.t.toFixed(1)}s
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {state === "error" && (
        <p className="text-[10px] text-destructive">
          Could not analyze video ({error}). This usually means the video URL is not CORS-accessible.
        </p>
      )}
    </div>
  );
}

function MotionStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  const pct = Math.min(100, Math.round(value * 10));
  return (
    <div className={`rounded border px-1.5 py-1 ${highlight ? "border-amber-500/40 bg-amber-500/5" : "border-border/50 bg-background/40"}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={`tabular-nums font-medium ${highlight ? "text-amber-500" : "text-foreground/80"}`}>
          {value.toFixed(2)}
        </span>
      </div>
      <div className="mt-1 h-1 rounded bg-border/40 overflow-hidden">
        <div
          className={highlight ? "h-full bg-amber-500" : "h-full bg-primary"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
