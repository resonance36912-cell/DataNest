import { Play, Pause, RotateCcw, SkipForward, User, RefreshCw, X, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import ProcessProgressBar from "@/components/ProcessProgressBar";
import RecallGalleryDialog from "@/components/assembly/RecallGalleryDialog";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import type { GalleryImage } from "@/components/assembly/RecallGalleryDialog";

interface AssemblyPlaybackControlsProps {
  orderedScenes: SavedScene[];
  totalDuration: number;
  costEstimate: { label: string } | null;
  playback: {
    isPlayingAll: boolean;
    activeSceneIndex: number | null;
    playbackSceneIdx: number;
    playbackProgress: number;
    continuousPlay: boolean;
    handlePlayAll: () => void;
    handleRestart: () => void;
    handleSkipScene: () => void;
    setContinuousPlay: (b: boolean) => void;
  };
  regen: {
    regenerating: boolean;
    regenProgress: string;
    regenningChar: boolean;
    charRegenProgress: string;
    multiSelectMode: boolean;
    selectedForRegen: Set<number>;
    setMultiSelectMode: (b: boolean) => void;
    setSelectedForRegen: (s: Set<number>) => void;
    handleOpenCharPicker: (idx: number) => void;
    handleOpenBatchCharPicker: () => void;
    regenCharGalleryOpen: boolean;
    setRegenCharGalleryOpen: (b: boolean) => void;
    handleRecallCharacterForRegen: (img: GalleryImage) => void;
    cancelRegen: () => void;
    cancelRegenChar: () => void;
  };
}

export default function AssemblyPlaybackControls({
  orderedScenes, totalDuration, costEstimate, playback, regen,
}: AssemblyPlaybackControlsProps) {
  return (
    <>
      <div className="glass-card p-3 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant={playback.isPlayingAll ? "destructive" : "default"} onClick={playback.handlePlayAll} className="gap-2">
            {playback.isPlayingAll ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playback.isPlayingAll ? "Pause All" : "Play All"}
          </Button>
          <Button size="sm" variant="outline" onClick={playback.handleRestart} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Restart
          </Button>
          <Button
            size="sm"
            variant={playback.continuousPlay ? "default" : "outline"}
            onClick={() => playback.setContinuousPlay(!playback.continuousPlay)}
            className={`gap-2 ${playback.continuousPlay ? "bg-primary text-primary-foreground" : ""}`}
            title="Loop: continuously play through all scenes"
          >
            <Repeat className="h-4 w-4" /> Loop
          </Button>
          {playback.isPlayingAll && (
            <Button size="sm" variant="outline" onClick={playback.handleSkipScene}
              className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
              title={playback.playbackSceneIdx < orderedScenes.length - 1 ? `Skip to Scene ${orderedScenes[playback.playbackSceneIdx + 1]?.sceneNumber ?? playback.playbackSceneIdx + 2}` : "On last scene"}>
              <SkipForward className="h-4 w-4" /> Next Scene
            </Button>
          )}
          {regen.regenerating ? (
            <Button size="sm" variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={regen.cancelRegen}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          ) : (
            <Button size="sm" variant="outline"
              onClick={() => playback.activeSceneIndex !== null && regen.handleOpenCharPicker(playback.activeSceneIndex)}
              disabled={playback.activeSceneIndex === null || playback.isPlayingAll}
              className="gap-2 border-accent/30 text-accent hover:bg-accent/10"
              title="Pick a character and regenerate this scene's video">
              <User className="h-4 w-4" /> Regen Scene
            </Button>
          )}
          {regen.regenningChar ? (
            <Button size="sm" variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={regen.cancelRegenChar}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline"
                disabled={playback.activeSceneIndex === null || playback.isPlayingAll || regen.regenerating || regen.regenningChar}
                className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => regen.setRegenCharGalleryOpen(true)}>
                <User className="h-4 w-4" /> Regen Character
              </Button>
              <RecallGalleryDialog filterType="character" open={regen.regenCharGalleryOpen} onOpenChange={regen.setRegenCharGalleryOpen} onSelect={regen.handleRecallCharacterForRegen} />
            </>
          )}
          <Button size="sm" variant={regen.multiSelectMode ? "default" : "outline"}
            onClick={() => {
              if (regen.multiSelectMode && regen.selectedForRegen.size > 0) regen.handleOpenBatchCharPicker();
              else { regen.setMultiSelectMode(!regen.multiSelectMode); regen.setSelectedForRegen(new Set()); }
            }}
            disabled={playback.isPlayingAll || regen.regenerating}
            className={`gap-2 ${regen.multiSelectMode ? "bg-accent text-accent-foreground" : "border-accent/30 text-accent hover:bg-accent/10"}`}>
            <RefreshCw className="h-4 w-4" />
            {regen.multiSelectMode ? (regen.selectedForRegen.size > 0 ? `Regen ${regen.selectedForRegen.size} Scenes` : "Select scenes…") : "Batch Regen"}
          </Button>
          {regen.multiSelectMode && (
            <Button size="sm" variant="ghost" onClick={() => { regen.setMultiSelectMode(false); regen.setSelectedForRegen(new Set()); }} className="text-xs text-muted-foreground">
              Cancel
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            {playback.isPlayingAll
              ? `Scene ${playback.playbackSceneIdx + 1} of ${orderedScenes.length}`
              : `${totalDuration.toFixed(1)}s total${costEstimate ? ` · ${costEstimate.label}` : ""}`}
          </span>
        </div>
        <Progress value={playback.playbackProgress} className="h-1.5" />
      </div>

      {regen.regenerating && regen.regenProgress && (
        <ProcessProgressBar progress={0} active={regen.regenerating} label={regen.regenProgress} barHeight="h-2" />
      )}
      {regen.regenningChar && (regen.regenProgress || regen.charRegenProgress) && (
        <ProcessProgressBar progress={0} active={regen.regenningChar} label={regen.regenProgress || regen.charRegenProgress} barHeight="h-2" />
      )}
    </>
  );
}
