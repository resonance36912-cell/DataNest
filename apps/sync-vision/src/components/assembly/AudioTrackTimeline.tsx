import { useEffect, useRef, useState, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { Music, Volume2, Zap, Type } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SavedScene } from "./SceneTimeline";
import { timeToSeconds, secondsToTime, detectPeaks, amplitudeToDb, alignScenesToPeaks, type AudioPeak } from "@/lib/audio-utils";

interface SilenceGap {
  start_sec: number;
  end_sec: number;
  duration_sec: number;
}

export interface PersistedPeakData {
  peaks: Array<{ time_sec: number; amplitude: number }>;
  silence_gaps: SilenceGap[];
  duration_sec: number;
  energy_interval_sec: number;
  energy_profile: number[];
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

interface AudioTrackTimelineProps {
  audioUrl: string | null;
  /** Raw audio File for local decoding (avoids CORS issues with signed URLs) */
  audioFile?: File | null;
  scenes: SavedScene[];
  activeIndex: number | null;
  onSelectScene?: (index: number) => void;
  scrubberPosition: number;
  onSeek?: (timeSec: number) => void;
  onUploadAudio?: () => void;
  uploadingAudio?: boolean;
  /** Called when user clicks "Auto-Align" with new scene boundaries */
  onAutoAlign?: (boundaries: { startSec: number; endSec: number }[]) => void;
  /** Called when user drags a boundary divider between scenes */
  onBoundaryDrag?: (boundaries: { startSec: number; endSec: number }[]) => void;
  /** Called continuously during playback and on play/pause state changes */
  onPlaybackStateChange?: (state: { isPlaying: boolean; timeSec: number }) => void;
  /** External play/pause control from parent — true = play, false = pause, null = no external control */
  externalPlay?: boolean | null;
  /** When true, audio loops back to start instead of stopping */
  loop?: boolean;
  /** Persisted waveform peak data from Analysis step — avoids re-decoding */
  persistedPeakData?: PersistedPeakData | null;
  /** Word-level transcript data with timestamps for alignment overlay */
  transcriptWords?: TranscriptWord[];
}

/** Downsample audio data to a fixed number of bars for the waveform (in dB) */
function computeDbWaveform(channelData: Float32Array, barCount: number): { linear: number[]; db: number[] } {
  const blockSize = Math.floor(channelData.length / barCount);
  const rmsValues: number[] = [];
  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    const start = i * blockSize;
    for (let j = start; j < start + blockSize && j < channelData.length; j++) {
      sum += channelData[j] * channelData[j];
    }
    rmsValues.push(Math.sqrt(sum / blockSize));
  }
  const maxRms = Math.max(...rmsValues, 0.0001);
  const linear = rmsValues.map(v => v / maxRms);
  const db = rmsValues.map(v => amplitudeToDb(v / maxRms));
  return { linear, db };
}

export interface AudioTrackTimelineHandle {
  seekAndPlay: (timeSec: number) => void;
  getWaveform: () => { bars: number[]; durationSec: number } | null;
}

