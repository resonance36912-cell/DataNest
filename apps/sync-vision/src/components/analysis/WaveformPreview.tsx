import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WaveformPeakData } from "@/lib/waveform-peaks";

interface WaveformPreviewProps {
  peakData: WaveformPeakData;
  /** Number of bars to render (downsampled from energy_profile) */
  barCount?: number;
  height?: number;
  /** Optional proposed segment boundaries (seconds) to overlay as vertical lines. */
  boundaries?: number[];
  /** When provided, boundaries become draggable. Receives the new seconds value. */
  onBoundaryChange?: (index: number, newSec: number) => void;
  /** Optional indices of boundaries that were manually edited (rendered in primary). */
  editedIndices?: Set<number>;
  /** Timestamps (sec) that dragged boundaries magnetize to. Hold Alt to bypass. */
  snapTargets?: number[];
  /** Maximum distance in seconds for magnet snap. Default 0.18s. */
  snapToleranceSec?: number;
  /** Number of word anchors available for snapping. */
  wordAnchorCount?: number;
  /** Number of silence anchors available for snapping. */
  silenceAnchorCount?: number;
  /** Timestamp (sec) the user picked from the anchor list — drawn as a highlighted cursor. */
  focusedAnchorSec?: number | null;
  /** Segment start markers to overlay on the waveform — clickable chips. */
  segmentMarkers?: { index: number; start_sec: number; end_sec?: number; label?: string; colorClass?: string; tag?: string }[];
  /** Index of the currently selected segment (matches segmentMarkers[i].index). */
  selectedSegmentIndex?: number | null;
  /** Click handler for a segment marker — receives the segment index and its start time. */
  onSegmentMarkerClick?: (index: number, startSec: number) => void;
}

