import { useState, useRef, useEffect, useMemo } from "react";
import { Clock, ChevronDown, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Scene, TranscriptionResult } from "@/contexts/ProjectContext";

// Word-level transcription confidence thresholds. Words below `LOW` are flagged
// as uncertain (red); between LOW and MED as borderline (amber). Anything >=
// MED is treated as confident and rendered in the default style.
const CONF_LOW = 0.6;
const CONF_MED = 0.85;

type ConfTier = "high" | "med" | "low" | "unknown";
function confTier(c: number | undefined | null): ConfTier {
  if (c == null || Number.isNaN(c)) return "unknown";
  if (c < CONF_LOW) return "low";
  if (c < CONF_MED) return "med";
  return "high";
}
function confPct(c: number | undefined | null): string {
  if (c == null || Number.isNaN(c)) return "n/a";
  return `${Math.round(c * 100)}%`;
}

function timeToSeconds(t: string): number {
  const parts = t.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function computeVocalSyncWindow(wordsInScene: Array<{ start: number; end: number }>, sceneStart: number, sceneEnd: number) {
  let bestStart = sceneStart;
  let bestEnd = Math.min(sceneStart + 4, sceneEnd);
  if (wordsInScene.length >= 2) {
    let bestScore = 0;
    for (let i = 0; i < wordsInScene.length; i++) {
      const wStart = wordsInScene[i].start;
      const wEnd = Math.min(wStart + 4, sceneEnd);
      const count = wordsInScene.filter(w => w.start >= wStart && w.start < wEnd).length;
      const score = count / Math.max(0.5, wEnd - wStart);
      if (score > bestScore) { bestScore = score; bestStart = wStart; bestEnd = wEnd; }
    }
  }
  return { bestStart, bestEnd };
}

const fmtSec = (s: number) => s.toFixed(2) + "s";

interface WordTimingPanelProps {
  scene: Scene;
  transcription: TranscriptionResult;
  /** "full" for storyboard card style, "compact" for assembly side panel */
  variant?: "full" | "compact";
  /** Optional callback to seek audio to a specific time in seconds */
  onSeek?: (timeSeconds: number) => void;
  /** Current audio playback time in seconds for karaoke highlighting */
  currentTime?: number;
}

export default function WordTimingPanel({ scene, transcription, variant = "full", onSeek, currentTime }: WordTimingPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const start = timeToSeconds(scene.time_start || "0:00");
  const end = timeToSeconds(scene.time_end || "0:15");
  const duration = Math.max(end - start, 0.5);
  const wordsInScene = transcription.words.filter(w => w.start >= start && w.start < end);
  const { bestStart, bestEnd } = computeVocalSyncWindow(wordsInScene, start, end);

  const confStats = useMemo(() => {
    let low = 0, med = 0, high = 0, unknown = 0;
    let sum = 0, n = 0;
    for (const w of wordsInScene) {
      const t = confTier((w as any).confidence);
      if (t === "low") low++;
      else if (t === "med") med++;
      else if (t === "high") high++;
      else unknown++;
      if (typeof (w as any).confidence === "number") { sum += (w as any).confidence; n++; }
    }
    return { low, med, high, unknown, avg: n > 0 ? sum / n : null, hasAny: n > 0 };
  }, [wordsInScene]);

  const uncertain = confStats.low + confStats.med;

  if (variant === "compact") {
    return (
      <>
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          className="flex items-center gap-1 mt-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Clock className="h-2.5 w-2.5" />
          <span>{wordsInScene.length}w</span>
          {confStats.hasAny && uncertain > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`inline-flex items-center gap-0.5 rounded px-1 ${confStats.low > 0 ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-500"}`}>
                  <AlertTriangle className="h-2 w-2" />
                  {uncertain}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p className="font-semibold">Low-confidence transcription</p>
                <p>{confStats.low} below {Math.round(CONF_LOW * 100)}%, {confStats.med} below {Math.round(CONF_MED * 100)}%</p>
                {confStats.avg != null && <p className="text-muted-foreground">avg {confPct(confStats.avg)}</p>}
              </TooltipContent>
            </Tooltip>
          )}
          <ChevronDown className={`h-2.5 w-2.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {expanded && (
          <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="rounded bg-secondary/50 p-2 space-y-1">
              <div className="flex items-center justify-between text-[9px]">
                <span className="font-medium text-foreground">Vocal Sync Window</span>
                <span className="text-muted-foreground">{fmtSec(bestStart)} → {fmtSec(bestEnd)}</span>
              </div>
              <TimelineBar start={start} duration={duration} bestStart={bestStart} bestEnd={bestEnd} words={wordsInScene} dotSize="w-1 h-1" barHeight="h-2.5" currentTime={currentTime} />
            </div>
            <WordPills words={wordsInScene} bestStart={bestStart} bestEnd={bestEnd} size="compact" onSeek={onSeek} currentTime={currentTime} />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="border-t border-border/50">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-6 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
      >
        <Clock className="h-3 w-3" />
        <span className="font-medium">Word Timing & Vocal Sync</span>
        <span className="text-[10px]">({wordsInScene.length} words)</span>
        {confStats.hasAny && uncertain > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${confStats.low > 0 ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-500"}`}>
                <AlertTriangle className="h-3 w-3" />
                {uncertain} uncertain
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p className="font-semibold">Word-level confidence</p>
              <p>{confStats.low} low (&lt;{Math.round(CONF_LOW * 100)}%), {confStats.med} medium (&lt;{Math.round(CONF_MED * 100)}%), {confStats.high} high</p>
              {confStats.avg != null && <p className="text-muted-foreground">scene avg {confPct(confStats.avg)}</p>}
            </TooltipContent>
          </Tooltip>
        )}
        <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="px-6 pb-4 space-y-3">
          <div className="rounded-lg bg-secondary/40 p-3 space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-foreground">Vocal Sync Window</span>
              <span className="text-muted-foreground">{fmtSec(bestStart)} → {fmtSec(bestEnd)} ({(bestEnd - bestStart).toFixed(1)}s)</span>
            </div>
            <TimelineBar start={start} duration={duration} bestStart={bestStart} bestEnd={bestEnd} words={wordsInScene} dotSize="w-1.5 h-1.5" barHeight="h-3" currentTime={currentTime} />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>{scene.time_start}</span>
              <span>{scene.time_end}</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Word Breakdown</span>
              {confStats.hasAny && (
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500" />low</span>
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-500" />med</span>
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />high</span>
                </div>
              )}
            </div>
            {wordsInScene.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">No words detected in this scene range</p>
            ) : (
              <WordPills words={wordsInScene} bestStart={bestStart} bestEnd={bestEnd} size="full" onSeek={onSeek} currentTime={currentTime} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineBar({ start, duration, bestStart, bestEnd, words, dotSize, barHeight, currentTime }: {
  start: number; duration: number; bestStart: number; bestEnd: number;
  words: Array<{ text: string; start: number; end: number; confidence?: number }>; dotSize: string; barHeight: string;
  currentTime?: number;
}) {
  const showPlayhead = currentTime != null && currentTime >= start && currentTime <= start + duration;
  return (
    <div className={`relative ${barHeight} rounded-full bg-secondary overflow-hidden`}>
      <div
        className="absolute h-full bg-green-500/30 border-x-2 border-green-500"
        style={{
          left: `${((bestStart - start) / duration) * 100}%`,
          width: `${((bestEnd - bestStart) / duration) * 100}%`,
        }}
      />
      {words.map((w, i) => {
        const tier = confTier(w.confidence);
        const inWin = w.start >= bestStart && w.start < bestEnd;
        // Confidence tier overrides default coloring so uncertainty stays visible
        // even outside the vocal sync window.
        const dotColor =
          tier === "low" ? "bg-red-500 ring-1 ring-red-500/40"
          : tier === "med" ? "bg-amber-500 ring-1 ring-amber-500/40"
          : inWin ? "bg-green-500"
          : "bg-muted-foreground/50";
        return (
          <div key={i}
            className={`absolute top-1/2 -translate-y-1/2 ${dotSize} rounded-full ${dotColor}`}
            style={{ left: `${((w.start - start) / duration) * 100}%` }}
            title={`"${w.text}" @ ${fmtSec(w.start)}${w.confidence != null ? ` · ${confPct(w.confidence)} confidence` : ""}`}
          />
        );
      })}
      {showPlayhead && (
        <div
          className="absolute top-0 h-full w-0.5 bg-primary shadow-[0_0_4px_hsl(var(--primary))] transition-[left] duration-100"
          style={{ left: `${((currentTime! - start) / duration) * 100}%` }}
        />
      )}
    </div>
  );
}

function WordPills({ words, bestStart, bestEnd, size, onSeek, currentTime }: {
  words: Array<{ text: string; start: number; end: number; confidence?: number }>; bestStart: number; bestEnd: number; size: "full" | "compact";
  onSeek?: (timeSeconds: number) => void; currentTime?: number;
}) {
  const pillClass = size === "compact" ? "px-1 py-px text-[8px]" : "px-1.5 py-0.5 text-[10px]";
  const activeRef = useRef<HTMLSpanElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active word
  useEffect(() => {
    if (activeRef.current && scrollContainerRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [currentTime]);

  return (
    <div ref={scrollContainerRef} className={`flex flex-wrap ${size === "compact" ? "gap-0.5" : "gap-1"} max-h-24 overflow-y-auto scroll-smooth`}>
      {words.map((w, i) => {
        const inWindow = w.start >= bestStart && w.start < bestEnd;
        const isActive = currentTime != null && currentTime >= w.start && currentTime < w.end;
        const isPast = currentTime != null && currentTime >= w.end;
        const tier = confTier(w.confidence);
        // Low/med confidence words get a colored dotted underline so they stand
        // out regardless of playback / vocal-sync-window styling.
        const confUnderline =
          tier === "low" ? "underline decoration-dotted decoration-2 decoration-red-500 underline-offset-2"
          : tier === "med" ? "underline decoration-dotted decoration-2 decoration-amber-500 underline-offset-2"
          : "";
        const confRing = !isActive && (
          tier === "low" ? "ring-1 ring-red-500/50"
          : tier === "med" ? "ring-1 ring-amber-500/40"
          : ""
        );
        return (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <span
                ref={isActive ? activeRef : undefined}
                onClick={(e) => { e.stopPropagation(); onSeek?.(w.start); }}
                className={`inline-flex items-center gap-0.5 rounded font-medium ${onSeek ? "cursor-pointer hover:ring-2 hover:ring-primary/40 active:scale-95" : "cursor-help"} transition-all duration-150 ${pillClass} ${
                  isActive
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/50 scale-110 shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
                    : isPast && inWindow
                      ? "bg-green-500/25 text-green-700 ring-1 ring-green-500/30"
                      : isPast
                        ? "bg-muted text-foreground/70"
                        : inWindow
                          ? "bg-green-500/15 text-green-600 ring-1 ring-green-500/20"
                          : "bg-secondary text-muted-foreground"
                } ${confUnderline} ${confRing || ""}`}>
                {tier === "low" && <AlertTriangle className="h-2.5 w-2.5 text-red-500" />}
                {w.text}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p className="font-semibold">"{w.text}"</p>
              <p>{fmtSec(w.start)} → {fmtSec(w.end)} ({((w.end - w.start) * 1000).toFixed(0)}ms)</p>
              {w.confidence != null && (
                <p className={tier === "low" ? "text-red-500 font-medium" : tier === "med" ? "text-amber-500 font-medium" : "text-emerald-500 font-medium"}>
                  Confidence: {confPct(w.confidence)} ({tier === "low" ? "uncertain" : tier === "med" ? "borderline" : "confident"})
                </p>
              )}
              {isActive && <p className="text-primary font-medium">▶ Now playing</p>}
              {inWindow && !isActive && <p className="text-green-500 font-medium">✓ In vocal sync window</p>}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
