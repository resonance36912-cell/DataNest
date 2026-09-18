/**
 * OutputReview — Karaoke preview with binary search word sync,
 * auto-scrolling active line, export preflight warnings.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Play, Pause, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { NormalizedLine, NormalizedWord } from "@/lib/transcript-normalizer";
import { indexWordsByLine } from "@/lib/export-engine";

interface OutputReviewProps {
  audioUrl: string;
  lines: NormalizedLine[];
  preflightWarnings?: string[];
  onExport?: (format: string) => void;
  exporting?: boolean;
}

/**
 * Binary search for the active word at a given time.
 * Words must be sorted by start_sec.
 */
function findActiveWord(words: NormalizedWord[], currentTime: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (words[mid].start_sec <= currentTime) {
      if (words[mid].end_sec >= currentTime) {
        return mid; // exact match
      }
      result = mid; // candidate (closest before currentTime)
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // If result is set and the word's end_sec >= currentTime, use it
  if (result >= 0 && words[result].end_sec >= currentTime) {
    return result;
  }
  return -1;
}

/**
 * Find active line index at given time.
 */
function findActiveLine(lines: NormalizedLine[], currentTime: number): number {
  let lo = 0;
  let hi = lines.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].start_sec <= currentTime && lines[mid].end_sec >= currentTime) {
      return mid;
    }
    if (lines[mid].end_sec < currentTime) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return -1;
}

export default function OutputReview({
  audioUrl,
  lines,
  preflightWarnings = [],
  onExport,
  exporting,
}: OutputReviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Pre-index words by line
  const wordsByLine = useMemo(() => indexWordsByLine(lines), [lines]);

  // All words flat (for global binary search)
  const allWords = useMemo(() => {
    const flat: NormalizedWord[] = [];
    for (const line of lines) {
      flat.push(...line.words);
    }
    return flat.sort((a, b) => a.start_sec - b.start_sec);
  }, [lines]);

  const activeLineIndex = useMemo(() => findActiveLine(lines, currentTime), [lines, currentTime]);
  const activeWordIndex = useMemo(() => findActiveWord(allWords, currentTime), [allWords, currentTime]);
  const activeWord = activeWordIndex >= 0 ? allWords[activeWordIndex] : null;

  // Time update handler
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  // Auto-scroll active line into view
  useEffect(() => {
    if (activeLineIndex >= 0) {
      const el = lineRefs.current.get(activeLineIndex);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLineIndex]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  }, [playing]);

  const seekToLine = useCallback((line: NormalizedLine) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = line.start_sec;
    setCurrentTime(line.start_sec);
    if (!playing) {
      audio.play();
      setPlaying(true);
    }
  }, [playing]);

  return (
    <div className="space-y-4">
      {/* Preflight warnings */}
      {preflightWarnings.length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning/5 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle className="h-4 w-4" />
            Export Preflight Warnings
          </div>
          {preflightWarnings.map((w, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {w}</p>
          ))}
        </div>
      )}

      {/* Audio player */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={togglePlay}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <audio ref={audioRef} src={audioUrl} preload="auto" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatTime(currentTime)}
        </span>

        {/* Export buttons */}
        {onExport && (
          <div className="ml-auto flex gap-2">
            {["srt", "vtt", "karaoke_vtt", "json"].map(fmt => (
              <Button
                key={fmt}
                size="sm"
                variant="ghost"
                onClick={() => onExport(fmt)}
                disabled={exporting}
                className="text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                {fmt.toUpperCase()}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Karaoke lyrics display */}
      <ScrollArea className="h-[400px] rounded-lg border bg-background/50 p-4">
        <div className="space-y-3">
          {lines.map((line, li) => {
            const isActive = li === activeLineIndex;
            const lineWords = wordsByLine.get(line.line_index) ?? line.words;

            return (
              <div
                key={line.line_index}
                ref={el => { if (el) lineRefs.current.set(li, el); }}
                className={cn(
                  "cursor-pointer rounded px-2 py-1 transition-colors",
                  isActive ? "bg-primary/10" : "hover:bg-muted/50"
                )}
                onClick={() => seekToLine(line)}
              >
                <div className="flex flex-wrap gap-1">
                  {lineWords.map((word, wi) => {
                    const isWordActive = activeWord &&
                      word.start_sec === activeWord.start_sec &&
                      word.text === activeWord.text;

                    return (
                      <span
                        key={wi}
                        className={cn(
                          "text-sm transition-all duration-100",
                          isWordActive
                            ? "text-primary font-bold scale-105"
                            : isActive
                              ? "text-foreground"
                              : "text-muted-foreground"
                        )}
                      >
                        {word.text}
                      </span>
                    );
                  })}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {formatTime(line.start_sec)} — {formatTime(line.end_sec)}
                </span>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
