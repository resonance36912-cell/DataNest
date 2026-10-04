import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Film, GripVertical, Play, Trash2, Check, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import SceneWaveform from "./SceneWaveform";

export interface SavedScene {
  sceneIndex: number;
  sceneNumber: number;
  videoUrl: string;
  imageUrl?: string;
  lyricSegment: string;
  timeStart: string;
  timeEnd: string;
  durationSec: number;
  isApproved?: boolean;
  isDownloaded?: boolean;
}

interface SceneTimelineProps {
  scenes: SavedScene[];
  onReorder: (scenes: SavedScene[]) => void;
  onRemove?: (sceneIndex: number) => void;
  activeIndex: number | null;
  onSelect: (index: number) => void;
  scrubberPosition: number;
  multiSelectMode?: boolean;
  selectedIndices?: Set<number>;
  onToggleSelect?: (index: number) => void;
  onLyricEdit?: (sceneIndex: number, newLyric: string) => void;
  onDownload?: (scene: SavedScene) => void;
  /** Master audio waveform (linear 0-1 bars) + duration for aligned scene waveforms */
  masterWaveform?: { bars: number[]; durationSec: number };
}

function InlineLyricEditor({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <Input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSave(draft.trim()); } if (e.key === "Escape") onCancel(); }}
      onBlur={() => onSave(draft.trim())}
      className="h-5 text-[10px] px-1 py-0 border-primary/40 bg-background"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function SortableSceneItem({ scene, isActive, onSelect, onRemove, onDownload, multiSelectMode, isSelected, onToggleSelect, onLyricEdit, masterSegmentBars }: {
  scene: SavedScene;
  isActive: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  onDownload?: () => void;
  multiSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onLyricEdit?: (newLyric: string) => void;
  masterSegmentBars?: number[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.sceneIndex });
  const [editingLyric, setEditingLyric] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={multiSelectMode ? () => onToggleSelect?.() : onSelect}
      className={`relative flex-shrink-0 w-32 rounded-lg overflow-hidden border-2 cursor-pointer transition-all group ${
        multiSelectMode && isSelected
          ? "border-accent shadow-lg shadow-accent/20 ring-2 ring-accent/40"
          : isActive ? "border-primary shadow-lg shadow-primary/20" : "border-border/40 hover:border-primary/50"
      } ${isDragging ? "ring-2 ring-primary" : ""}`}
    >
      <div className="aspect-video relative">
        {scene.videoUrl ? (
          <video src={scene.videoUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        ) : scene.imageUrl ? (
          <img src={scene.imageUrl} alt={`Scene ${scene.sceneNumber}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-secondary flex items-center justify-center">
            <Film className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        {/* Audio waveform overlay at bottom of thumbnail */}
        {scene.videoUrl && (
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
            <SceneWaveform videoUrl={scene.videoUrl} width={128} height={36} className="w-full" masterBars={masterSegmentBars} />
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="h-5 w-5 text-white" />
        </div>
        {multiSelectMode && (
          <div
            className="absolute top-1 right-1 z-10"
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          >
            <Checkbox
              checked={isSelected}
              className="h-5 w-5 border-2 border-white bg-black/50 data-[state=checked]:bg-accent data-[state=checked]:border-accent"
            />
          </div>
        )}
        {!multiSelectMode && (
          <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onDownload && scene.videoUrl && (
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(); }}
                className="h-5 w-5 rounded bg-primary/80 hover:bg-primary flex items-center justify-center"
                title="Download video"
              >
                <Download className="h-3 w-3 text-primary-foreground" />
              </button>
            )}
            {onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="h-5 w-5 rounded bg-destructive/80 hover:bg-destructive flex items-center justify-center"
                title="Remove from timeline"
              >
                <Trash2 className="h-3 w-3 text-destructive-foreground" />
              </button>
            )}
          </div>
        )}
        <div className="absolute top-1 left-1 flex items-center gap-0.5">
          <div
            {...attributes}
            {...listeners}
            className="h-5 w-5 rounded bg-black/50 flex items-center justify-center cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3 text-white" />
          </div>
          <Badge className="bg-black/60 text-white text-[9px] px-1 py-0 border-0">Scene {scene.sceneNumber}</Badge>
          {scene.isApproved && (
            <span className="h-4 w-4 rounded-full bg-green-500/90 flex items-center justify-center" title="Approved">
              <Check className="h-2.5 w-2.5 text-white" />
            </span>
          )}
          {scene.isDownloaded && (
            <span className="h-4 w-4 rounded-full bg-blue-500/90 flex items-center justify-center" title="Downloaded">
              <Download className="h-2.5 w-2.5 text-white" />
            </span>
          )}
        </div>
      </div>
      <div className="px-2 py-1.5 bg-card">
        {editingLyric && onLyricEdit ? (
          <InlineLyricEditor
            value={scene.lyricSegment || ""}
            onSave={(v) => { onLyricEdit(v); setEditingLyric(false); }}
            onCancel={() => setEditingLyric(false)}
          />
        ) : (
          <p
            className="text-[10px] text-muted-foreground truncate hover:text-foreground transition-colors"
            onDoubleClick={(e) => { if (onLyricEdit) { e.stopPropagation(); setEditingLyric(true); } }}
            title={onLyricEdit ? "Double-click to edit lyrics" : undefined}
          >
            {scene.lyricSegment || `Scene ${scene.sceneNumber}`}
          </p>
        )}
        <p className="text-[9px] text-muted-foreground/60">{scene.durationSec.toFixed(1)}s</p>
      </div>
    </div>
  );
}

export default function SceneTimeline({ scenes, onReorder, onRemove, activeIndex, onSelect, scrubberPosition, multiSelectMode, selectedIndices, onToggleSelect, onLyricEdit, onDownload, masterWaveform }: SceneTimelineProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const totalDuration = useMemo(() => scenes.reduce((sum, s) => sum + s.durationSec, 0), [scenes]);

  // Compute per-scene waveform slices from master audio
  const sceneSegmentBars = useMemo(() => {
    if (!masterWaveform || masterWaveform.bars.length === 0 || masterWaveform.durationSec <= 0) return null;
    const { bars, durationSec } = masterWaveform;
    const barCount = bars.length;
    const result: number[][] = [];
    let cumTime = 0;
    for (const scene of scenes) {
      const startBar = Math.floor((cumTime / durationSec) * barCount);
      const endBar = Math.floor(((cumTime + scene.durationSec) / durationSec) * barCount);
      const slice = bars.slice(startBar, Math.max(endBar, startBar + 1));
      // Resample to ~40 bars for the thumbnail
      const targetBars = 40;
      if (slice.length <= targetBars) {
        result.push(slice);
      } else {
        const resampled: number[] = [];
        for (let i = 0; i < targetBars; i++) {
          const srcStart = Math.floor((i / targetBars) * slice.length);
          const srcEnd = Math.floor(((i + 1) / targetBars) * slice.length);
          let max = 0;
          for (let j = srcStart; j < srcEnd; j++) max = Math.max(max, slice[j]);
          resampled.push(max);
        }
        result.push(resampled);
      }
      cumTime += scene.durationSec;
    }
    return result;
  }, [masterWaveform, scenes]);
  const stripRef = useRef<HTMLDivElement>(null);

  // Snap guide state during drag
  const [snapGuide, setSnapGuide] = useState<{ leftPx: number; color: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Compute cumulative edge positions (px) for snap targets
  const edgePositions = useMemo(() => {
    if (!stripRef.current || scenes.length === 0) return [];
    const containerW = stripRef.current.scrollWidth;
    const edges: number[] = [0]; // left edge
    let cumDur = 0;
    for (const s of scenes) {
      cumDur += s.durationSec;
      edges.push((cumDur / Math.max(totalDuration, 0.1)) * containerW);
    }
    return edges;
  }, [scenes, totalDuration]);

  const SNAP_THRESHOLD_PX = 12;

  const findNearestEdge = useCallback((pointerX: number): { leftPx: number } | null => {
    if (edgePositions.length === 0) return null;
    let bestDist = Infinity;
    let bestPx = 0;
    for (const edge of edgePositions) {
      const dist = Math.abs(pointerX - edge);
      if (dist < bestDist) {
        bestDist = dist;
        bestPx = edge;
      }
    }
    return bestDist <= SNAP_THRESHOLD_PX ? { leftPx: bestPx } : null;
  }, [edgePositions]);

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    setIsDragging(true);
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (!stripRef.current) return;
    const rect = stripRef.current.getBoundingClientRect();
    // Use the pointer position relative to the strip
    const pointerX = (event.activatorEvent as PointerEvent).clientX + (event.delta?.x || 0) - rect.left + stripRef.current.scrollLeft;
    const snap = findNearestEdge(pointerX);
    if (snap) {
      setSnapGuide({ leftPx: snap.leftPx, color: "hsl(var(--primary))" });
    } else {
      setSnapGuide(null);
    }
  }, [findNearestEdge]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setSnapGuide(null);
    setIsDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = scenes.findIndex((s) => s.sceneIndex === active.id);
    const newIndex = scenes.findIndex((s) => s.sceneIndex === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(arrayMove(scenes, oldIndex, newIndex));
    }
  }, [scenes, onReorder]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Timeline</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {scrubberPosition > 0
            ? `${scrubberPosition.toFixed(1)}s / ${totalDuration.toFixed(1)}s`
            : `${scenes.length} scenes · ${totalDuration.toFixed(1)}s total`}
        </span>
      </div>

      {/* Scrubber bar */}
      <div className="relative h-1 bg-secondary rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-primary transition-all"
          style={{ width: `${Math.min(100, (scrubberPosition / Math.max(totalDuration, 1)) * 100)}%` }}
        />
      </div>

      {/* Draggable scene strip */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={scenes.map((s) => s.sceneIndex)} strategy={horizontalListSortingStrategy}>
          <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin relative">
            {scenes.map((scene, idx) => (
              <SortableSceneItem
                key={scene.sceneIndex}
                scene={scene}
                isActive={activeIndex === idx}
                onSelect={() => onSelect(idx)}
                onRemove={onRemove ? () => onRemove(scene.sceneIndex) : undefined}
                onDownload={onDownload ? () => onDownload(scene) : undefined}
                multiSelectMode={multiSelectMode}
                isSelected={selectedIndices?.has(idx)}
                onToggleSelect={() => onToggleSelect?.(idx)}
                onLyricEdit={onLyricEdit ? (newLyric) => onLyricEdit(scene.sceneIndex, newLyric) : undefined}
                masterSegmentBars={sceneSegmentBars?.[idx]}
              />
            ))}

            {/* Snap guide line */}
            {isDragging && snapGuide && (
              <div
                className="absolute top-0 bottom-2 w-px z-30 pointer-events-none"
                style={{
                  left: `${snapGuide.leftPx}px`,
                  backgroundColor: snapGuide.color,
                  boxShadow: `0 0 6px ${snapGuide.color}, 0 0 12px ${snapGuide.color}40`,
                }}
              >
                <svg className="absolute -top-1 -translate-x-1/2" style={{ left: "50%" }} width="8" height="8" viewBox="0 0 8 8">
                  <path d="M4 0L8 4L4 8L0 4Z" fill={snapGuide.color} />
                </svg>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