const AudioTrackTimeline = forwardRef<AudioTrackTimelineHandle, AudioTrackTimelineProps>(function AudioTrackTimeline({
  audioUrl,
  audioFile,
  scenes,
  activeIndex,
  onSelectScene,
  scrubberPosition,
  onSeek,
  onUploadAudio,
  uploadingAudio,
  onAutoAlign,
  onBoundaryDrag,
  onPlaybackStateChange,
  externalPlay,
  loop = false,
  persistedPeakData,
  transcriptWords,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [dbWaveform, setDbWaveform] = useState<number[]>([]);
  const [peaks, setPeaks] = useState<AudioPeak[]>([]);
  const [audioDuration, setAudioDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showWords, setShowWords] = useState(true);
  const loopRef = useRef(loop);
  useEffect(() => { loopRef.current = loop; }, [loop]);
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);
  useEffect(() => { onPlaybackStateChangeRef.current = onPlaybackStateChange; }, [onPlaybackStateChange]);
  const [draggingBoundary, setDraggingBoundary] = useState<number | null>(null);
  const [snappedSilence, setSnappedSilence] = useState<{ sec: number; label: string } | null>(null);

  // Shared audio element factory with loop-aware ended handler
  const getOrCreateAudio = useCallback(() => {
    if (audioElRef.current) return audioElRef.current;
    if (!audioUrl) return null;
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioElRef.current = audio;
    audio.addEventListener("ended", () => {
      if (loopRef.current) {
        // Loop: seek back to start and keep playing
        audio.currentTime = 0;
        audio.play().then(() => {
          setPlaybackTime(0);
          onPlaybackStateChangeRef.current?.({ isPlaying: true, timeSec: 0 });
          const tick = () => {
            const t = audio.currentTime;
            setPlaybackTime(t);
            onPlaybackStateChangeRef.current?.({ isPlaying: true, timeSec: t });
            if (!audio.paused) {
              animFrameRef.current = requestAnimationFrame(tick);
            }
          };
          animFrameRef.current = requestAnimationFrame(tick);
        }).catch(() => {});
      } else {
        setIsPlaying(false);
        setPlaybackTime(0);
        onPlaybackStateChangeRef.current?.({ isPlaying: false, timeSec: 0 });
      }
    });
    return audio;
  }, [audioUrl]);

  // Expose seekAndPlay + getWaveform for parent
  useImperativeHandle(ref, () => ({
    seekAndPlay: (timeSec: number) => {
      const audio = getOrCreateAudio();
      if (!audio) return;
      audio.currentTime = timeSec;
      audio.play().then(() => {
        setIsPlaying(true);
        setPlaybackTime(timeSec);
        onPlaybackStateChange?.({ isPlaying: true, timeSec });
        const tick = () => {
          const t = audio.currentTime;
          setPlaybackTime(t);
          onPlaybackStateChange?.({ isPlaying: true, timeSec: t });
          if (!audio.paused) {
            animFrameRef.current = requestAnimationFrame(tick);
          }
        };
        animFrameRef.current = requestAnimationFrame(tick);
      }).catch(() => {});
    },
    getWaveform: () => {
      if (waveform.length === 0 || audioDuration <= 0) return null;
      return { bars: waveform, durationSec: audioDuration };
    },
  }), [audioUrl, onPlaybackStateChange, getOrCreateAudio, waveform, audioDuration]);

  // Cleanup audio element on unmount
  useEffect(() => {
    return () => {
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Sync scrubber from playback
  useEffect(() => {
    if (isPlaying && playbackTime > 0) {
      onSeek?.(playbackTime);
    }
  }, [playbackTime, isPlaying]);

  // Reset audio element when URL changes
  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
      setIsPlaying(false);
      setPlaybackTime(0);
    }
  }, [audioUrl]);

  // Respond to external play/pause from parent (unified Play All button)
  useEffect(() => {
    if (externalPlay === null || externalPlay === undefined) return;
    if (!audioUrl) return;

    if (externalPlay && !isPlaying) {
      const audio = getOrCreateAudio();
      if (!audio) return;
      audio.currentTime = 0; // restart from beginning
      audio.play().then(() => {
        setIsPlaying(true);
        onPlaybackStateChange?.({ isPlaying: true, timeSec: audio.currentTime });
        const tick = () => {
          const t = audio.currentTime;
          setPlaybackTime(t);
          onPlaybackStateChange?.({ isPlaying: true, timeSec: t });
          if (!audio.paused) {
            animFrameRef.current = requestAnimationFrame(tick);
          }
        };
        animFrameRef.current = requestAnimationFrame(tick);
      }).catch(() => {});
    } else if (!externalPlay && isPlaying) {
      // Pause audio
      const audio = audioElRef.current;
      if (audio) {
        audio.pause();
        cancelAnimationFrame(animFrameRef.current);
        setIsPlaying(false);
        onPlaybackStateChange?.({ isPlaying: false, timeSec: audio.currentTime });
      }
    }
  }, [externalPlay]);

  // Total scene duration
  const totalSceneDuration = useMemo(
    () => scenes.reduce((sum, s) => sum + s.durationSec, 0),
    [scenes]
  );

  const timelineDuration = audioDuration > 0 ? audioDuration : totalSceneDuration;

  // Fetch and decode audio to generate waveform + detect peaks
  useEffect(() => {
    if (!audioUrl && !audioFile) return;
    let cancelled = false;

    const loadAudio = async () => {
      setLoading(true);
      try {
        let arrayBuf: ArrayBuffer;

        if (audioFile) {
          // Use local File directly — avoids CORS issues with signed URLs
          arrayBuf = await audioFile.arrayBuffer();
        } else if (audioUrl) {
          // Fallback: fetch from URL (may fail with CORS on some providers)
          const res = await fetch(audioUrl);
          if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
          arrayBuf = await res.arrayBuffer();
        } else {
          return;
        }

        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (cancelled) return;
        setAudioDuration(decoded.duration);
        const channel = decoded.getChannelData(0);
        const { linear, db } = computeDbWaveform(channel, 300);
        setWaveform(linear);
        setDbWaveform(db);
        // Detect peaks
        const detectedPeaks = detectPeaks(channel, decoded.sampleRate, {
          windowSec: 0.05,
          minGapSec: 2.0,
          threshold: 0.4,
        });
        setPeaks(detectedPeaks);
        ctx.close();
      } catch (e) {
        console.warn("Waveform generation failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAudio();
    return () => { cancelled = true; };
  }, [audioUrl, audioFile]);

  // Scene positions mapped onto the full timeline using absolute time_start/time_end
  const scenePositions = useMemo(() => {
    return scenes.map((s) => {
      const startSec = timeToSeconds(s.timeStart);
      const endSec = timeToSeconds(s.timeEnd);
      const dur = Math.max(0.5, endSec - startSec);
      return {
        startPct: (startSec / Math.max(timelineDuration, 1)) * 100,
        widthPct: (dur / Math.max(timelineDuration, 1)) * 100,
        startSec,
        endSec,
      };
    });
  }, [scenes, timelineDuration]);

  // Convert persisted peaks to the AudioPeak format used by alignScenesToPeaks
  const effectivePeaks = useMemo<AudioPeak[]>(() => {
    if (peaks.length > 0) return peaks;
    if (persistedPeakData?.peaks) {
      return persistedPeakData.peaks.map(p => ({ timeSec: p.time_sec, amplitude: p.amplitude }));
    }
    return [];
  }, [peaks, persistedPeakData]);

  const effectiveSilenceGaps = useMemo(() => {
    return persistedPeakData?.silence_gaps || undefined;
  }, [persistedPeakData]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveform.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barW = w / waveform.length;
    const midY = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Draw dB scale background lines
    const dbLevels = [-48, -36, -24, -12, -6, 0];
    ctx.strokeStyle = "hsl(var(--border) / 0.15)";
    ctx.lineWidth = 0.5;
    for (const dbLevel of dbLevels) {
      const normalizedDb = (dbLevel + 60) / 60; // map -60..0 to 0..1
      const barH = normalizedDb * (h * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, midY - barH / 2);
      ctx.lineTo(w, midY - barH / 2);
      ctx.moveTo(0, midY + barH / 2);
      ctx.lineTo(w, midY + barH / 2);
      ctx.stroke();
    }

    // Draw waveform bars with dB-aware coloring
    for (let i = 0; i < waveform.length; i++) {
      const barH = waveform[i] * (h * 0.8);
      const x = i * barW;
      const dbVal = dbWaveform[i] || -60;

      const timePct = i / waveform.length;
      const timeSec = timePct * timelineDuration;
      const sceneIdx = scenePositions.findIndex(
        (sp) => timeSec >= sp.startSec && timeSec < sp.endSec
      );

      // Color: hot bars near 0dB, cooler for quiet
      if (dbVal > -6) {
        // Loud — use destructive/red tones
        ctx.fillStyle = sceneIdx === activeIndex
          ? "hsl(var(--destructive) / 0.9)"
          : "hsl(var(--destructive) / 0.6)";
      } else if (sceneIdx >= 0 && sceneIdx === activeIndex) {
        ctx.fillStyle = "hsl(var(--primary))";
      } else if (sceneIdx >= 0) {
        ctx.fillStyle = "hsl(var(--accent) / 0.7)";
      } else {
        ctx.fillStyle = "hsl(var(--muted-foreground) / 0.25)";
      }

      ctx.fillRect(x, midY - barH / 2, Math.max(barW - 0.5, 0.5), barH);
    }

    // Draw silence gap overlays
    if (effectiveSilenceGaps && effectiveSilenceGaps.length > 0 && timelineDuration > 0) {
      ctx.fillStyle = "hsl(var(--accent) / 0.12)";
      for (const gap of effectiveSilenceGaps) {
        const gapX = (gap.start_sec / timelineDuration) * w;
        const gapW = ((gap.end_sec - gap.start_sec) / timelineDuration) * w;
        ctx.fillRect(gapX, 0, Math.max(gapW, 1), h);
        // Border lines
        ctx.strokeStyle = "hsl(var(--accent) / 0.3)";
        ctx.lineWidth = 0.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(gapX, 0); ctx.lineTo(gapX, h);
        ctx.moveTo(gapX + gapW, 0); ctx.lineTo(gapX + gapW, h);
        ctx.stroke();
      }
    }

    // Draw peak markers as vertical dashed lines
    if (peaks.length > 0 && timelineDuration > 0) {
      ctx.strokeStyle = "hsl(var(--primary) / 0.6)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const peak of peaks) {
        const px = (peak.timeSec / timelineDuration) * w;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();

        // Small diamond marker at top
        ctx.setLineDash([]);
        ctx.fillStyle = "hsl(var(--primary))";
        ctx.beginPath();
        ctx.moveTo(px, 2);
        ctx.lineTo(px + 3, 6);
        ctx.lineTo(px, 10);
        ctx.lineTo(px - 3, 6);
        ctx.closePath();
        ctx.fill();
        ctx.setLineDash([3, 3]);
      }
      ctx.setLineDash([]);
    }

    // Draw scrubber line
    if (scrubberPosition > 0 && timelineDuration > 0) {
      const scrubX = (scrubberPosition / timelineDuration) * w;
      ctx.strokeStyle = "hsl(var(--primary))";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(scrubX, 0);
      ctx.lineTo(scrubX, h);
      ctx.stroke();
    }
  }, [waveform, dbWaveform, peaks, effectiveSilenceGaps, scenePositions, activeIndex, scrubberPosition, timelineDuration]);

  const seekToPosition = useCallback((clientX: number) => {
    if (!containerRef.current || timelineDuration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const timeSec = pct * timelineDuration;

    const sceneIdx = scenePositions.findIndex(
      (sp) => timeSec >= sp.startSec && timeSec < sp.endSec
    );
    if (sceneIdx >= 0) onSelectScene?.(sceneIdx);

    const clampedTime = Math.max(0, Math.min(timeSec, timelineDuration));
    if (audioElRef.current) {
      audioElRef.current.currentTime = clampedTime;
      setPlaybackTime(clampedTime);
    }
    onSeek?.(clampedTime);
  }, [timelineDuration, scenePositions, onSelectScene, onSeek]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    seekToPosition(e.clientX);
  }, [seekToPosition]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      seekToPosition(e.clientX);
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, seekToPosition]);


  // Boundary divider dragging
  const MIN_SCENE_SEC = 2;
  const handleBoundaryMouseDown = useCallback((e: React.MouseEvent, boundaryIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingBoundary(boundaryIdx);
  }, []);

  // Snap-to-silence: find nearest silence gap edge within threshold
  const SILENCE_SNAP_SEC = 0.8; // snap within ±0.8s of a silence gap edge
  const findSilenceSnap = useCallback((timeSec: number): { snappedSec: number; label: string } | null => {
    if (!effectiveSilenceGaps || effectiveSilenceGaps.length === 0) return null;
    let bestDist = Infinity;
    let bestSec = timeSec;
    let bestLabel = "";
    for (const gap of effectiveSilenceGaps) {
      const dStart = Math.abs(timeSec - gap.start_sec);
      const dEnd = Math.abs(timeSec - gap.end_sec);
      const dMid = Math.abs(timeSec - (gap.start_sec + gap.end_sec) / 2);
      if (dStart < bestDist && dStart <= SILENCE_SNAP_SEC) {
        bestDist = dStart; bestSec = gap.start_sec; bestLabel = "silence start";
      }
      if (dEnd < bestDist && dEnd <= SILENCE_SNAP_SEC) {
        bestDist = dEnd; bestSec = gap.end_sec; bestLabel = "silence end";
      }
      if (dMid < bestDist && dMid <= SILENCE_SNAP_SEC) {
        bestDist = dMid; bestSec = (gap.start_sec + gap.end_sec) / 2; bestLabel = "silence mid";
      }
    }
    return bestDist <= SILENCE_SNAP_SEC ? { snappedSec: bestSec, label: bestLabel } : null;
  }, [effectiveSilenceGaps]);

  useEffect(() => {
    if (draggingBoundary === null) return;
    const handleMove = (e: MouseEvent) => {
      e.preventDefault();
      if (!containerRef.current || timelineDuration <= 0 || !onBoundaryDrag) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      let newBoundarySec = pct * timelineDuration;
      const boundaries = scenePositions.map(sp => ({ startSec: sp.startSec, endSec: sp.endSec }));
      const leftIdx = draggingBoundary;
      const rightIdx = draggingBoundary + 1;
      if (leftIdx < 0 || rightIdx >= boundaries.length) return;
      const leftStart = boundaries[leftIdx].startSec;
      const rightEnd = boundaries[rightIdx].endSec;

      // Snap to silence gap edges
      const snap = findSilenceSnap(newBoundarySec);
      if (snap) {
        newBoundarySec = snap.snappedSec;
        setSnappedSilence({ sec: snap.snappedSec, label: snap.label });
      } else {
        setSnappedSilence(null);
      }

      const clampedSec = Math.max(leftStart + MIN_SCENE_SEC, Math.min(rightEnd - MIN_SCENE_SEC, newBoundarySec));
      boundaries[leftIdx] = { startSec: leftStart, endSec: clampedSec };
      boundaries[rightIdx] = { startSec: clampedSec, endSec: rightEnd };
      onBoundaryDrag(boundaries);
    };
    const handleUp = () => { setDraggingBoundary(null); setSnappedSilence(null); };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingBoundary, timelineDuration, scenePositions, onBoundaryDrag, findSilenceSnap]);

  const handleAutoAlign = useCallback(() => {
    if (!onAutoAlign || audioDuration <= 0 || scenes.length === 0) return;
    const boundaries = alignScenesToPeaks(effectivePeaks, scenes.length, audioDuration, effectiveSilenceGaps);
    onAutoAlign(boundaries);
  }, [onAutoAlign, effectivePeaks, effectiveSilenceGaps, scenes.length, audioDuration]);

  // Auto-align scenes when audio finishes loading and peaks are detected
  const hasAutoAlignedRef = useRef(false);
  useEffect(() => {
    if (hasAutoAlignedRef.current) return;
    if (!onAutoAlign || audioDuration <= 0 || scenes.length === 0 || loading) return;
    // Trigger once after waveform is ready
    hasAutoAlignedRef.current = true;
    const boundaries = alignScenesToPeaks(effectivePeaks, scenes.length, audioDuration, effectiveSilenceGaps);
    onAutoAlign(boundaries);
  }, [audioDuration, effectivePeaks, effectiveSilenceGaps, scenes.length, loading, onAutoAlign]);

  // Reset auto-align flag when audio changes
  useEffect(() => {
    hasAutoAlignedRef.current = false;
  }, [audioUrl, audioFile]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Full Audio Track</span>
          {audioDuration > 0 && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
              {isPlaying ? secondsToTime(playbackTime) + " / " : ""}{secondsToTime(audioDuration)}
            </Badge>
          )}
          {effectivePeaks.length > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              {effectivePeaks.length} peaks{effectiveSilenceGaps && effectiveSilenceGaps.length > 0 ? ` · ${effectiveSilenceGaps.length} gaps` : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-[10px] text-muted-foreground animate-pulse">Loading waveform…</span>
          )}
          {effectivePeaks.length > 0 && onAutoAlign && scenes.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAutoAlign}
              className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-foreground"
              title="Auto-align scene boundaries to detected audio peaks"
            >
              <Zap className="h-3 w-3" />
              Auto-Align to Peaks
            </Button>
          )}
        </div>
      </div>

      {/* Legend */}
      {(effectivePeaks.length > 0 || (effectiveSilenceGaps && effectiveSilenceGaps.length > 0)) && (
        <div className="flex items-center gap-4 text-[9px] text-muted-foreground px-1">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary/80" />
            Peak markers
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2 rounded-sm bg-accent/20 border border-accent/30" />
            Silence gaps
          </span>
          {onBoundaryDrag && scenes.length > 1 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-flex flex-col gap-px items-center">
                <span className="w-1 h-1 rounded-full bg-primary" />
                <span className="w-1 h-1 rounded-full bg-primary" />
              </span>
              Drag dividers
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-0.5 h-3 bg-primary" />
            Playhead
          </span>
          {transcriptWords && transcriptWords.length > 0 && (
            <button
              onClick={() => setShowWords(v => !v)}
              className={`flex items-center gap-1.5 ml-auto px-1.5 py-0.5 rounded transition-colors ${showWords ? "bg-primary/20 text-primary" : "hover:text-foreground"}`}
            >
              <Type className="h-2.5 w-2.5" />
              {showWords ? "Words ON" : "Words OFF"}
            </button>
          )}
        </div>
      )}

      <div ref={containerRef} onMouseDown={handleMouseDown} className={`relative rounded-lg bg-secondary/50 border border-border/30 overflow-hidden ${isDragging ? "cursor-grabbing" : "cursor-crosshair"} select-none`} style={{ height: showWords && transcriptWords && transcriptWords.length > 0 ? 108 : 88 }}>
        {/* dB scale labels */}
        {waveform.length > 0 && (
          <div className="absolute left-0 top-0 bottom-0 w-6 z-10 pointer-events-none flex flex-col justify-between py-1">
            <span className="text-[6px] text-muted-foreground/40 leading-none pl-0.5">0dB</span>
            <span className="text-[6px] text-muted-foreground/40 leading-none pl-0.5">-24</span>
            <span className="text-[6px] text-muted-foreground/40 leading-none pl-0.5">-48</span>
          </div>
        )}

        {/* Waveform canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: "none" }}
        />

        {/* Scene overlay blocks with lyrics alignment */}
        <div className="absolute inset-0 pointer-events-none">
          {scenePositions.map((pos, idx) => (
            <div
              key={idx}
              className={`absolute top-0 h-full transition-all ${
                idx === activeIndex
                  ? "bg-primary/15 ring-1 ring-inset ring-primary/40"
                  : "bg-accent/5 hover:bg-accent/10"
              }`}
              style={{
                left: `${pos.startPct}%`,
                width: `${pos.widthPct}%`,
                borderRight: idx < scenePositions.length - 1 ? "1px solid hsl(var(--border) / 0.4)" : "none",
              }}
              title={`Scene ${scenes[idx].sceneNumber}: ${pos.startSec.toFixed(1)}s – ${pos.endSec.toFixed(1)}s\n${scenes[idx].lyricSegment || ""}`}
            >
              <span className="absolute top-0.5 left-1 text-[8px] font-medium text-foreground/70 leading-none">
                S{scenes[idx].sceneNumber}
              </span>
              {pos.widthPct > 8 && (
                <span className="absolute top-0.5 right-1 text-[6px] text-muted-foreground/50 leading-none tabular-nums">
                  {pos.startSec.toFixed(0)}s
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Word-level transcript overlay — shows individual words at their timestamp positions */}
        {showWords && transcriptWords && transcriptWords.length > 0 && timelineDuration > 0 && (
          <div className="absolute inset-x-0 bottom-2 top-auto pointer-events-none overflow-hidden" style={{ height: 20 }}>
            {(() => {
              // Group words into visible clusters to avoid overlap
              const MIN_PCT_GAP = 1.5; // minimum % gap between word labels
              const visibleWords: Array<{ text: string; leftPct: number; isActive: boolean; isPast: boolean; startSec: number; endSec: number }> = [];
              let lastRightPct = -10;

              for (const word of transcriptWords) {
                if (!word.text || word.text.startsWith("[") || word.text.trim() === "") continue;
                const midSec = (word.start + word.end) / 2;
                const leftPct = (midSec / timelineDuration) * 100;

                if (leftPct - lastRightPct < MIN_PCT_GAP) {
                  if (visibleWords.length > 0) {
                    const prev = visibleWords[visibleWords.length - 1];
                    if (prev.text.length < 20) {
                      prev.text += " " + word.text;
                      prev.endSec = word.end;
                      // Re-evaluate active/past for merged word
                      prev.isActive = scrubberPosition >= prev.startSec && scrubberPosition < prev.endSec;
                      prev.isPast = scrubberPosition >= prev.endSec;
                      lastRightPct = leftPct + (word.text.length * 0.4);
                      continue;
                    }
                  }
                  continue;
                }

                const isActive = scrubberPosition >= word.start && scrubberPosition < word.end;
                const isPast = scrubberPosition >= word.end;
                visibleWords.push({ text: word.text, leftPct, isActive, isPast, startSec: word.start, endSec: word.end });
                lastRightPct = leftPct + (word.text.length * 0.4);
              }

              return visibleWords.map((w, i) => (
                <span
                  key={i}
                  className={`absolute text-[6px] leading-none whitespace-nowrap transition-all duration-150 ${
                    w.isActive
                      ? "text-primary font-bold scale-125 drop-shadow-[0_0_4px_hsl(var(--primary)/0.6)]"
                      : w.isPast
                        ? "text-primary/60 font-medium"
                        : "text-foreground/50 font-medium"
                  }`}
                  style={{
                    left: `${w.leftPct}%`,
                    transform: `translateX(-50%)${w.isActive ? " scale(1.25)" : ""}`,
                    bottom: w.isActive ? 2 : 0,
                    zIndex: w.isActive ? 10 : 1,
                  }}
                >
                  {w.text}
                </span>
              ));
            })()}
          </div>
        )}

        {/* Draggable boundary dividers between scenes */}
        {onBoundaryDrag && scenePositions.length > 1 && scenePositions.map((pos, idx) => {
          if (idx >= scenePositions.length - 1) return null;
          const boundaryPct = ((pos.endSec / Math.max(timelineDuration, 1)) * 100);
          return (
            <div
              key={`divider-${idx}`}
              className={`absolute top-0 h-full z-30 group ${draggingBoundary === idx ? "cursor-col-resize" : "cursor-col-resize"}`}
              style={{
                left: `calc(${boundaryPct}% - 6px)`,
                width: 12,
                pointerEvents: "auto",
              }}
              onMouseDown={(e) => handleBoundaryMouseDown(e, idx)}
              title={`Drag to adjust boundary · ${pos.endSec.toFixed(1)}s`}
            >
              {/* Visible handle line */}
              <div className={`absolute left-1/2 -translate-x-1/2 top-0 h-full w-0.5 transition-all ${
                draggingBoundary === idx && snappedSilence
                  ? "bg-accent w-1.5 shadow-[0_0_8px_hsl(var(--accent)/0.8)]"
                  : draggingBoundary === idx
                  ? "bg-primary w-1 shadow-[0_0_6px_hsl(var(--primary)/0.6)]"
                  : "bg-border/40 group-hover:bg-primary/70 group-hover:w-1"
              }`} />
              {/* Grip dots */}
              <div className={`absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 items-center transition-opacity ${
                draggingBoundary === idx ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              </div>
              {/* Time tooltip while dragging */}
              {draggingBoundary === idx && (
                <div className={`absolute left-1/2 -translate-x-1/2 -top-5 text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap font-medium tabular-nums z-40 ${
                  snappedSilence ? "bg-accent text-accent-foreground ring-1 ring-accent" : "bg-primary text-primary-foreground"
                }`}>
                  {secondsToTime(pos.endSec)}
                  {snappedSilence && <span className="ml-1 opacity-80">⟡ {snappedSilence.label}</span>}
                </div>
              )}
            </div>
          );
        })}

        {/* Time markers */}
        {timelineDuration > 0 && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 pointer-events-none">
            {Array.from({ length: Math.min(Math.ceil(timelineDuration / 10) + 1, 20) }, (_, i) => {
              const sec = i * 10;
              if (sec > timelineDuration) return null;
              return (
                <span
                  key={sec}
                  className="text-[7px] text-muted-foreground/50 tabular-nums"
                  style={{ position: "absolute", left: `${(sec / timelineDuration) * 100}%` }}
                >
                  {secondsToTime(sec)}
                </span>
              );
            })}
          </div>
        )}

        {/* Draggable scrubber handle */}
        {timelineDuration > 0 && (scrubberPosition > 0 || isDragging) && (
          <div
            className="absolute top-0 h-full pointer-events-none z-20"
            style={{ left: `${(scrubberPosition / timelineDuration) * 100}%` }}
          >
            <div className="relative -translate-x-1/2 h-full">
              {/* Vertical line */}
              <div className="absolute left-1/2 -translate-x-1/2 top-0 w-0.5 h-full bg-primary shadow-[0_0_4px_hsl(var(--primary)/0.5)]" />
              {/* Handle grip */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-3 h-3 rounded-full bg-primary border-2 border-background shadow-md" />
              {/* Time tooltip during drag */}
              {isDragging && (
                <div className="absolute left-1/2 -translate-x-1/2 -top-6 bg-primary text-primary-foreground text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap font-medium tabular-nums">
                  {secondsToTime(scrubberPosition)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {waveform.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            {onUploadAudio ? (
              <button
                onClick={(e) => { e.stopPropagation(); onUploadAudio(); }}
                disabled={uploadingAudio}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <Music className="h-4 w-4" />
                <span className="text-xs font-medium">
                  {uploadingAudio ? "Uploading…" : "Click to upload audio track"}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground/50">
                <Music className="h-4 w-4" />
                <span className="text-xs">No audio waveform</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gap warning */}
      {audioDuration > 0 && totalSceneDuration < audioDuration && (
        <p className="text-[10px] text-amber-500">
          Scenes cover {totalSceneDuration.toFixed(1)}s of {audioDuration.toFixed(1)}s — last frame will hold for remaining {(audioDuration - totalSceneDuration).toFixed(1)}s
        </p>
      )}
    </div>
  );
});

export default AudioTrackTimeline;
