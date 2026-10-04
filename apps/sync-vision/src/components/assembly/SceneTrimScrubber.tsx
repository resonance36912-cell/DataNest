import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface SceneTrimScrubberProps {
  videoUrl: string;
  /** Effective in-clip seconds — the trim start. */
  startSec: number;
  /** Kept window length (durationSec - tailCutSec). */
  keptSec: number;
  /** Probed source duration; falls back to video's intrinsic duration on load. */
  sourceDurationSec?: number | null;
}

/**
 * Inline scrubber: lets the user load the raw source clip, jog through it
 * with a slider, and jump to the trim's start / middle / end frames. The
 * kept window is overlaid on the timeline so it's obvious whether the chosen
 * trim boundaries land on the intended content.
 */
export default function SceneTrimScrubber({
  videoUrl,
  startSec,
  keptSec,
  sourceDurationSec,
}: SceneTrimScrubberProps) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState<number>(sourceDurationSec ?? 0);
  const [current, setCurrent] = useState(startSec);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const endSec = startSec + keptSec;

  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      setDuration(d || sourceDurationSec || 0);
      // Seek to the trim start when first opened.
      try { v.currentTime = Math.min(startSec, (d || sourceDurationSec || 0) - 0.05); } catch { /* noop */ }
    };
    const onTime = () => setCurrent(v.currentTime);
    const onEnd = () => setPlaying(false);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnd);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnd);
    };
  }, [open, startSec, sourceDurationSec]);

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(t, (duration || sourceDurationSec || 0) - 0.05));
    try { v.currentTime = clamped; } catch { /* noop */ }
    setCurrent(clamped);
  };

  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      try { await v.play(); setPlaying(true); } catch { /* noop */ }
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const effectiveDuration = duration || sourceDurationSec || endSec || 1;
  const winStartPct = (Math.max(0, Math.min(startSec, effectiveDuration)) / effectiveDuration) * 100;
  const winEndPct = (Math.max(0, Math.min(endSec, effectiveDuration)) / effectiveDuration) * 100;
  const playheadPct = (Math.max(0, Math.min(current, effectiveDuration)) / effectiveDuration) * 100;

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-[11px] gap-1.5 mt-2"
        onClick={() => setOpen(true)}
      >
        <Crosshair className="h-3 w-3" /> Scrub source clip
      </Button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="relative rounded overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full max-h-[200px] object-contain"
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
        />
      </div>

      {/* Timeline with kept-window overlay */}
      <div className="relative pt-1.5 pb-1">
        <div className="relative h-2 rounded-full bg-muted overflow-hidden">
          {/* Kept window range */}
          <div
            className="absolute top-0 bottom-0 bg-primary/40 border-x border-primary"
            style={{ left: `${winStartPct}%`, width: `${Math.max(0.5, winEndPct - winStartPct)}%` }}
            title={`Kept window ${startSec.toFixed(2)}s – ${endSec.toFixed(2)}s`}
          />
          {/* Playhead */}
          <div
            className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-foreground"
            style={{ left: `${playheadPct}%` }}
          />
        </div>
        <Slider
          value={[current]}
          min={0}
          max={effectiveDuration}
          step={0.05}
          onValueChange={(v) => seek(v[0])}
          className="mt-1.5"
        />
        <div className="flex justify-between text-[9px] text-muted-foreground font-mono mt-0.5">
          <span>0.00s</span>
          <span>
            {current.toFixed(2)}s
            {(current < startSec - 0.05 || current > endSec + 0.05) && (
              <span className="text-destructive ml-1">· outside trim</span>
            )}
          </span>
          <span>{effectiveDuration.toFixed(2)}s</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => seek(current - 0.1)} title="Back 0.1s">
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={togglePlay} title={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => seek(current + 0.1)} title="Forward 0.1s">
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => seek(startSec)}>
            Start
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => seek(startSec + keptSec / 2)}>
            Middle
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => seek(endSec)}>
            End
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px] px-2" onClick={() => setOpen(false)}>
            Hide
          </Button>
        </div>
      </div>
    </div>
  );
}
