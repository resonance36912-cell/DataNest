/**
 * StoryboardToolbar — Top toolbar for the Storyboard step.
 * Contains scene selector, lock toggle, image/video generation controls,
 * cache clear dialogs, theme/location selectors, batch progress, and image gen progress.
 */

import { RefreshCw, ImageIcon, X, Lock, Unlock, Loader2, UserCheck, Music } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProcessProgressBar from "@/components/ProcessProgressBar";
import ThemePicker from "@/components/storyboard/ThemePicker";
import StoryboardStylePresets from "@/components/storyboard/StoryboardStylePresets";

import LocationPicker from "@/components/storyboard/LocationPicker";
import CacheClearDialogs from "@/components/storyboard/CacheClearDialogs";
import BatchActionControls from "@/components/storyboard/BatchActionControls";
import RegenerateScenesPicker from "@/components/storyboard/RegenerateScenesPicker";
import BulkLyricsEditor from "@/components/storyboard/BulkLyricsEditor";
import type { Scene } from "@/contexts/ProjectContext";
import type { VideoJobState } from "@/types/storyboard";

const GENRES = [
  "Auto", "Hip-Hop", "R&B", "Pop", "Rock", "Afrobeats", "Dancehall",
  "Country", "Latin", "Jazz", "Electronic", "Gospel", "Indie",
] as const;

interface StoryboardToolbarProps {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  projectId: string | null;
  userId: string | undefined;
  activeReviewIndex: number;
  setActiveReviewIndex: (i: number) => void;
  sceneApproved: Record<number, boolean>;
  generating: boolean;
  setGenerating: (b: boolean) => void;
  setRegeneratingScene: (n: number | null) => void;
  lockSetting: boolean;
  setLockSetting: (b: boolean) => void;
  sceneTheme: string;
  setSceneTheme: (s: string) => void;
  customTheme: string;
  setCustomTheme: (s: string) => void;
  sceneLocation: string;
  setSceneLocation: (s: string) => void;
  customLocation: string;
  setCustomLocation: (s: string) => void;
  sceneGenre: string;
  setSceneGenre: (s: string) => void;
  selectedForGeneration: Set<number>;
  selectAllForGeneration: () => void;
  deselectAllForGeneration: () => void;
  globalProvider: string;
  setGlobalProvider: (s: string) => void;
  referenceSceneIndex: number | null;
  setReferenceSceneIndex: (i: number | null) => void;
  keepCharacterConsistent: boolean;
  setKeepCharacterConsistent: (b: boolean) => void;
  gen: {
    generatingAllImages: boolean;
    imageGenCancelRef: React.MutableRefObject<boolean>;
    cancelImageGeneration: () => void;
    generateAllImages: () => void;
    batchGenerating: boolean;
    batchAbort: React.MutableRefObject<boolean>;
    batchProgress: { done: number; total: number; startedAt: number } | null;
    generateSelectedVideos: (sel: Set<number>) => Promise<void>;
    generateAllVideos: () => void;
    imageGenProgress: { current: number; total: number } | null;
    pollTimers: React.MutableRefObject<Record<number, unknown>>;
    videoProgressTimers: React.MutableRefObject<Record<number, unknown>>;
    cachedAudioUrl: React.MutableRefObject<string | null>;
    jobIdMap: React.MutableRefObject<Record<number, string>>;
    setVideoJobs: React.Dispatch<React.SetStateAction<Record<number, VideoJobState>>>;
  };
  characterImageStorageUrl: React.MutableRefObject<string | null>;
  setSceneRatings: (r: Record<number, number>) => void;
  setSceneComments: (c: Record<number, string>) => void;
  generateScenes: (onlyIndices?: Set<number>) => void;
  onBulkLyricsSave?: (updates: { sceneIndex: number; lyric_segment: string }[]) => void;
  onResyncLyrics?: () => void;
  resyncing?: boolean;
  hasTranscriptWords?: boolean;
  /** External block (e.g. invalid Track Details) — disables Generate/
   *  Regenerate entry points and surfaces the reason via tooltip. */
  disableGenerate?: boolean;
  disableGenerateReason?: string;
  /** Persisted track visual_style used as the ThemePicker "auto" fallback. */
  visualStyle?: string | null;
}

