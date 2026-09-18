import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, RotateCcw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import SceneTrimThumbnails from "@/components/assembly/SceneTrimThumbnails";
import SceneTrimScrubber from "@/components/assembly/SceneTrimScrubber";

export interface SceneTrim {
  startSec: number;
  durationSec: number;
  tailCutSec: number;
  /** Probed source clip duration, forwarded to the server for validation. */
  sourceDurationSec?: number;
}

interface SceneTrimEditorProps {
  scenes: SavedScene[];
  trims: Record<number, SceneTrim>;
  onChange: (trims: Record<number, SceneTrim>) => void;
}

/** Probe video metadata duration in the browser. Returns null on failure. */
function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.crossOrigin = "anonymous";
    const done = (val: number | null) => {
      v.removeAttribute("src");
      try { v.load(); } catch { /* noop */ }
      resolve(val);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function SceneTrimEditor({ scenes, trims, onChange }: SceneTrimEditorProps) {
  const [open, setOpen] = useState(false);
  const [probed, setProbed] = useState<Record<number, number | null>>({});
  const probedRef = useRef(probed);
  probedRef.current = probed;

  // Probe each scene video once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const s of scenes) {
        if (!s.videoUrl || probedRef.current[s.sceneNumber] !== undefined) continue;
        const d = await probeDuration(s.videoUrl);
        if (cancelled) return;
        setProbed((p) => ({ ...p, [s.sceneNumber]: d }));
      }
    })();
    return () => { cancelled = true; };
  }, [scenes]);

  const update = (sceneNumber: number, patch: Partial<SceneTrim>, fallback: SceneTrim) => {
    const current = trims[sceneNumber] ?? fallback;
    const next = { ...current, ...patch };
    // Sanity clamp
    next.startSec = Math.max(0, next.startSec);
    next.durationSec = Math.max(0.1, next.durationSec);
    next.tailCutSec = Math.max(0, Math.min(next.tailCutSec, Math.max(0, next.durationSec - 0.1)));
    // Attach probed source duration so the server can validate/clamp.
    const src = probedRef.current[sceneNumber];
    if (typeof src === "number" && src > 0) next.sourceDurationSec = src;
    onChange({ ...trims, [sceneNumber]: next });
  };

  const resetOne = (sceneNumber: number) => {
    const { [sceneNumber]: _, ...rest } = trims;
    onChange(rest);
  };

  const resetAll = () => onChange({});

  /** Effective trim per scene (explicit or default = full slot from 0). */
  const effective = useMemo(() => {
    return scenes.map((s) => {
      const def: SceneTrim = { startSec: 0, durationSec: s.durationSec, tailCutSec: 0 };
      const t = trims[s.sceneNumber] ?? def;
      const kept = Math.max(0, t.durationSec - t.tailCutSec);
      const src = probed[s.sceneNumber] ?? null;
      const overflow = src !== null && (t.startSec + t.durationSec) > src + 0.05;
      return { scene: s, trim: t, kept, src, overflow, isDefault: !trims[s.sceneNumber] };
    });
  }, [scenes, trims, probed]);

  const totalKept = effective.reduce((sum, e) => sum + e.kept, 0);
  const maxKept = Math.max(totalKept, 1);

  const customCount = Object.keys(trims).length;

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 sm:p-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              <Scissors className="h-4 w-4" />
              <span>Per-scene trim</span>
              {customCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  {customCount} custom
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground font-normal">
                · stitched total {totalKept.toFixed(2)}s
              </span>
            </button>
          </CollapsibleTrigger>
          {customCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={resetAll}
              className="h-7 text-[11px] gap-1"
            >
              <RotateCcw className="h-3 w-3" /> Reset all
            </Button>
          )}
        </div>

        <CollapsibleContent className="mt-3 space-y-3">
          {/* Stitching preview */}
          <TooltipProvider delayDuration={200}>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
                <Info className="h-3 w-3" />
                <span>Applied stitching preview (kept window per scene)</span>
              </div>
              <div className="flex w-full h-7 rounded-md overflow-hidden border border-border bg-muted/40">
                {effective.map((e, idx) => {
                  const widthPct = (e.kept / maxKept) * 100;
                  const hue = (idx * 47) % 360;
                  return (
                    <Tooltip key={e.scene.sceneNumber}>
                      <TooltipTrigger asChild>
                        <div
                          className="h-full flex items-center justify-center text-[10px] font-medium text-white/95 border-r border-background/40 last:border-r-0 cursor-help"
                          style={{
                            width: `${widthPct}%`,
                            background: e.overflow
                              ? "repeating-linear-gradient(45deg, hsl(var(--destructive)), hsl(var(--destructive)) 6px, hsl(var(--destructive)/0.7) 6px, hsl(var(--destructive)/0.7) 12px)"
                              : `hsl(${hue} 65% 45%)`,
                          }}
                        >
                          {widthPct > 7 ? `S${e.scene.sceneNumber}` : ""}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <div className="font-medium">Scene {e.scene.sceneNumber}</div>
                        <div>start: {e.trim.startSec.toFixed(2)}s</div>
                        <div>duration: {e.trim.durationSec.toFixed(2)}s</div>
                        <div>tail cut: {e.trim.tailCutSec.toFixed(2)}s</div>
                        <div className="mt-1 border-t border-border pt-1">
                          kept: <span className="font-medium">{e.kept.toFixed(2)}s</span>
                        </div>
                        {e.src !== null && (
                          <div className="text-muted-foreground">source: {e.src.toFixed(2)}s</div>
                        )}
                        {e.overflow && (
                          <div className="text-destructive font-medium mt-1">
                            ⚠ exceeds source clip
                          </div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0:00</span>
                <span>{totalKept.toFixed(2)}s total</span>
              </div>
            </div>
          </TooltipProvider>

          {/* Per-scene rows */}
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {effective.map((e) => {
              const sn = e.scene.sceneNumber;
              const fallback: SceneTrim = { startSec: 0, durationSec: e.scene.durationSec, tailCutSec: 0 };
              return (
                <div
                  key={sn}
                  className={`rounded-md border p-2 ${
                    e.overflow ? "border-destructive/50 bg-destructive/5" : "border-border bg-background/40"
                  }`}
                >
                  <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-2">
                    <div className="flex flex-col">
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">S{sn}</Badge>
                      <span className="text-[9px] text-muted-foreground mt-1">
                        slot {e.scene.durationSec.toFixed(1)}s
                      </span>
                      {e.src !== null && (
                        <span className="text-[9px] text-muted-foreground">
                          src {e.src.toFixed(1)}s
                        </span>
                      )}
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Start (s)</Label>
                      <Input
                        type="number"
                        step="0.05"
                        min={0}
                        max={e.src ?? undefined}
                        value={e.trim.startSec}
                        onChange={(ev) =>
                          update(sn, { startSec: clamp(parseFloat(ev.target.value) || 0, 0, e.src ?? 999) }, fallback)
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Duration (s)</Label>
                      <Input
                        type="number"
                        step="0.05"
                        min={0.1}
                        value={e.trim.durationSec}
                        onChange={(ev) =>
                          update(sn, { durationSec: Math.max(0.1, parseFloat(ev.target.value) || 0.1) }, fallback)
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Tail cut (s)</Label>
                      <Input
                        type="number"
                        step="0.05"
                        min={0}
                        value={e.trim.tailCutSec}
                        onChange={(ev) =>
                          update(sn, { tailCutSec: Math.max(0, parseFloat(ev.target.value) || 0) }, fallback)
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={e.isDefault}
                      onClick={() => resetOne(sn)}
                      className="h-7 w-7 p-0"
                      title="Reset this scene"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                    <span className="text-muted-foreground">Effective trim window:</span>
                    <span className="font-mono text-foreground">
                      start_offset {e.trim.startSec.toFixed(2)}s
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono text-foreground">
                      end_offset {(e.trim.startSec + e.kept).toFixed(2)}s
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      ({e.kept.toFixed(2)}s kept{e.overflow ? " · exceeds source" : ""})
                    </span>
                  </div>
                  {e.scene.videoUrl && (
                    <>
                      <SceneTrimThumbnails
                        videoUrl={e.scene.videoUrl}
                        startSec={e.trim.startSec}
                        keptSec={e.kept}
                        sourceDurationSec={e.src}
                      />
                      <SceneTrimScrubber
                        videoUrl={e.scene.videoUrl}
                        startSec={e.trim.startSec}
                        keptSec={e.kept}
                        sourceDurationSec={e.src}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Trims here override bleed math. Final stitched window per scene = duration − tail cut, starting at start.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
