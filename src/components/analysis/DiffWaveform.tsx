import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface Segment {
  start: number | null | undefined;
  end: number | null | undefined;
}

interface DiffWaveformProps {
  audioUrl: string;
  currentTime: number;
  duration: number;
  olderSegment?: Segment | null;
  newerSegment?: Segment | null;
  onSeek: (time: number) => void;
  height?: number;
}

// Module-level cache so the dialog re-opens don't redecode the same audio.
const peakCache = new Map<string, { peaks: Float32Array; duration: number }>();
const inflight = new Map<string, Promise<{ peaks: Float32Array; duration: number }>>();

const TARGET_BARS = 600;

async function loadPeaks(url: string) {
  const cached = peakCache.get(url);
  if (cached) return cached;
  const pending = inflight.get(url);
  if (pending) return pending;

  const promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load audio (${res.status})`);
    const buf = await res.arrayBuffer();
    const Ctx: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ac = new Ctx();
    try {
      const decoded = await ac.decodeAudioData(buf.slice(0));
      const channel = decoded.getChannelData(0);
      const samplesPerBar = Math.max(1, Math.floor(channel.length / TARGET_BARS));
      const peaks = new Float32Array(TARGET_BARS);
      for (let i = 0; i < TARGET_BARS; i++) {
        let max = 0;
        const start = i * samplesPerBar;
        const end = Math.min(channel.length, start + samplesPerBar);
        for (let j = start; j < end; j++) {
          const v = Math.abs(channel[j]);
          if (v > max) max = v;
        }
        peaks[i] = max;
      }
      const result = { peaks, duration: decoded.duration };
      peakCache.set(url, result);
      return result;
    } finally {
      try { await ac.close(); } catch { /* noop */ }
    }
  })();

  inflight.set(url, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(url);
  }
}

export default function DiffWaveform({
  audioUrl,
  currentTime,
  duration,
  olderSegment,
  newerSegment,
  onSeek,
  height = 72,
}: DiffWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [peaksDuration, setPeaksDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(800);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Resize observer
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(200, Math.floor(e.contentRect.width)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Load peaks
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPeaks(null);
    if (!audioUrl) return;
    setLoading(true);
    loadPeaks(audioUrl)
      .then((r) => {
        if (cancelled) return;
        setPeaks(r.peaks);
        setPeaksDuration(r.duration);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [audioUrl]);

  const effectiveDuration = duration > 0 ? duration : peaksDuration;

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const mid = height / 2;
    const barCount = peaks.length;
    const barWidth = Math.max(1, width / barCount);

    // Background
    ctx.fillStyle = "hsl(var(--muted) / 0.15)";
    ctx.fillRect(0, 0, width, height);

    // Segment overlays — older top half, newer bottom half
    const drawSegOverlay = (seg: Segment | null | undefined, top: number, h: number, color: string) => {
      if (!seg || seg.start == null || !effectiveDuration) return;
      const end = seg.end ?? seg.start;
      const x1 = (seg.start / effectiveDuration) * width;
      const x2 = (end / effectiveDuration) * width;
      ctx.fillStyle = color;
      ctx.fillRect(x1, top, Math.max(2, x2 - x1), h);
    };
    drawSegOverlay(olderSegment, 0, mid, "hsl(var(--destructive) / 0.18)");
    drawSegOverlay(newerSegment, mid, mid, "hsl(var(--success) / 0.18)");

    // Bars (mirrored)
    let maxPeak = 0;
    for (let i = 0; i < barCount; i++) if (peaks[i] > maxPeak) maxPeak = peaks[i];
    const norm = maxPeak > 0 ? 1 / maxPeak : 1;

    ctx.fillStyle = "hsl(var(--foreground) / 0.55)";
    for (let i = 0; i < barCount; i++) {
      const x = i * barWidth;
      const amp = peaks[i] * norm;
      const h = Math.max(1, amp * (height * 0.9));
      ctx.fillRect(x, mid - h / 2, Math.max(1, barWidth - 0.5), h);
    }

    // Center divider
    ctx.fillStyle = "hsl(var(--border))";
    ctx.fillRect(0, mid - 0.5, width, 1);

    // Playhead
    if (effectiveDuration > 0) {
      const px = (currentTime / effectiveDuration) * width;
      ctx.fillStyle = "hsl(var(--primary))";
      ctx.fillRect(Math.max(0, Math.min(width - 1, px) - 0.5), 0, 1.5, height);
    }

    // Hover indicator
    if (hoverX != null) {
      ctx.fillStyle = "hsl(var(--primary) / 0.45)";
      ctx.fillRect(hoverX - 0.5, 0, 1, height);
    }
  }, [peaks, width, height, currentTime, effectiveDuration, olderSegment, newerSegment, hoverX]);

  const xToTime = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !effectiveDuration) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return (x / rect.width) * effectiveDuration;
  };

  const hoverTime = useMemo(() => {
    if (hoverX == null || !effectiveDuration) return null;
    return (hoverX / width) * effectiveDuration;
  }, [hoverX, width, effectiveDuration]);

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-destructive/40" /> older
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-success/40" /> newer
          </span>
        </span>
        <span className="font-mono tabular-nums">
          {currentTime.toFixed(2)}s
          {effectiveDuration > 0 ? ` / ${effectiveDuration.toFixed(2)}s` : ""}
          {hoverTime != null && ` · → ${hoverTime.toFixed(2)}s`}
        </span>
      </div>
      <div className="relative rounded-md border border-border bg-background/40 overflow-hidden" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Decoding waveform…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-destructive">
            Waveform unavailable: {error}
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={`block w-full cursor-crosshair ${peaks ? "" : "opacity-0"}`}
          style={{ height }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setHoverX(e.clientX - rect.left);
          }}
          onMouseLeave={() => setHoverX(null)}
          onClick={(e) => {
            if (!peaks) return;
            onSeek(xToTime(e.clientX));
          }}
        />
      </div>
    </div>
  );
}
