import { Film, Loader2, ImageIcon, CheckCircle, Check, DatabaseZap } from "lucide-react";
import { Scene } from "@/contexts/ProjectContext";

interface AllScenesPanelProps {
  scenes: Scene[];
  activeReviewIndex: number;
  selectedForGeneration: Set<number>;
  recallingScenes?: Set<number>;
  onSelectScene: (idx: number) => void;
  onToggleSelection: (idx: number) => void;
}

export default function AllScenesPanel({
  scenes,
  activeReviewIndex,
  selectedForGeneration,
  recallingScenes,
  onSelectScene,
  onToggleSelection,
}: AllScenesPanelProps) {
  // Per-scene caption derivation.
  //
  // Failure modes we defend against:
  //   1. generate-storylines (or a hollow-scene fallback) stamps the entire
  //      transcript onto every scene's `lyric_segment` — every row would
  //      display the same wall of text.
  //   2. `lyric_segment` is missing/blank for a real lyrical scene (parsing
  //      glitch) — we don't want to show a confusing empty row.
  //   3. Instrumental scene — should be labelled, not blank.
  //
  // Strategy: count duplicates of the *trimmed* lyric across scenes; any
  // string appearing on ≥2 scenes is treated as the bogus full-song lyric
  // and the row falls back through action_description → mood/location →
  // a time-window hint, in that order.
  const lyricCounts = new Map<string, number>();
  scenes.forEach((s) => {
    const k = (s.lyric_segment || "").trim();
    if (k) lyricCounts.set(k, (lyricCounts.get(k) ?? 0) + 1);
  });
  const truncate = (txt: string, max = 120) =>
    txt.length > max ? txt.slice(0, max - 1).trimEnd() + "…" : txt;
  const captionFor = (s: Scene) => {
    const raw = (s.lyric_segment || "").trim();
    const isShared = raw.length > 0 && (lyricCounts.get(raw) ?? 0) > 1;

    if (raw && !isShared) return truncate(raw);

    // Fallbacks (in priority order) when the lyric is missing or shared.
    const action = (s.action_description || "").trim();
    if (action) return truncate(action);

    const moodLocation = [s.mood, s.location].filter(Boolean).join(" · ").trim();
    if (moodLocation) return truncate(moodLocation);

    const window = [s.time_start, s.time_end].filter(Boolean).join("–");
    if (window) return `Scene ${s.scene_number} · ${window} · instrumental`;

    return "Instrumental";
  };


  return (
    <div className="space-y-1.5 max-h-[320px] overflow-y-auto scrollbar-thin pr-1">
      {scenes.map((s, idx) => {

        const isActive = idx === activeReviewIndex;
        const hasVideo = !!s.videoUrl;
        const hasImage = !!s.imageUrl;
        const isGenerating = !!s.generatingVideo;
        const isRecalling = !hasVideo && !isGenerating && !!recallingScenes?.has(s.scene_number);
        const isSelected = selectedForGeneration.has(idx);
        return (
          <div
            key={idx}
            onClick={() => onSelectScene(idx)}
            className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-all ${
              isActive
                ? "bg-primary/10 border border-primary/30"
                : "hover:bg-secondary/50 border border-transparent"
            }`}
          >
            {/* Checkbox */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelection(idx); }}
              className={`shrink-0 flex h-4 w-4 items-center justify-center rounded border transition-all ${
                isSelected
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {isSelected && <Check className="h-2.5 w-2.5" />}
            </button>

            {/* Thumbnail */}
            <div className="w-16 h-9 rounded overflow-hidden bg-secondary shrink-0 relative">
              {hasVideo ? (
                <video src={s.videoUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
              ) : hasImage ? (
                <img src={s.imageUrl} alt={`S${s.scene_number}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              {isGenerating && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 className="h-3 w-3 animate-spin text-white" />
                </div>
              )}
              {isRecalling && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
                  <DatabaseZap className="h-3 w-3 text-primary animate-pulse" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-medium text-foreground">S{s.scene_number}</span>
                {hasVideo && <CheckCircle className="h-3 w-3 text-green-500" />}
                {!hasVideo && hasImage && <ImageIcon className="h-3 w-3 text-amber-500" />}
              </div>
              <p className="text-[9px] text-muted-foreground truncate">{captionFor(s)}</p>
            </div>

            {/* Time */}
            <span className="text-[9px] text-muted-foreground shrink-0">{s.time_start}</span>
          </div>
        );
      })}
    </div>
  );
}
