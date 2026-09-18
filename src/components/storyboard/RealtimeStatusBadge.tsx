import { useState, useEffect } from "react";
import { Wifi, WifiOff, Loader2, RefreshCw, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  status: "connecting" | "connected" | "disconnected" | "paused";
  onReconnect?: () => void;
  onReset?: () => void;
  className?: string;
  attempt?: number;
  nextRetryAt?: number | null;
}

function formatRetryIn(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/**
 * Compact pill showing the live render_jobs realtime channel state.
 * - connected    → live updates flowing
 * - connecting   → handshake / backoff in progress
 * - disconnected → channel dropped; the app has fallen back to polling.
 *                  Shows attempt count, live countdown to next retry,
 *                  and a small Reconnect action so the user can retry now
 *                  without waiting for the exponential-backoff timer.
 * - paused       → terminal state after max retries. Auto-reconnect is off
 *                  and the manual Reconnect button is disabled — the user
 *                  must click Reset to acknowledge the outage and re-arm
 *                  the channel.
 */
export default function RealtimeStatusBadge({ status, onReconnect, onReset, className, attempt, nextRetryAt }: Props) {
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const isPaused = status === "paused";
  const isDisconnected = status === "disconnected";

  const [retryLabel, setRetryLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!isDisconnected || !nextRetryAt) {
      setRetryLabel(null);
      return;
    }
    const tick = () => {
      const remaining = nextRetryAt - Date.now();
      if (remaining <= 0) {
        setRetryLabel("retrying now…");
        return;
      }
      setRetryLabel(`retry in ${formatRetryIn(remaining)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isDisconnected, nextRetryAt]);

  const label = isConnected
    ? "Realtime: Connected"
    : isConnecting
      ? "Realtime: Connecting…"
      : isPaused
        ? "Realtime: Updates paused"
        : "Realtime: Disconnected (polling)";
  const title = isConnected
    ? "Live progress updates are streaming from the database."
    : isConnecting
      ? "Establishing realtime connection…"
      : isPaused
        ? "Auto-reconnect gave up after repeated failures. Polling is still active. Click Reset to retry the realtime channel."
        : "Realtime channel dropped — progress is updating via polling. Auto-reconnecting with backoff.";

  return (
    <div
      role="status"
      aria-live="polite"
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
        isConnected && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        isConnecting && "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
        isDisconnected && "border-amber-500/40 bg-amber-500/10 text-amber-300",
        isPaused && "border-red-500/40 bg-red-500/10 text-red-300",
        className,
      )}
    >
      {isConnecting ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isConnected ? (
        <Wifi className="h-3 w-3" />
      ) : isPaused ? (
        <PauseCircle className="h-3 w-3" />
      ) : (
        <WifiOff className="h-3 w-3" />
      )}
      <span>{label}</span>
      {isConnected && (
        <span aria-hidden className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      )}
      {isDisconnected && typeof attempt === "number" && attempt > 0 && (
        <span className="ml-0.5 text-amber-200/80">· attempt {attempt}/8</span>
      )}
      {isDisconnected && retryLabel && (
        <span className="ml-0.5 text-amber-200/80">· {retryLabel}</span>
      )}
      {isPaused && typeof attempt === "number" && attempt > 0 && (
        <span className="ml-0.5 text-red-200/80">· {attempt}/8 attempts exhausted</span>
      )}
      {isDisconnected && onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          className="ml-1 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
          aria-label="Reconnect realtime now"
          title="Retry the realtime connection immediately"
        >
          <RefreshCw className="h-2.5 w-2.5" /> Reconnect
        </button>
      )}
      {isPaused && (
        <>
          <button
            type="button"
            disabled
            aria-disabled="true"
            aria-label="Reconnect realtime now (disabled — channel paused)"
            title="Reconnect is disabled until you reset the channel"
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/5 px-1.5 py-0.5 text-[10px] font-semibold text-red-300/50 cursor-not-allowed"
          >
            <RefreshCw className="h-2.5 w-2.5" /> Reconnect
          </button>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              aria-label="Reset realtime channel"
              title="Reset attempt counter and re-arm the realtime channel"
              className="ml-1 inline-flex items-center gap-1 rounded-full border border-red-500/50 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-200 hover:bg-red-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
            >
              <RefreshCw className="h-2.5 w-2.5" /> Reset
            </button>
          )}
        </>
      )}
    </div>
  );
}
