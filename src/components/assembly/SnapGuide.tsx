/**
 * SnapGuide — Visual snap guide line shown when a clip snaps to an edge.
 */

import { type SnapResult } from "@/lib/timeline-engine";

interface SnapGuideProps {
  snapResult: SnapResult | null;
  timelineDuration: number;
  containerWidth: number;
}

export default function SnapGuide({ snapResult, timelineDuration, containerWidth }: SnapGuideProps) {
  if (!snapResult?.snapType || timelineDuration <= 0) return null;

  const leftPx = (snapResult.snappedTime / timelineDuration) * containerWidth;

  const colorMap: Record<string, string> = {
    "clip-start": "hsl(var(--primary))",
    "clip-end": "hsl(var(--primary))",
    "playhead": "hsl(var(--accent))",
    "marker": "#f59e0b",
    "boundary": "hsl(var(--muted-foreground))",
  };

  const color = colorMap[snapResult.snapType] || "hsl(var(--primary))";

  return (
    <div
      className="absolute top-0 bottom-0 w-px z-20 pointer-events-none"
      style={{
        left: `${leftPx}px`,
        backgroundColor: color,
        boxShadow: `0 0 4px ${color}, 0 0 8px ${color}40`,
      }}
    >
      {/* Diamond indicator at top */}
      <div
        className="absolute -top-1 -translate-x-1/2"
        style={{ left: "50%" }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8">
          <path d="M4 0L8 4L4 8L0 4Z" fill={color} />
        </svg>
      </div>
    </div>
  );
}