export default function StoryboardToolbar({
  scenes, setScenes, projectId, userId,
  activeReviewIndex, setActiveReviewIndex, sceneApproved,
  generating, setGenerating, setRegeneratingScene,
  lockSetting, setLockSetting,
  sceneTheme, setSceneTheme, customTheme, setCustomTheme,
  sceneLocation, setSceneLocation, customLocation, setCustomLocation,
  sceneGenre, setSceneGenre,
  selectedForGeneration, selectAllForGeneration, deselectAllForGeneration,
  globalProvider, setGlobalProvider,
  referenceSceneIndex, setReferenceSceneIndex,
  keepCharacterConsistent, setKeepCharacterConsistent,
  gen, characterImageStorageUrl,
  setSceneRatings, setSceneComments,
  generateScenes,

  onBulkLyricsSave,
  onResyncLyrics,
  resyncing = false,
  hasTranscriptWords = false,
  disableGenerate = false,
  disableGenerateReason,
  visualStyle,
}: StoryboardToolbarProps) {
  return (
    <div className="glass-card p-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Storyboard</h2>
            <p className="text-muted-foreground text-sm">
              {scenes.length > 0
                ? "Your scene is ready — generate image and video"
                : "Generate your scene from song analysis and character"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {/* Scene Selector */}
            {scenes.length > 0 && (
              <Select value={String(activeReviewIndex)} onValueChange={(v) => setActiveReviewIndex(Number(v))}>
                <SelectTrigger className="w-[200px] h-8 text-xs bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scenes.map((s, idx) => (
                    <SelectItem key={idx} value={String(idx)} className="text-xs">
                      <span className="flex items-center gap-2">
                        {sceneApproved[idx] ? "✅" : s.videoUrl ? "🎬" : s.imageUrl ? "🖼️" : "⬜"}
                        Scene {idx + 1}
                        <span className="text-muted-foreground truncate max-w-[100px]">
                          {s.lyric_segment ? `— ${s.lyric_segment.slice(0, 30)}…` : ""}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Lock Setting Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={lockSetting ? "default" : "outline"} size="sm" className="gap-1 text-xs h-8" onClick={() => setLockSetting(!lockSetting)}>
                  {lockSetting ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  {lockSetting ? "Locked Setting" : "Varied Settings"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[200px] text-xs">
                  {lockSetting ? "Same location for all scenes — only character performance changes" : "Each scene gets a unique location/setting"}
                </p>
              </TooltipContent>
            </Tooltip>

            {/* Character Consistency Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 border border-border rounded-md px-2 py-1 bg-secondary/30 h-8">
                  <UserCheck className={`h-3.5 w-3.5 ${keepCharacterConsistent ? "text-primary" : "text-muted-foreground"}`} />
                  <Label htmlFor="char-consistent" className="text-xs cursor-pointer whitespace-nowrap">
                    {keepCharacterConsistent ? "Consistent" : "Varied"}
                  </Label>
                  <Switch id="char-consistent" checked={keepCharacterConsistent} onCheckedChange={setKeepCharacterConsistent} className="scale-75" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[220px] text-xs">
                  {keepCharacterConsistent
                    ? "Same character, face & attire in every scene. Use per-scene attire override for variations."
                    : "Character may vary between scenes. Toggle on to enforce consistency."}
                </p>
              </TooltipContent>
            </Tooltip>

            {/* Generate / Cancel Images */}
            {scenes.length > 0 && (() => {
              const missingImages = scenes.filter(s => !s.imageUrl).length;
              const hasAllImages = missingImages === 0;
              return (gen.generatingAllImages || generating) ? (
                <Button variant="outline" size="sm" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => { gen.imageGenCancelRef.current = true; setGenerating(false); gen.cancelImageGeneration(); setRegeneratingScene(null); }}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="gap-1.5 border-border text-foreground hover:bg-secondary"
                  onClick={hasAllImages ? () => generateScenes() : gen.generateAllImages}
                  disabled={disableGenerate}
                  aria-disabled={disableGenerate}
                  title={disableGenerate && disableGenerateReason
                    ? disableGenerateReason
                    : hasAllImages
                      ? "Regenerate all scene images"
                      : `Generate ${missingImages} missing scene image${missingImages > 1 ? "s" : ""}`}>
                  {hasAllImages ? <RefreshCw className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  {hasAllImages ? "Regenerate All" : `Generate ${missingImages} Image${missingImages > 1 ? "s" : ""}`}
                </Button>
              );
            })()}

            <CacheClearDialogs
              scenes={scenes} setScenes={setScenes} projectId={projectId} userId={userId}
              generating={generating} generatingAllImages={gen.generatingAllImages}
              gen={gen} characterImageStorageUrl={characterImageStorageUrl}
              setSceneRatings={setSceneRatings} setSceneComments={setSceneComments}
            />


            {/* Bulk Lyrics Editor */}
            {scenes.length > 0 && onBulkLyricsSave && (
              <BulkLyricsEditor scenes={scenes} onSave={onBulkLyricsSave} />
            )}

            {/* Selective Scene Regeneration */}
            {scenes.length > 0 && (
              <RegenerateScenesPicker
                scenes={scenes}
                generating={generating || gen.generatingAllImages || disableGenerate}
                onRegenerate={(indices) => generateScenes(indices)}
              />
            )}

            {/* Re-sync Lyrics from active transcript */}
            {scenes.length > 0 && onResyncLyrics && (
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-8 text-xs"
                        disabled={resyncing || generating || gen.generatingAllImages || !hasTranscriptWords}
                      >
                        {resyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Music className="h-3.5 w-3.5" />}
                        Re-sync Lyrics
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-[240px] text-xs">
                      {hasTranscriptWords
                        ? "Re-bucket lyrics from the active transcript onto every scene, then regenerate scene descriptions."
                        : "No transcript words available — run Analyze Track first."}
                    </p>
                  </TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Re-sync lyrics from active transcript?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will re-segment the audio against the current transcription and regenerate every scene's
                      description, lyric segment, and visual prompt. Existing scene images and videos are not affected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onResyncLyrics}>Re-sync all scenes</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}



            <BatchActionControls
              scenes={scenes} selectedForGeneration={selectedForGeneration}
              selectAllForGeneration={selectAllForGeneration} deselectAllForGeneration={deselectAllForGeneration}
              globalProvider={globalProvider} setGlobalProvider={setGlobalProvider}
              referenceSceneIndex={referenceSceneIndex} setReferenceSceneIndex={setReferenceSceneIndex}
              batchGenerating={gen.batchGenerating} batchAbort={gen.batchAbort}
              generateSelectedVideos={gen.generateSelectedVideos} generateAllVideos={gen.generateAllVideos}
            />
          </div>
        </div>

        {/* Batch Progress */}
        {gen.batchProgress && (
          <ProcessProgressBar
            progress={(gen.batchProgress.done / gen.batchProgress.total) * 100}
            active={gen.batchGenerating}
            label={`${gen.batchProgress.done}/${gen.batchProgress.total} videos${
              gen.batchProgress.done > 0 && gen.batchProgress.done < gen.batchProgress.total
                ? (() => {
                    const elapsed = (Date.now() - gen.batchProgress.startedAt) / 1000;
                    const avgPerScene = elapsed / gen.batchProgress.done;
                    const remaining = avgPerScene * (gen.batchProgress.total - gen.batchProgress.done);
                    const mins = Math.floor(remaining / 60);
                    const secs = Math.floor(remaining % 60);
                    return ` · ~${mins > 0 ? `${mins}m ` : ""}${secs}s left`;
                  })()
                : ""
            }`}
            barHeight="h-2"
          />
        )}

        {/* Genre selector */}
        <div className="flex items-center gap-2">
          <Music className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">Genre</span>
          <div className="flex flex-wrap gap-1">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => {
                  const val = g === "Auto" ? "auto" : g;
                  setSceneGenre(val);
                  if (val !== "auto" && scenes.length > 0) {
                    setScenes(prev => prev.map(s => ({ ...s, genre: g === "Auto" ? undefined : g })));
                  }
                }}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                  (g === "Auto" ? "auto" : g) === sceneGenre
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <StoryboardStylePresets scenes={scenes} setScenes={setScenes} setSceneTheme={setSceneTheme} setCustomTheme={setCustomTheme} />
        <ThemePicker sceneTheme={sceneTheme} setSceneTheme={setSceneTheme} customTheme={customTheme} setCustomTheme={setCustomTheme} visualStyle={visualStyle} />

        <LocationPicker sceneLocation={sceneLocation} setSceneLocation={setSceneLocation} customLocation={customLocation} setCustomLocation={setCustomLocation} />

        {(sceneTheme !== "auto" || sceneLocation !== "auto") && scenes.length > 0 && (
          <p className="text-xs text-primary/80">
            {sceneTheme !== "auto" && sceneLocation !== "auto"
              ? <>Theme: <strong>{sceneTheme}</strong>, Location: <strong>{sceneLocation}</strong> — click "Regenerate All" to apply.</>
              : sceneTheme !== "auto"
                ? <>Theme: <strong>{sceneTheme}</strong> — click "Regenerate All" to apply.</>
                : <>Location: <strong>{sceneLocation}</strong> — click "Regenerate All" to apply.</>
            }
          </p>
        )}

        {gen.imageGenProgress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating scene {gen.imageGenProgress.current} of {gen.imageGenProgress.total}…
              </span>
              <span>{Math.round((gen.imageGenProgress.current / gen.imageGenProgress.total) * 100)}%</span>
            </div>
            <Progress value={(gen.imageGenProgress.current / gen.imageGenProgress.total) * 100} className="h-2" />
          </div>
        )}
      </div>
    </div>
  );
}