export default function WaveformPreview({
  peakData,
  barCount = 200,
  height = 96,
  boundaries,
  onBoundaryChange,
  editedIndices,
  snapTargets,
  snapToleranceSec = 0.18,
  wordAnchorCount,
  silenceAnchorCount,
  focusedAnchorSec,
  segmentMarkers,
  selectedSegmentIndex = null,
  onSegmentMarkerClick,
}: WaveformPreviewProps) {
  const { bars, peakMarkers, silenceRanges } = useMemo(() => {
    const ep = peakData.energy_profile;
    if (!ep.length) return { bars: [], peakMarkers: [], silenceRanges: [] };

    // Downsample energy profile into barCount buckets
    const step = ep.length / barCount;
    const bars: { value: number; index: number }[] = [];
    for (let i = 0; i < barCount; i++) {
      const start = Math.floor(i * step);
      const end = Math.min(Math.floor((i + 1) * step), ep.length);
      let max = 0;
      for (let j = start; j < end; j++) {
        if (ep[j] > max) max = ep[j];
      }
      bars.push({ value: max, index: i });
    }

    // Map peaks to bar positions
    const totalSamples = ep.length;
    const peakMarkers = peakData.peaks.map((p) => {
      const sampleIdx = p.time_sec / peakData.energy_interval_sec;
      return Math.round((sampleIdx / totalSamples) * barCount);
    });

    // Map silence gaps to bar ranges
    const silenceRanges = peakData.silence_gaps.map((g) => {
      const startIdx = g.start_sec / peakData.energy_interval_sec;
      const endIdx = g.end_sec / peakData.energy_interval_sec;
      return {
        startBar: Math.round((startIdx / totalSamples) * barCount),
        endBar: Math.round((endIdx / totalSamples) * barCount),
      };
    });

    return { bars, peakMarkers, silenceRanges };
  }, [peakData, barCount]);

  const barWidth = 100 / barCount;
  const peakSet = new Set(peakMarkers);

  // Format time for labels
  const fmt = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

  // Generate time labels every ~15s
  const duration = peakData.duration_sec;
  const labelInterval = duration > 120 ? 30 : 15;
  const timeLabels: { sec: number; pct: number }[] = [];
  for (let t = 0; t <= duration; t += labelInterval) {
    timeLabels.push({ sec: t, pct: (t / duration) * 100 });
  }

  const chartRef = useRef<HTMLDivElement | null>(null);
  const interactive = typeof onBoundaryChange === "function" && peakData.duration_sec > 0;

  // Track the chart's rendered pixel width so we can de-clutter dense marker labels.
  const [chartWidthPx, setChartWidthPx] = useState(0);
  useEffect(() => {
    const el = chartRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setChartWidthPx(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);


  // Pre-sort snap targets once for nearest-neighbor search during drag.
  const sortedSnapTargets = useMemo(() => {
    if (!snapTargets || !snapTargets.length) return [] as number[];
    return [...snapTargets]
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= peakData.duration_sec)
      .sort((a, b) => a - b);
  }, [snapTargets, peakData.duration_sec]);

  const snapValue = useCallback((sec: number): number => {
    if (!sortedSnapTargets.length) return sec;
    let lo = 0, hi = sortedSnapTargets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedSnapTargets[mid] < sec) lo = mid + 1; else hi = mid;
    }
    const cands = [sortedSnapTargets[lo], sortedSnapTargets[Math.max(0, lo - 1)]];
    let best = sec, bestD = snapToleranceSec;
    for (const c of cands) {
      const d = Math.abs(c - sec);
      if (d <= bestD) { best = c; bestD = d; }
    }
    return best;
  }, [sortedSnapTargets, snapToleranceSec]);

  const handlePointerDown = useCallback((idx: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !chartRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const rect = chartRef.current!.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      const raw = pct * peakData.duration_sec;
      // Alt (Option on macOS) bypasses magnet snap for free placement.
      const next = ev.altKey ? raw : snapValue(raw);
      onBoundaryChange!(idx, next);
    };
    const up = (ev: PointerEvent) => {
      try { el.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [interactive, onBoundaryChange, peakData.duration_sec, snapValue]);

  if (!bars.length) return null;

  return (
    <div className="glass-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          Audio Energy Profile{interactive ? <span className="text-[10px] font-normal text-muted-foreground">· drag handles to adjust</span> : null}
        </h4>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" /> Peak
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-accent/30" /> Silence
          </span>
          {sortedSnapTargets.length > 0 && (
            <span className="flex items-center gap-1" title="Hold Alt while dragging to bypass snap">
              <span className="inline-block w-2 h-2 rounded-full bg-foreground/40" />
              {typeof wordAnchorCount === 'number' && typeof silenceAnchorCount === 'number' && silenceAnchorCount > 0
                ? `Snap (${wordAnchorCount} words + ${silenceAnchorCount} silence)`
                : `Snap (${sortedSnapTargets.length})`}
            </span>
          )}
        </div>
      </div>

      {/* Waveform chart */}
      <div ref={chartRef} className="relative select-none" style={{ height }}>
        {/* Silence gap overlays */}
        {silenceRanges.map((s, i) => (
          <div
            key={`silence-${i}`}
            className="absolute top-0 bottom-0 bg-accent/15 border-x border-accent/25 pointer-events-none z-0"
            style={{
              left: `${s.startBar * barWidth}%`,
              width: `${Math.max((s.endBar - s.startBar) * barWidth, 0.3)}%`,
            }}
          />
        ))}

        {/* Energy bars */}
        <svg
          viewBox={`0 0 ${barCount} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full relative z-10 pointer-events-none"
        >
          {bars.map((bar) => {
            const isPeak = peakSet.has(bar.index);
            const barH = Math.max(bar.value * height * 0.9, 1);
            const y = height - barH;

            // Color by intensity
            let fill: string;
            if (isPeak) {
              fill = "hsl(var(--primary))";
            } else if (bar.value < 0.15) {
              fill = "hsl(var(--muted-foreground) / 0.25)";
            } else if (bar.value < 0.5) {
              fill = "hsl(var(--muted-foreground) / 0.45)";
            } else {
              fill = "hsl(var(--muted-foreground) / 0.65)";
            }

            return (
              <rect
                key={bar.index}
                x={bar.index}
                y={y}
                width={0.7}
                height={barH}
                rx={0.2}
                fill={fill}
              />
            );
          })}

          {/* Peak markers — small diamonds at the top */}
          {peakMarkers.map((barIdx, i) => (
            <circle
              key={`peak-${i}`}
              cx={barIdx + 0.35}
              cy={4}
              r={1.5}
              fill="hsl(var(--primary))"
              opacity={0.8}
            />
          ))}

          {/* Snap-target ticks (word/silence anchors) — subtle marks at top & bottom */}
          {interactive && peakData.duration_sec > 0 && sortedSnapTargets.map((sec, i) => {
            const x = (sec / peakData.duration_sec) * barCount;
            return (
              <g key={`snap-${i}`} opacity={0.55}>
                <line x1={x} y1={0} x2={x} y2={2.5}
                  stroke="hsl(var(--foreground))" strokeWidth={0.25} />
                <line x1={x} y1={height - 2.5} x2={x} y2={height}
                  stroke="hsl(var(--foreground))" strokeWidth={0.25} />
              </g>
            );
          })}

          {/* Focused-anchor cursor (user clicked a row in the anchor list) */}
          {typeof focusedAnchorSec === "number" && peakData.duration_sec > 0 && (() => {
            const x = (focusedAnchorSec / peakData.duration_sec) * barCount;
            return (
              <g>
                <line x1={x} y1={0} x2={x} y2={height}
                  stroke="hsl(var(--primary))" strokeWidth={0.6} opacity={0.95} />
                <circle cx={x} cy={height / 2} r={1.6} fill="hsl(var(--primary))" />
              </g>
            );
          })()}

          {/* Proposed segment boundary lines (visual only — handles are HTML below) */}
          {boundaries && peakData.duration_sec > 0 && boundaries.map((sec, i) => {
            const x = (sec / peakData.duration_sec) * barCount;
            const edited = editedIndices?.has(i);
            const color = edited ? "hsl(var(--primary))" : "hsl(var(--accent))";
            return (
              <g key={`bnd-${i}`}>
                <line x1={x} y1={0} x2={x} y2={height}
                  stroke={color} strokeWidth={edited ? 0.5 : 0.35} strokeDasharray="1.5 1" opacity={0.9} />
              </g>
            );
          })}
        </svg>

        {/* Draggable boundary handles (HTML overlay for crisp pointer hit areas) */}
        {boundaries && peakData.duration_sec > 0 && boundaries.map((sec, i) => {
          const pct = (sec / peakData.duration_sec) * 100;
          const edited = editedIndices?.has(i);
          const color = edited ? "bg-primary border-primary" : "bg-accent border-accent";
          return (
            <div
              key={`handle-${i}`}
              role={interactive ? "slider" : undefined}
              aria-label={interactive ? `Boundary ${i + 1}` : undefined}
              aria-valuenow={interactive ? Math.round(sec) : undefined}
              tabIndex={interactive ? 0 : -1}
              onPointerDown={interactive ? handlePointerDown(i) : undefined}
              onKeyDown={interactive ? (e) => {
                if (e.key === "ArrowLeft") { e.preventDefault(); onBoundaryChange!(i, Math.max(0, sec - (e.shiftKey ? 1 : 0.1))); }
                if (e.key === "ArrowRight") { e.preventDefault(); onBoundaryChange!(i, Math.min(peakData.duration_sec, sec + (e.shiftKey ? 1 : 0.1))); }
              } : undefined}
              className={`absolute top-0 bottom-0 z-20 -translate-x-1/2 ${interactive ? "cursor-ew-resize" : "pointer-events-none"} group`}
              style={{ left: `${pct}%`, width: interactive ? 14 : 2 }}
            >
              {/* Center grab bar */}
              <div className={`absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[2px] ${edited ? "bg-primary/70" : "bg-accent/70"} group-hover:bg-primary group-focus:bg-primary transition-colors`} />
              {/* Top + bottom knobs */}
              {interactive && (
                <>
                  <div className={`absolute left-1/2 -translate-x-1/2 -top-1 w-3 h-3 rounded-sm border ${color} shadow-md group-hover:scale-110 transition-transform`} />
                  <div className={`absolute left-1/2 -translate-x-1/2 -bottom-1 w-3 h-3 rounded-sm border ${color} shadow-md group-hover:scale-110 transition-transform`} />
                </>
              )}
            </div>
          );
        })}

        {/* Segment start markers — clickable chips with vertical guide line.
            - Chip size scales with chart height so it stays legible at any zoom.
            - Labels are hidden when neighboring chips would overlap in pixel space;
              the tick + click target remain so density never blocks interaction. */}
        {segmentMarkers && peakData.duration_sec > 0 && (() => {
          // Scale chip with height (chart height drives the visual scale).
          const chipH = Math.max(12, Math.min(20, Math.round(height * 0.16)));
          const chipFont = Math.max(8, Math.min(11, Math.round(chipH * 0.62)));
          const chipMinW = chipH; // square-ish baseline
          const hitW = Math.max(14, chipH + 2);
          // Compute pixel x for each valid marker so we can decide label visibility.
          const valid = segmentMarkers
            .filter((m) => Number.isFinite(m.start_sec) && m.start_sec >= 0 && m.start_sec <= peakData.duration_sec)
            .map((m) => ({
              ...m,
              pct: (m.start_sec / peakData.duration_sec) * 100,
              px: chartWidthPx > 0 ? (m.start_sec / peakData.duration_sec) * chartWidthPx : 0,
            }))
            .sort((a, b) => a.px - b.px);
          // Greedy label visibility: keep label if it's at least chipMinW+4px from the last shown label,
          // OR if this marker is currently selected (always show the active chip).
          let lastShownPx = -Infinity;
          const showLabel = new Map<number, boolean>();
          for (const m of valid) {
            const isSel = selectedSegmentIndex === m.index;
            const fits = chartWidthPx === 0 || m.px - lastShownPx >= chipMinW + 4;
            const show = fits || isSel;
            showLabel.set(m.index, show);
            if (show) lastShownPx = m.px;
          }
          return (
            <>
              {/* Subtle segment-span bracket lines at the very bottom of the chart */}
              {valid.map((m) => {
                if (typeof m.end_sec !== "number" || m.end_sec <= m.start_sec) return null;
                const endPct = (m.end_sec / peakData.duration_sec) * 100;
                const startPct = m.pct;
                const widthPct = endPct - startPct;
                const isSelected = selectedSegmentIndex === m.index;
                return (
                  <span
                    key={`bracket-${m.index}`}
                    className={`absolute bottom-0 h-[2px] ${m.colorClass ?? "bg-primary"} ${isSelected ? "opacity-40" : "opacity-20"} pointer-events-none z-0`}
                    style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                  />
                );
              })}
              {valid.map((m) => {
                const isSelected = selectedSegmentIndex === m.index;
                const colorCls = m.colorClass ?? "bg-primary";
                const label = m.label ?? String(m.index + 1);
                const labelVisible = showLabel.get(m.index) ?? true;
                const timeLabel = fmt(m.start_sec);
                const durationSec = typeof m.end_sec === "number" ? m.end_sec - m.start_sec : null;
                return (
                  <button
                    type="button"
                    key={`seg-marker-${m.index}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSegmentMarkerClick?.(m.index, m.start_sec);
                    }}
                    aria-label={`Select clip ${label} at ${timeLabel}`}
                    aria-pressed={isSelected}
                    title={`Clip ${label} · ${timeLabel}`}
                    className="absolute top-0 bottom-0 z-30 -translate-x-1/2 cursor-pointer group focus:outline-none"
                    style={{ left: `${m.pct}%`, width: hitW }}
                  >
                    {/* Vertical guide line through the waveform */}
                    <span
                      className={`absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[1.5px] ${colorCls} ${isSelected ? "opacity-100" : "opacity-60 group-hover:opacity-100"} transition-opacity`}
                    />
                    {/* Numbered chip at the top — chip size scales with chart height,
                        label hides when chips would overlap (tick stays clickable). */}
                    <span
                      className={`absolute left-1/2 -translate-x-1/2 rounded-sm text-center font-semibold text-background ${colorCls} ${isSelected ? "ring-2 ring-foreground/80 scale-110 opacity-100 z-10" : "opacity-90 group-hover:opacity-100 group-hover:scale-105"} transition-all shadow`}
                      style={{
                        top: -Math.round(chipH / 2),
                        height: chipH,
                        minWidth: chipMinW,
                        paddingInline: 4,
                        lineHeight: `${chipH}px`,
                        fontSize: chipFont,
                        // Hide the label visually but keep the box for the selected one;
                        // unselected dense chips collapse to a tick dot so neighbors stay readable.
                        width: labelVisible ? undefined : 4,
                        color: labelVisible ? undefined : "transparent",
                      }}
                    >
                      {label}
                    </span>

                    {/* Subtle duration label — appears to the right of the chip, very low opacity.
                        Clicking it seeks to the segment start just like the main marker. */}
                    {durationSec != null && labelVisible && (
                      <span
                        className="absolute left-1/2 top-0 ml-1 text-[8px] text-muted-foreground/50 whitespace-nowrap select-none cursor-pointer"
                        style={{ marginTop: -Math.round(chipH / 2) + 2 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSegmentMarkerClick?.(m.index, m.start_sec);
                        }}
                      >
                        +{durationSec.toFixed(1)}s
                      </span>
                    )}

                    {/* Hover / long-press tooltip — segment index, start time, end time, duration, tag */}
                    <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:flex group-active:flex flex-col items-center z-50">
                      <span className="glass px-2 py-1 rounded-md text-[10px] leading-tight text-foreground whitespace-nowrap shadow-lg border border-border/40">
                        <span className="font-semibold">Clip {label}</span>
                        <span className="mx-1 text-muted-foreground">·</span>
                        <span>{timeLabel}</span>
                        {typeof m.end_sec === "number" && (
                          <>
                            <span className="mx-1 text-muted-foreground">→</span>
                            <span>{fmt(m.end_sec)}</span>
                            <span className="mx-1 text-muted-foreground">·</span>
                            <span className="text-muted-foreground">{durationSec!.toFixed(1)}s</span>
                          </>
                        )}
                        {m.tag ? (
                          <>
                            <span className="mx-1 text-muted-foreground">·</span>
                            <span className="text-primary">{m.tag}</span>
                          </>
                        ) : null}
                      </span>
                      {/* Little arrow */}
                      <span className="w-1.5 h-1.5 bg-background/80 border-r border-b border-border/40 rotate-45 -mt-1.5" />
                    </span>
                  </button>
                );
              })}
            </>
          );
        })()}
      </div>

      {/* Time axis */}
      <div className="relative h-4">
        {timeLabels.map((tl) => (
          <span
            key={tl.sec}
            className="absolute text-[9px] text-muted-foreground -translate-x-1/2"
            style={{ left: `${tl.pct}%` }}
          >
            {fmt(tl.sec)}
          </span>
        ))}
      </div>

      {/* Anchor density strip */}
      {sortedSnapTargets.length > 0 && (
        <div className="relative h-3 select-none" title="Anchor density">
          <svg viewBox={`0 0 ${barCount} 6`} preserveAspectRatio="none" className="w-full h-full">
            {/* Background track */}
            <rect x={0} y={2.5} width={barCount} height={1} rx={0.5} fill="hsl(var(--muted-foreground) / 0.15)" />
            {/* Anchor ticks — one per snap target, height varies by local density */}
            {sortedSnapTargets.map((sec, i) => {
              const x = (sec / duration) * barCount;
              // Measure local density: count targets within ±0.5s
              const localCount = sortedSnapTargets.filter(t => Math.abs(t - sec) <= 0.5).length;
              const h = Math.min(6, Math.max(2, localCount * 0.8));
              const y = (6 - h) / 2;
              return (
                <rect
                  key={`density-${i}`}
                  x={x - 0.3}
                  y={y}
                  width={0.6}
                  height={h}
                  rx={0.2}
                  fill="hsl(var(--primary) / 0.55)"
                />
              );
            })}
          </svg>
        </div>
      )}

      {/* Stats line */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>{fmt(duration)} total</span>
        <span>{peakData.peaks.length} peaks</span>
        <span>{peakData.silence_gaps.length} silence gaps</span>
        <span>{peakData.energy_profile.length} samples @ {(peakData.energy_interval_sec * 1000).toFixed(0)}ms</span>
        {typeof wordAnchorCount === 'number' && (
          <span className="text-primary/70">{wordAnchorCount} word anchors</span>
        )}
        {typeof silenceAnchorCount === 'number' && silenceAnchorCount > 0 && (
          <span className="text-accent/70">{silenceAnchorCount} silence anchors</span>
        )}
      </div>
    </div>
  );
}
