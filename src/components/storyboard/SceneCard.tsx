import { useMemo, useRef, useState } from "react";
import { Film, Camera, MapPin, Video, Check, ArrowLeft, ArrowRight, RotateCcw, Shirt, Mic, ShieldCheck, ShieldAlert } from "lucide-react";
import { evaluateLipSyncReadiness } from "@/lib/lip-sync-readiness";
import ScenePromptEditor from "@/components/storyboard/ScenePromptEditor";
import SceneDirectorPanel from "@/components/storyboard/SceneDirectorPanel";
import SceneIdleAnalysis from "@/components/storyboard/SceneIdleAnalysis";
import ScenePromptPreviewPanel from "@/components/storyboard/ScenePromptPreviewPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Scene } from "@/contexts/ProjectContext";
import WordTimingPanel from "@/components/WordTimingPanel";
import SceneMediaPreview from "@/components/storyboard/SceneMediaPreview";
import AiPenPanel from "@/components/storyboard/AiPenPanel";
import SceneActionFooter from "@/components/storyboard/SceneActionFooter";
import ScenePayloadFlagsPanel from "@/components/storyboard/ScenePayloadFlagsPanel";

import { timeToSeconds, secondsToTime } from "@/lib/audio-utils";

interface SceneCardProps {
  projectId?: string;
  scene: Scene;
  sceneIndex: number;
  totalScenes: number;
  activeReviewIndex: number;
  isSelected: boolean;
  onToggleSelection: (idx: number) => void;
  isApproved: boolean;
  onApprove: (idx: number) => void;
  onUnapprove: (idx: number) => void;
  isSavedForAssembly: boolean;
  onToggleAssembly: (idx: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onRegenerateImage: (idx: number) => void;
  onGenerateImage: (scenes: Scene[], idx: number) => void;
  onRegenerateScene: (idx: number) => void;
  onDeleteScene: (idx: number) => void;
  onDeleteVideo: (idx: number) => void;
  onDeleteVideoFal: (idx: number) => void;
  onDownloadVideo: (idx: number) => void;
  isDownloading?: boolean;
  onRegenerateWithCharacter: (idx: number, imageUrl: string) => void;
  onSubmitUpscale: (idx: number) => void;
  onLoadVideoHistory: (idx: number) => void;
  onUpdateScene: (idx: number, updates: Partial<Scene>) => void;
  editingTime: { sceneIdx: number; field: "start" | "end"; value: string } | null;
  onSetEditingTime: (val: { sceneIdx: number; field: "start" | "end"; value: string } | null) => void;
  onCommitTimeEdit: () => void;
  aiPenOpen: number | null;
  aiPenPrompt: string;
  aiPenLoading: boolean;
  onSetAiPenOpen: (val: number | null) => void;
  onSetAiPenPrompt: (val: string) => void;
  onAiEditImage: (idx: number, prompt: string) => void;
  previousImageUrl?: string | null;
  onUndoAiEdit?: (idx: number) => void;
  onSaveAiEdit?: (idx: number) => void;
  onPullFromGallery?: (idx: number, videoUrl: string) => void;
  renderVideoButton: (scene: Scene, idx: number) => React.ReactNode;
  rating: number;
  comment: string;
  autoOptimizing: boolean;
  onRatingChange: (idx: number, val: number) => void;
  onCommentChange: (idx: number, val: string) => void;
  upscaleJob?: { status: string; progress: number };
  regeneratingScene: number | null;
  onCancelRegenerate: () => void;
  transcription: any;
}

export default function SceneCard({
  projectId, scene, sceneIndex: i, totalScenes, activeReviewIndex,
  isSelected, onToggleSelection, isApproved, onApprove, onUnapprove,
  isSavedForAssembly, onToggleAssembly, onPrev, onNext,
  onRegenerateImage, onGenerateImage, onRegenerateScene, onDeleteScene,
  onDeleteVideo, onDeleteVideoFal, onDownloadVideo, isDownloading, onRegenerateWithCharacter,
  onSubmitUpscale, onLoadVideoHistory, onUpdateScene,
  editingTime, onSetEditingTime, onCommitTimeEdit,
  aiPenOpen, aiPenPrompt, aiPenLoading, onSetAiPenOpen, onSetAiPenPrompt, onAiEditImage,
  previousImageUrl, onUndoAiEdit, onSaveAiEdit, onPullFromGallery,
  renderVideoButton, rating, comment, autoOptimizing, onRatingChange, onCommentChange,
  upscaleJob, regeneratingScene, onCancelRegenerate, transcription,
}: SceneCardProps) {
  const originalPromptRef = useRef(scene.visual_prompt);
  const startSec = timeToSeconds(scene.time_start);
  const endSec = timeToSeconds(scene.time_end);
  const segDuration = Math.max(0, endSec - startSec);
  const videoDuration = 10;
  const promptModified = scene.visual_prompt !== originalPromptRef.current;
  const lipSync = useMemo(() => evaluateLipSyncReadiness(scene), [scene]);

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/50 bg-secondary/30 px-6 py-3">
        <button
          onClick={() => onToggleSelection(i)}
          className={`shrink-0 flex h-5 w-5 items-center justify-center rounded border transition-all ${
            isSelected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          title={isSelected ? "Deselect for generation" : "Select for generation"}
        >
          {isSelected && <Check className="h-3 w-3" />}
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">{i + 1}</div>
        {scene.trackingId && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono border-muted-foreground/30 text-muted-foreground">
            {scene.trackingId}
          </Badge>
        )}
        {isApproved && (
          <Badge className="bg-green-600/20 text-green-600 border-green-600/30 text-[10px] px-1.5 py-0 gap-0.5">
            <Check className="h-2.5 w-2.5" /> Approved
          </Badge>
        )}
        {scene.section_type && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase tracking-wider border-primary/30 text-primary/80">
            {scene.section_type}{(scene.section_index ?? 1) > 1 ? ` ${scene.section_index}` : ""}
          </Badge>
        )}
        {(!scene.lyric_segment || scene.lyric_segment.trim().split(/\s+/).filter(w => w.length > 0).length < 3) && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent/40 text-accent-foreground bg-accent/10">
            🎵 Instrumental
          </Badge>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => {
                const nextBroll = !(scene.is_broll === true);
                onUpdateScene(i, {
                  is_broll: nextBroll,
                  // Keep Scene Director's shot_role in sync so downstream
                  // prompt builders and readiness checks pick up the change.
                  shot_role: nextBroll ? "B_ROLL_STORY" : "A_ROLL_LIP_SYNC",
                } as Partial<Scene>);
              }}
              aria-label={`Toggle role — currently ${lipSync.isARoll ? "A-Roll" : "B-Roll / instrumental"}. Click to switch. Only A-Roll scenes receive audio for lip-sync.`}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded"
            >
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 gap-0.5 cursor-pointer transition-colors ${
                  lipSync.isARoll
                    ? "border-primary/40 text-primary bg-primary/5 hover:bg-primary/10"
                    : "border-muted-foreground/30 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {lipSync.isARoll ? <Mic className="h-2.5 w-2.5" /> : <Camera className="h-2.5 w-2.5" />}
                {lipSync.shotLabel}
              </Badge>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-xs">
            <div className="font-medium">{lipSync.shotLabel}</div>
            {lipSync.movementLabel && (
              <div className="text-muted-foreground">Movement: {lipSync.movementLabel}</div>
            )}
            <div className="text-muted-foreground mt-1">
              Click to switch to {lipSync.isARoll ? "B-Roll / instrumental" : "A-Roll lip-sync"}.
              Only A-Roll scenes send audio to the video generator.
            </div>
          </TooltipContent>
        </Tooltip>
        {lipSync.isARoll && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 gap-0.5 cursor-help ${
                  lipSync.ready
                    ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5"
                    : "border-destructive/50 text-destructive bg-destructive/5"
                }`}
              >
                {lipSync.ready ? (
                  <>
                    <ShieldCheck className="h-2.5 w-2.5" /> Lip-sync ready
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-2.5 w-2.5" /> {lipSync.warnings.length} lip-sync issue
                    {lipSync.warnings.length === 1 ? "" : "s"}
                  </>
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-xs">
              {lipSync.ready ? (
                <div>Mouth/face clear, minimal head motion, safe camera move &amp; angle.</div>
              ) : (
                <ul className="space-y-0.5 list-disc list-inside">
                  {lipSync.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              )}
            </TooltipContent>
          </Tooltip>
        )}
        <span className="text-sm font-medium flex-1 truncate">"{scene.lyric_segment || "Instrumental"}"</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-0.5 border border-border rounded-md px-2 py-0.5 text-xs text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors"
              onClick={(e) => e.stopPropagation()}>
              {editingTime?.sceneIdx === i && editingTime.field === "start" ? (
                <input autoFocus className="w-10 bg-transparent text-xs text-foreground outline-none text-center" value={editingTime.value}
                  onChange={e => onSetEditingTime({ ...editingTime, value: e.target.value })}
                  onBlur={onCommitTimeEdit} onKeyDown={e => { if (e.key === "Enter") onCommitTimeEdit(); if (e.key === "Escape") onSetEditingTime(null); }} />
              ) : (
                <span onClick={() => onSetEditingTime({ sceneIdx: i, field: "start", value: scene.time_start })}>{scene.time_start}</span>
              )}
              <span>-</span>
              {editingTime?.sceneIdx === i && editingTime.field === "end" ? (
                <input autoFocus className="w-10 bg-transparent text-xs text-foreground outline-none text-center" value={editingTime.value}
                  onChange={e => onSetEditingTime({ ...editingTime, value: e.target.value })}
                  onBlur={onCommitTimeEdit} onKeyDown={e => { if (e.key === "Enter") onCommitTimeEdit(); if (e.key === "Escape") onSetEditingTime(null); }} />
              ) : (
                <span onClick={() => onSetEditingTime({ sceneIdx: i, field: "end", value: scene.time_end })}>{scene.time_end}</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Click to edit · Auto-snaps to word boundaries</TooltipContent>
        </Tooltip>
        {scene.videoUrl && scene.videoQuality === "preview" && <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Preview</Badge>}
        {scene.videoUrl && scene.videoQuality === "hd" && <Badge className="bg-primary/10 text-primary border-primary/20">HD Ready</Badge>}
        {scene.videoUrl && !scene.videoQuality && <Badge className="bg-primary/10 text-primary border-primary/20">Video Ready</Badge>}
      </div>

      {/* Content */}
      <div className="grid gap-4 p-6 md:grid-cols-2">
        <div className="space-y-3">
          <SceneMediaPreview
            scene={scene} sceneIndex={i} upscaleJob={upscaleJob}
            aiPenOpen={aiPenOpen} onSetAiPenOpen={onSetAiPenOpen} onSetAiPenPrompt={onSetAiPenPrompt}
            onRegenerateImage={onRegenerateImage} onGenerateImage={onGenerateImage}
            onSubmitUpscale={onSubmitUpscale} onLoadVideoHistory={onLoadVideoHistory}
            onDownloadVideo={onDownloadVideo} isDownloading={isDownloading} onDeleteVideo={onDeleteVideo} onDeleteVideoFal={onDeleteVideoFal}
          />

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
            <span className="flex items-center gap-1"><Video className="h-3 w-3" />Video: {scene.videoUrl ? `${videoDuration}s` : `${videoDuration}s (pending)`}</span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1"><Video className="h-3 w-3" />Audio Segment: {segDuration.toFixed(1)}s</span>
            <span className="text-border">|</span>
            <span>{secondsToTime(startSec)} – {secondsToTime(endSec)}</span>
          </div>

          {aiPenOpen === i && scene.imageUrl && (
            <AiPenPanel
              sceneIndex={i} aiPenPrompt={aiPenPrompt} aiPenLoading={aiPenLoading}
              onClose={() => onSetAiPenOpen(null)} onSetAiPenPrompt={onSetAiPenPrompt} onAiEditImage={onAiEditImage}
              previousImageUrl={previousImageUrl} onUndo={onUndoAiEdit} onSaveEdit={onSaveAiEdit}
            />
          )}

          {renderVideoButton(scene, i)}

          <ScenePayloadFlagsPanel
            projectId={projectId}
            sceneNumber={scene.scene_number ?? i + 1}
            isARoll={lipSync.isARoll}
          />
        </div>

        {/* Scene Details */}
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div><span className="text-muted-foreground">Location: </span><span className="font-medium">{scene.location}</span></div>
          </div>
          <div className="flex items-start gap-2">
            <Camera className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div><span className="text-muted-foreground">Camera: </span><span className="font-medium">{scene.camera_style}</span></div>
          </div>
          <AttireOverride scene={scene} sceneIndex={i} onUpdateScene={onUpdateScene} />

          {/* Scene Director Panel */}
          <SceneDirectorPanel
            scene={scene}
            sceneIndex={i}
            totalScenes={totalScenes}
            onUpdateScene={onUpdateScene}
            onRerunScene={onRegenerateScene}
            isRegenerating={regeneratingScene === i}
          />

          {/* Post-generation motion analysis — flags idle scenes */}
          {scene.videoUrl && (
            <SceneIdleAnalysis
              videoUrl={scene.videoUrl}
              videoKey={String((scene as any).video_updated_at ?? scene.videoUrl)}
              isBroll={scene.is_broll === true}
              onApplyPatch={(patch) => onUpdateScene(i, patch as any)}
            />
          )}





          {/* 4-Section Prompt Editor */}
          <ScenePromptEditor scene={scene} sceneIndex={i} onUpdateScene={onUpdateScene} />

          {/* Final composed prompt preview (mirrors edge function) */}
          <ScenePromptPreviewPanel scene={scene} projectId={projectId} />



          {transcription?.words?.length > 0 && (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <WordTimingPanel scene={scene} transcription={transcription} variant="full" />
            </div>
          )}

          {/* Visual Prompt (kept as master prompt) */}
          <div className="space-y-1">
            <span className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
              <Film className="h-3 w-3" /> Visual Prompt (editable)
              {promptModified && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onUpdateScene(i, { visual_prompt: originalPromptRef.current })}
                      className="ml-auto flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" /> Reset
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Restore original AI-generated prompt</TooltipContent>
                </Tooltip>
              )}
            </span>
            <Textarea
              value={scene.visual_prompt}
              onChange={(e) => onUpdateScene(i, { visual_prompt: e.target.value })}
              className="text-xs min-h-[60px] bg-secondary/30 border-border/50"
              placeholder="Describe the visual scene..."
            />
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <SceneActionFooter
        scene={scene} sceneIndex={i} projectId={projectId} aiPenOpen={aiPenOpen}
        onSetAiPenOpen={onSetAiPenOpen} onSetAiPenPrompt={onSetAiPenPrompt}
        onDownloadVideo={onDownloadVideo} isDownloading={isDownloading} onRegenerateScene={onRegenerateScene}
        onDeleteScene={onDeleteScene} onRegenerateWithCharacter={onRegenerateWithCharacter}
        onPullFromGallery={onPullFromGallery}
        regeneratingScene={regeneratingScene} onCancelRegenerate={onCancelRegenerate}
        rating={rating} comment={comment} autoOptimizing={autoOptimizing}
        onRatingChange={onRatingChange} onCommentChange={onCommentChange}
      />

      {/* Sequential Approval Controls */}
      <div className="border-t border-primary/20 bg-primary/5 px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onPrev} disabled={activeReviewIndex === 0} className="gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Previous
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {scene.videoUrl && (
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={isSavedForAssembly} onChange={() => onToggleAssembly(i)} className="h-4 w-4 rounded border-border accent-primary" />
                <span className="text-xs font-medium text-foreground">Assembly</span>
              </label>
            )}
            {isApproved ? (
              <Badge className="bg-green-500/20 text-green-600 border-green-500/30 gap-1"><Check className="h-3 w-3" /> Approved</Badge>
            ) : (
              <span className="text-muted-foreground text-xs">
                {scene.videoUrl ? "Ready to approve" : scene.imageUrl ? "Generate video first" : "Generate image first"}
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {!isApproved ? (
              <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => onApprove(i)} disabled={!scene.videoUrl}>
                <Check className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Approve & Next</span><span className="sm:hidden">Approve</span>
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" className="gap-1 text-destructive border-destructive/30" onClick={() => onUnapprove(i)}>Unapprove</Button>
                <Button variant="outline" size="sm" onClick={onNext} disabled={activeReviewIndex >= totalScenes - 1} className="gap-1">
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Inline attire override for per-scene outfit customization */
function AttireOverride({ scene, sceneIndex, onUpdateScene }: {
  scene: Scene; sceneIndex: number;
  onUpdateScene: (idx: number, updates: Partial<Scene>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const attire = (scene as any).attire_override || "";

  if (!editing && !attire) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <Shirt className="h-3.5 w-3.5" /> Customize attire for this scene
      </button>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <Shirt className="h-4 w-4 mt-0.5 text-primary shrink-0" />
      <div className="flex-1 space-y-1">
        <span className="text-muted-foreground text-xs font-medium">Attire Override</span>
        {editing ? (
          <div className="flex gap-1.5">
            <input
              autoFocus
              className="flex-1 text-xs bg-secondary/30 border border-border/50 rounded px-2 py-1 outline-none focus:border-primary/50"
              placeholder="e.g. red leather jacket, gold chains"
              defaultValue={attire}
              onBlur={(e) => {
                onUpdateScene(sceneIndex, { attire_override: e.target.value.trim() || undefined } as any);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onUpdateScene(sceneIndex, { attire_override: (e.target as HTMLInputElement).value.trim() || undefined } as any);
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">{attire}</span>
            <button onClick={() => setEditing(true)} className="text-[10px] text-primary hover:text-primary/80">Edit</button>
            <button onClick={() => { onUpdateScene(sceneIndex, { attire_override: undefined } as any); }} className="text-[10px] text-destructive hover:text-destructive/80">Remove</button>
          </div>
        )}
      </div>
    </div>
  );
}
