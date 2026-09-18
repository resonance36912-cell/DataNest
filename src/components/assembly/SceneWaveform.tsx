import { useEffect, useRef, useState, memo } from "react";

interface SceneWaveformProps {
  videoUrl: string;
  width: number;
  height: number;
  className?: string;
  /** Pre-computed waveform bars from master audio segment — skips video decode when provided */
  masterBars?: number[];
}

// Module-level cache: decoded waveform bars keyed by videoUrl
const waveformCache = new Map<string, number[]>();

/**
 * Renders a mini waveform for a scene.
 * Prefers master audio segment data (masterBars) for alignment with the full audio track.
 * Falls back to extracting audio from the video file via Web Worker.
 */
function SceneWaveformInner({ videoUrl, width, height, className, masterBars }: SceneWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bars, setBars] = useState<number[]>(() => masterBars || waveformCache.get(videoUrl) || []);

  // Use masterBars when available — keeps waveforms aligned with the full audio track
  useEffect(() => {
    if (masterBars && masterBars.length > 0) {
      setBars(masterBars);
      return;
    }

    if (!videoUrl) return;

    const cached = waveformCache.get(videoUrl);
    if (cached) {
      setBars(cached);
      return;
    }

    let cancelled = false;
    const barCount = Math.max(20, Math.min(60, Math.floor(width / 3)));

    const worker = new Worker(
      new URL("@/workers/waveform.worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e: MessageEvent<{ bars: number[] }>) => {
      if (!cancelled && e.data.bars.length > 0) {
        waveformCache.set(videoUrl, e.data.bars);
        setBars(e.data.bars);
      }
      worker.terminate();
    };

    worker.onerror = () => {
      worker.terminate();
    };

    worker.postMessage({ url: videoUrl, barCount });

    return () => {
      cancelled = true;
      worker.terminate();
    };
  }, [videoUrl, width, masterBars]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const barWidth = width / bars.length;
    const gap = Math.max(0.5, barWidth * 0.15);

    for (let i = 0; i < bars.length; i++) {
      const barH = Math.max(2, bars[i] * height * 0.95);
      const x = i * barWidth + gap / 2;
      const y = height - barH;

      const amp = bars[i];
      // Use primary color for master audio bars, green-amber for video-decoded
      if (masterBars) {
        // Themed to match the full audio track scaffold
        const alpha = 0.6 + amp * 0.4;
        ctx.fillStyle = `rgba(168, 85, 247, ${alpha})`; // purple primary hue
      } else {
        const r = amp < 0.5 ? Math.floor(amp * 2 * 255) : 255;
        const g = amp < 0.5 ? 255 : Math.floor((1 - (amp - 0.5) * 2) * 255);
        ctx.fillStyle = `rgba(${r}, ${g}, 40, ${0.7 + amp * 0.3})`;
      }
      ctx.fillRect(x, y, barWidth - gap, barH);
    }
  }, [bars, width, height, masterBars]);

  if (bars.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ width, height }}
    />
  );
}

const SceneWaveform = memo(SceneWaveformInner);
export default SceneWaveform;
