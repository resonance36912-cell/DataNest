import { Square, CheckSquare, Video, Film, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import JobEstimateBadge from "@/components/JobEstimateBadge";
import { VIDEO_PROVIDER_OPTIONS } from "@/lib/providers";
import type { Scene } from "@/contexts/ProjectContext";

interface BatchActionControlsProps {
  scenes: Scene[];
  selectedForGeneration: Set<number>;
  selectAllForGeneration: () => void;
  deselectAllForGeneration: () => void;
  globalProvider: string;
  setGlobalProvider: (s: string) => void;
  referenceSceneIndex: number | null;
  setReferenceSceneIndex: (i: number | null) => void;
  batchGenerating: boolean;
  batchAbort: React.MutableRefObject<boolean>;
  generateSelectedVideos: (sel: Set<number>) => Promise<void>;
  generateAllVideos: () => void;
}

export default function BatchActionControls({
  scenes, selectedForGeneration, selectAllForGeneration, deselectAllForGeneration,
  globalProvider, setGlobalProvider, referenceSceneIndex, setReferenceSceneIndex,
  batchGenerating, batchAbort, generateSelectedVideos, generateAllVideos,
}: BatchActionControlsProps) {
  const hasImages = scenes.some(s => s.imageUrl);
  const localLipSync = globalProvider === "musetalk-local";
  const eligibleCount = scenes.filter(s => !s.generatingVideo && (localLipSync ? !!s.videoUrl : !!s.imageUrl && !s.videoUrl)).length;
  const hasEligibleMedia = localLipSync ? scenes.some(s => s.videoUrl) : hasImages;

  return (
    <>
      {/* Select & Generate Selected Videos */}
      {scenes.length > 0 && hasEligibleMedia && (
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="gap-1.5 border-border text-foreground hover:bg-secondary"
            onClick={selectedForGeneration.size === scenes.filter(s => s.imageUrl).length ? deselectAllForGeneration : selectAllForGeneration}>
            {selectedForGeneration.size === scenes.filter(s => s.imageUrl).length
              ? <><Square className="h-3.5 w-3.5" /> Deselect All</>
              : <><CheckSquare className="h-3.5 w-3.5" /> Select All</>}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={batchGenerating ? () => { batchAbort.current = true; } : () => generateSelectedVideos(selectedForGeneration)}
            disabled={selectedForGeneration.size === 0 && !batchGenerating}
            title={batchGenerating ? "Stop the current batch video generation" : `Generate ${selectedForGeneration.size} selected videos sequentially`}>
            {batchGenerating
              ? <><X className="h-3.5 w-3.5" /> Stop Batch</>
              : <><Video className="h-3.5 w-3.5" /> Generate Selected ({selectedForGeneration.size})</>}
          </Button>
          <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={generateAllVideos}
            disabled={batchGenerating || eligibleCount === 0}
            title={localLipSync ? "Apply local MuseTalk lip sync to all existing scene videos" : "Generate videos for all scenes with images"}>
            <Film className="h-3.5 w-3.5" /> {localLipSync ? "Lip-sync All Videos" : "Generate All Videos"}
            <JobEstimateBadge provider={globalProvider} jobCount={eligibleCount} />
          </Button>
          <Select value={globalProvider} onValueChange={setGlobalProvider}>
            <SelectTrigger className="h-7 text-xs w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VIDEO_PROVIDER_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-1.5"><Video className="h-3 w-3" />{opt.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Reference Scene Selector */}
      {scenes.length > 1 && scenes.some(s => s.videoUrl) && (
        <div className="flex items-center gap-1.5">
          <Select value={referenceSceneIndex != null ? String(referenceSceneIndex) : "none"}
            onValueChange={(v) => setReferenceSceneIndex(v === "none" ? null : Number(v))}>
            <SelectTrigger className="h-8 w-auto min-w-[180px] text-xs border-accent/30">
              <SelectValue placeholder="Reference scene…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No reference (unique per scene)</SelectItem>
              {scenes.map((s, i) => s.videoUrl ? (
                <SelectItem key={i} value={String(i)}>
                  🎬 Scene {s.scene_number} — {s.lyric_segment?.substring(0, 30) || "Instrumental"}…
                </SelectItem>
              ) : null)}
            </SelectContent>
          </Select>
          {referenceSceneIndex != null && (
            <Badge className="bg-accent/10 text-accent border-accent/20 text-xs">
              Using Scene {scenes[referenceSceneIndex]?.scene_number} style
            </Badge>
          )}
        </div>
      )}
    </>
  );
}
