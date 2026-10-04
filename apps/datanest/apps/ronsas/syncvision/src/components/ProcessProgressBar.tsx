import { useEffect, useState, useRef } from "react";
import { Clock, Activity } from "lucide-react";

interface ProcessProgressBarProps {
  /** Current progress 0–100 */
  progress: number;
  /** Whether the process is actively running */
  active: boolean;
  /** Label describing current phase */
  label?: string;
  /** Optional className */
  className?: string;
  /** Show elapsed timer (default true) */
  showTimer?: boolean;
  /** Height class for the bar (default "h-2") */
  barHeight?: string;
  /**
   * Optional real backend-reported progress (e.g. render_jobs.progress).
   * When provided, a small "live" pip is shown next to the percentage to
   * signal the bar is reflecting real DB samples — not the simulated ticker
   * fallback.
   */
  realProgress?: number | null;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export default function ProcessProgressBar({
  progress,
  active,
  label,
  className = "",
  showTimer = true,
  barHeight = "h-2",
  realProgress = null,
}: ProcessProgressBarProps) {
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const isLive = typeof realProgress === "number" && realProgress > 0 && active;

  useEffect(() => {
    if (active && !startRef.current) {
      startRef.current = Date.now();
      setElapsed(0);
    }
    if (!active) {
      startRef.current = null;
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      if (startRef.current) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  if (!active && progress <= 0) return null;

  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground truncate max-w-[60%]">
          {label || (pct >= 100 ? "Complete!" : "Processing…")}
        </span>
        <div className="flex items-center gap-2">
          {showTimer && active && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatElapsed(elapsed)}
            </span>
          )}
          {isLive ? (
            <span
              className="flex items-center gap-1 text-[10px] font-medium text-primary"
              title={`Backend reports ${Math.round(realProgress!)}% — bar reflects live job-status progress`}
              aria-label="Live backend progress"
            >
              <Activity className="h-3 w-3 animate-pulse" />
              live
            </span>
          ) : active ? (
            <span
              className="text-[10px] font-medium text-amber-400/90"
              title="Backend has not reported progress yet — bar stays at 0 until the provider sends a real update"
              aria-label="Waiting for backend progress"
            >
              waiting
            </span>
          ) : null}
          <span className="text-xs font-semibold text-foreground">{pct}%</span>
        </div>
      </div>
      <div className={`${barHeight} w-full rounded-full bg-muted overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct >= 100
              ? "bg-success"
              : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
