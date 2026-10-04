/**
 * MarkerSystem — Timeline markers for alignment, sync, and review.
 * Renders marker indicators on the timeline and provides a marker list panel.
 */

import { useState } from "react";
import { Flag, Plus, Trash2, Edit3, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatTimecode, type TimelineMarker } from "@/lib/timeline-engine";

interface MarkerListProps {
  markers: TimelineMarker[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TimelineMarker>) => void;
  onSeek: (timeSec: number) => void;
}

const MARKER_COLORS = [
  "#f59e0b", // amber
  "#ef4444", // red
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

export function MarkerList({ markers, onAdd, onDelete, onUpdate, onSeek }: MarkerListProps) {
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = [...markers].sort((a, b) => a.timeSec - b.timeSec);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary transition-colors"
        >
          <Flag className="h-3.5 w-3.5" />
          Markers ({markers.length})
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <Button size="sm" variant="ghost" onClick={onAdd} className="h-6 px-2 gap-1 text-[10px]">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>

      {expanded && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-2 text-center">
              No markers. Press <kbd className="px-1 py-0.5 bg-secondary rounded text-[9px]">M</kbd> to add.
            </p>
          ) : (
            sorted.map(marker => (
              <div
                key={marker.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-secondary/50 cursor-pointer group transition-colors"
                onClick={() => onSeek(marker.timeSec)}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0 border border-background shadow-sm"
                  style={{ backgroundColor: marker.color }}
                />
                {editingId === marker.id ? (
                  <Input
                    autoFocus
                    defaultValue={marker.title}
                    className="h-5 text-[10px] px-1 py-0 flex-1"
                    onBlur={(e) => {
                      onUpdate(marker.id, { title: e.target.value.trim() || marker.title });
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onUpdate(marker.id, { title: (e.target as HTMLInputElement).value.trim() || marker.title });
                        setEditingId(null);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-[10px] truncate flex-1">{marker.title}</span>
                )}
                <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
                  {formatTimecode(marker.timeSec)}
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded hover:bg-secondary transition-all"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="w-2 h-2 rounded-full border-2" style={{ borderColor: marker.color }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" side="right">
                    <div className="flex gap-1">
                      {MARKER_COLORS.map(color => (
                        <button
                          key={color}
                          className="w-5 h-5 rounded-full border-2 border-transparent hover:border-foreground/50 transition-colors"
                          style={{ backgroundColor: color }}
                          onClick={() => onUpdate(marker.id, { color })}
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <button
                  className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded hover:bg-secondary transition-all"
                  onClick={(e) => { e.stopPropagation(); setEditingId(marker.id); }}
                >
                  <Edit3 className="h-2.5 w-2.5 text-muted-foreground" />
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded hover:bg-destructive/20 transition-all"
                  onClick={(e) => { e.stopPropagation(); onDelete(marker.id); }}
                >
                  <Trash2 className="h-2.5 w-2.5 text-destructive" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Render markers on a timeline ruler — inline SVG overlay */
export function MarkerRulerOverlay({
  markers,
  timelineDuration,
  onSeek,
}: {
  markers: TimelineMarker[];
  timelineDuration: number;
  onSeek: (timeSec: number) => void;
}) {
  if (markers.length === 0 || timelineDuration <= 0) return null;

  return (
    <div className="absolute top-0 left-0 right-0 h-4 pointer-events-none z-10">
      {markers.map(marker => {
        const leftPct = (marker.timeSec / timelineDuration) * 100;
        return (
          <button
            key={marker.id}
            className="absolute pointer-events-auto cursor-pointer group"
            style={{ left: `${leftPct}%`, transform: "translateX(-50%)" }}
            onClick={(e) => { e.stopPropagation(); onSeek(marker.timeSec); }}
            title={`${marker.title} (${formatTimecode(marker.timeSec)})`}
          >
            <svg width="10" height="14" viewBox="0 0 10 14" className="drop-shadow-sm">
              <path
                d="M5 0L10 5L5 14L0 5Z"
                fill={marker.color}
                stroke="hsl(var(--background))"
                strokeWidth="0.5"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
