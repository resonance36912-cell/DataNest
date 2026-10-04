import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { ArrowLeft, ArrowRight, Film, Save, Loader2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import SceneTimeline from "@/components/assembly/SceneTimeline";
import TransitionPicker from "@/components/assembly/TransitionPicker";
import TextOverlayPanel from "@/components/assembly/TextOverlayPanel";
import FilterPanel from "@/components/assembly/FilterPanel";
import AudioEnhancementPanel from "@/components/assembly/AudioEnhancementPanel";
import VocalSyncEditorPanel from "@/components/assembly/VocalSyncEditorPanel";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { secondsToTime } from "@/lib/audio-utils";
import SaveProgressButton from "@/components/SaveProgressButton";
import CharacterPickerDialog from "@/components/assembly/CharacterPickerDialog";
import AudioTrackTimeline, { type AudioTrackTimelineHandle, type PersistedPeakData } from "@/components/assembly/AudioTrackTimeline";
import SavedAssemblyList from "@/components/assembly/SavedAssemblyList";
import RecallVideoDialog from "@/components/assembly/RecallVideoDialog";

// Extracted modules
import { useAssemblyPlayback } from "@/hooks/useAssemblyPlayback";
import { useAssemblyConfig } from "@/hooks/useAssemblyConfig";
import { useAssemblyRegen } from "@/hooks/useAssemblyRegen";
import SaveAssemblyDialog from "@/components/assembly/SaveAssemblyDialog";
import RenderControls, { RenderButton } from "@/components/assembly/RenderControls";
import AssemblyVideoPreview from "@/components/assembly/AssemblyVideoPreview";
import AssemblyPlaybackControls from "@/components/assembly/AssemblyPlaybackControls";
import AssemblyToolbar from "@/components/assembly/AssemblyToolbar";
import { useVideoPreloader } from "@/hooks/useVideoPreloader";
import { useAssemblyMerge } from "@/hooks/useAssemblyMerge";
import MergeAssemblyPanel from "@/components/assembly/MergeAssemblyPanel";
import SceneTrimEditor, { type SceneTrim } from "@/components/assembly/SceneTrimEditor";
import { AlertTriangle } from "lucide-react";
import MergeDebugReportPanel from "@/components/assembly/MergeDebugReportPanel";
import MergeDebugComparePanel from "@/components/assembly/MergeDebugComparePanel";
import { downloadMergeDebugReportFor, downloadMergeDebugCsvFor, downloadMergeDebugZipFor } from "@/lib/merge-debug-report-fetch";
import type { CsvExportMode } from "@/lib/merge-debug-report";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import type { StepProps } from "@/types/storyboard";

// Timeline engine imports
import TimelineToolbarComponent from "@/components/assembly/TimelineToolbar";
import { MarkerList, MarkerRulerOverlay } from "@/components/assembly/MarkerSystem";
import { useTimelineKeyboard } from "@/hooks/useTimelineKeyboard";
import TrackLaneHeaders, { EmptyTrackLane, DEFAULT_TRACK_STATES, type TrackStates } from "@/components/assembly/TrackLaneHeaders";
import {
  createMarker, findAdjacentCut, nudgeFrames, clampZoom, zoomToFit,
  detectGaps, closeAllGaps, formatTimecode,
  DEFAULT_ZOOM, type TimelineMarker, type TimelineClip,
} from "@/lib/timeline-engine";

export default function AssemblyStep({ onNext, onPrev }: StepProps) {
  const {
    scenes, setScenes, savedSceneIndices, setSavedSceneIndices, projectId,
    pendingCharacterRegen, setPendingCharacterRegen,
    characterConcepts, setCharacterConcepts: setConcepts,
    selectedCharacterIndex, setSelectedCharacterIndex: setSelectedConcept,
    setCharacterConfirmed: setConfirmed,
    setCurrentStep, setPendingStoryboardGen,
    file, transcription, audioUrl, setAudioUrl,
  } = useProject();
  const { user } = useAuth();

  // ─── Auto-populate savedSceneIndices with all scenes that have videos ───
  useEffect(() => {
    if (!scenes || scenes.length === 0) return;
    const videoIndices = scenes
      .map((s: any, idx: number) => (s.videoUrl ? idx : -1))
      .filter((idx: number) => idx >= 0);
    if (videoIndices.length > 0 && (savedSceneIndices || []).length === 0) {
      setSavedSceneIndices(videoIndices);
    }
  }, [scenes]);

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const audioTimelineRef = useRef<AudioTrackTimelineHandle>(null);

  // ─── Load persisted waveform peaks from DB ───
  const [persistedPeakData, setPersistedPeakData] = useState<PersistedPeakData | null>(null);
  useEffect(() => {
    if (!projectId) return;
    supabase
      .from("projects")
      .select("waveform_peaks")
      .eq("id", projectId)
      .single()
      .then(({ data }) => {
        if (data?.waveform_peaks) {
          setPersistedPeakData(data.waveform_peaks as unknown as PersistedPeakData);
        }
      });
  }, [projectId]);

  // ─── Config hook (scenes, save/load, render, AI, audio) ───
  const config = useAssemblyConfig({
    projectId, userId: user?.id, scenes, setScenes, savedSceneIndices, audioUrl, setAudioUrl,
  });

  // ─── Playback engine ───
  const playback = useAssemblyPlayback({
    orderedScenes: config.orderedScenes,
    transitions: config.transitions,
    totalDuration: config.totalDuration,
    audioUrl,
    videoARef,
    videoBRef,
    audioTimelineRef,
  });

  // Wire setActiveSceneIndex into config for load callbacks
  config.activeSceneIndexRef.current = playback.setActiveSceneIndex;

  // Prefetch videos for the active scene + 3 ahead in assembly
  const assemblyVideoUrls = useMemo(() => config.orderedScenes.map(s => s.videoUrl || null), [config.orderedScenes]);
  // Prefetch all scene videos with prioritized queuing (current+3 first, rest queued)
  useVideoPreloader({
    urls: assemblyVideoUrls,
    activeIndex: playback.activeSceneIndex ?? 0,
    lookahead: 3,
  });

  // ─── Assembly merge hook ───
  const { mergeState, displayedProgress: mergeDisplayedProgress, progressSource: mergeProgressSource, progressLastRealAt: mergeProgressLastRealAt, startMerge, resetMerge, cancelMerge, canceling: mergeCanceling, forceRefresh, isStuck, refreshing, cooldownRemainingMs, lastPollAt, lastPollSource, autoRefreshOnStuck, setAutoRefreshOnStuck, autoRefreshContinuous, setAutoRefreshContinuous, refreshAttempts, consecutiveFailures, retryAttempts, lastRetrySource, lastRetryAt, retryPending, autoRefreshSuspended, resumeAutoRefresh, refreshHistory, setProjectBpm, setConfidenceScores, confidenceThresholds, setConfidenceThresholds } = useAssemblyMerge();
  // Keep the merge hook's BPM ref in sync with the active project so each
  // refresh-history entry can capture the value seen during the attempt.
  const projectBpm = (transcription as any)?.bpm ?? null;
  const verificationConfidenceLyrics = (transcription as any)?.verification?.confidence_lyrics ?? null;
  const verificationConfidenceBpm = (transcription as any)?.verification?.confidence_bpm ?? null;
  useEffect(() => {
    setProjectBpm(typeof projectBpm === "number" ? projectBpm : null);
  }, [projectBpm, setProjectBpm]);
  useEffect(() => {
    setConfidenceScores({
      lyrics: typeof verificationConfidenceLyrics === "number" ? verificationConfidenceLyrics : null,
      bpm: typeof verificationConfidenceBpm === "number" ? verificationConfidenceBpm : null,
    });
  }, [verificationConfidenceLyrics, verificationConfidenceBpm, setConfidenceScores]);
  const hasAllVideos = config.orderedScenes.length >= 2 && config.orderedScenes.every(s => !!s.videoUrl);

  // Per-scene trim overrides keyed by sceneNumber. Empty = use defaults (full slot, no tail cut).
  const [sceneTrims, setSceneTrims] = useState<Record<number, SceneTrim>>({});

  // ─── "Past source EOF" acknowledgement gate ───
  // Detect trims whose effective window (startSec + durationSec) exceeds the
  // probed source clip duration. Requires explicit confirmation before merge.
  const eofWarnings = useMemo(() => {
    return config.orderedScenes
      .map((s) => {
        const t = sceneTrims[s.sceneNumber];
        if (!t) return null;
        const src = typeof t.sourceDurationSec === "number" ? t.sourceDurationSec : null;
        if (src === null || src <= 0) return null;
        const requestedEnd = t.startSec + t.durationSec;
        const overflowSec = requestedEnd - src;
        if (overflowSec <= 0.05) return null;
        return {
          sceneNumber: s.sceneNumber,
          startSec: t.startSec,
          durationSec: t.durationSec,
          sourceDurationSec: src,
          overflowSec,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [config.orderedScenes, sceneTrims]);

  // Stable signature so a fresh acknowledgement is required whenever the set of
  // overflowing scenes (or their numbers) changes.
  const eofKey = useMemo(
    () =>
      eofWarnings
        .map((w) => `${w.sceneNumber}:${w.startSec.toFixed(2)}+${w.durationSec.toFixed(2)}>${w.sourceDurationSec.toFixed(2)}`)
        .join("|"),
    [eofWarnings],
  );

  const [acknowledgedEofKey, setAcknowledgedEofKey] = useState<string | null>(null);
  const [eofDialogOpen, setEofDialogOpen] = useState(false);
  const [eofAckChecked, setEofAckChecked] = useState(false);
  const pendingMergeSettingsRef = useRef<{ resolution: string; fps: number } | undefined>(undefined);

  // If the warning set changes, force re-acknowledgement.
  useEffect(() => {
    if (acknowledgedEofKey !== null && acknowledgedEofKey !== eofKey) {
      setAcknowledgedEofKey(null);
    }
  }, [eofKey, acknowledgedEofKey]);

  const runMerge = useCallback((settings?: { resolution: string; fps: number }) => {
    if (!projectId || !audioUrl) return;
    const mergeScenes = config.orderedScenes.filter((scene) => Boolean(scene.videoUrl));
    const videoUrls = mergeScenes.map((scene) => scene.videoUrl);
    const sceneDurations = mergeScenes.map((scene) => scene.durationSec);
    const sceneNumbers = mergeScenes.map((scene) => scene.sceneNumber);

    // Build per-scene trim array aligned to orderedScenes (only scenes with a custom override)
    const trimsArr = mergeScenes.map((s) => {
      const t = sceneTrims[s.sceneNumber];
      if (!t) return null;
      return {
        startSec: t.startSec,
        durationSec: t.durationSec,
        tailCutSec: t.tailCutSec || undefined,
        sourceDurationSec: t.sourceDurationSec,
      };
    });
    const hasAnyTrim = trimsArr.some((t) => t !== null);

    // Pre-merge validation: total scene durations should roughly match audio
    const totalSceneDuration = sceneDurations.reduce((sum, d) => sum + d, 0);
    console.log(`[Merge] Total scene duration: ${totalSceneDuration.toFixed(2)}s, ${videoUrls.length} scenes`);
    sceneDurations.forEach((d, i) => {
      console.log(`  Scene ${config.orderedScenes[i].sceneNumber}: ${d.toFixed(2)}s (${config.orderedScenes[i].timeStart}–${config.orderedScenes[i].timeEnd})`);
    });

    startMerge(projectId, videoUrls, audioUrl, {
      ...settings,
      sceneDurations,
      sceneNumbers,
      ...(hasAnyTrim ? { sceneTrims: trimsArr } : {}),
    });
  }, [projectId, audioUrl, config.orderedScenes, sceneTrims, startMerge]);

  const handleStartMerge = useCallback((settings?: { resolution: string; fps: number }) => {
    if (!projectId || !audioUrl) return;
    // Gate: if there are unacknowledged EOF overflow warnings, prompt first.
    if (eofWarnings.length > 0 && acknowledgedEofKey !== eofKey) {
      pendingMergeSettingsRef.current = settings;
      setEofAckChecked(false);
      setEofDialogOpen(true);
      return;
    }
    runMerge(settings);
  }, [projectId, audioUrl, eofWarnings, eofKey, acknowledgedEofKey, runMerge]);

  const confirmEofAndMerge = useCallback(() => {
    setAcknowledgedEofKey(eofKey);
    setEofDialogOpen(false);
    const s = pendingMergeSettingsRef.current;
    pendingMergeSettingsRef.current = undefined;
    runMerge(s);
  }, [eofKey, runMerge]);

  const regen = useAssemblyRegen({
    orderedScenes: config.orderedScenes,
    setOrderedScenes: config.setOrderedScenes,
    projectId, userId: user?.id,
    activeSceneIndex: playback.activeSceneIndex,
    setActiveSceneIndex: playback.setActiveSceneIndex,
    characterConcepts, selectedCharacterIndex,
    setConcepts, setSelectedConcept, setConfirmed,
    setCurrentStep, setPendingStoryboardGen,
    pendingCharacterRegen, setPendingCharacterRegen,
    file, transcription, audioUrl,
  });

  // ─── Download handler ───
  const [downloadingSceneIdx, setDownloadingSceneIdx] = useState<number | null>(null);
  const downloadScene = useCallback(async (scene: { videoUrl: string; sceneNumber: number }) => {
    if (!scene.videoUrl) return;
    setDownloadingSceneIdx(scene.sceneNumber);
    try {
      const resp = await fetch(scene.videoUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scene-${scene.sceneNumber}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Scene ${scene.sceneNumber} downloaded`);
    } catch {
      toast.error(`Failed to download scene ${scene.sceneNumber}`);
    } finally {
      setDownloadingSceneIdx(null);
    }
  }, []);

  // ─── Timeline engine state ───
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [rippleEnabled, setRippleEnabled] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(DEFAULT_ZOOM);
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [trackStates, setTrackStates] = useState<TrackStates>(DEFAULT_TRACK_STATES);
  const [masterWaveform, setMasterWaveform] = useState<{ bars: number[]; durationSec: number } | null>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  // Poll master waveform from audio timeline for scene waveform alignment
  // Fast initial poll (200ms) to grab waveform as soon as audio decodes
  useEffect(() => {
    if (masterWaveform) return;
    let attempts = 0;
    const interval = setInterval(() => {
      const wf = audioTimelineRef.current?.getWaveform();
      if (wf && wf.bars.length > 0) {
        setMasterWaveform(wf);
        clearInterval(interval);
      }
      attempts++;
      if (attempts > 50) clearInterval(interval); // stop after 10s
    }, 200);
    return () => clearInterval(interval);
  }, [masterWaveform]);

  // Convert orderedScenes to TimelineClips for engine functions
  const timelineClips = useMemo<TimelineClip[]>(() => {
    let cursor = 0;
    return config.orderedScenes.map((s) => {
      const clip: TimelineClip = {
        id: s.sceneIndex,
        startSec: cursor,
        endSec: cursor + s.durationSec,
        durationSec: s.durationSec,
      };
      cursor += s.durationSec;
      return clip;
    });
  }, [config.orderedScenes]);

  const gaps = useMemo(() => detectGaps(timelineClips), [timelineClips]);

  // ─── Timeline actions ───
  const handleSplit = useCallback(() => {
    if (playback.activeSceneIndex === null) return;
    const clip = timelineClips[playback.activeSceneIndex];
    if (!clip) return;
    const splitTime = playback.scrubberPosition;
    // Calculate relative position within the clip
    let cumTime = 0;
    for (let i = 0; i < playback.activeSceneIndex; i++) cumTime += config.orderedScenes[i].durationSec;
    const relativeTime = splitTime - cumTime;
    if (relativeTime <= 0.1 || relativeTime >= clip.durationSec - 0.1) {
      toast.error("Cannot split at clip boundary");
      return;
    }
    const scene = config.orderedScenes[playback.activeSceneIndex];
    const leftScene = { ...scene, durationSec: relativeTime, timeEnd: secondsToTime(cumTime + relativeTime) };
    const rightScene = { ...scene, sceneIndex: Date.now(), durationSec: scene.durationSec - relativeTime, timeStart: secondsToTime(cumTime + relativeTime) };
    const newScenes = [...config.orderedScenes];
    newScenes.splice(playback.activeSceneIndex, 1, leftScene, rightScene);
    config.setOrderedScenes(newScenes);
    config.setTransitions(t => {
      const newT = [...t];
      newT.splice(playback.activeSceneIndex, 0, { type: "cut" as const, durationSec: 0 });
      return newT;
    });
    toast.success("Clip split at playhead");
  }, [playback.activeSceneIndex, playback.scrubberPosition, config.orderedScenes, timelineClips]);

  const handleDuplicate = useCallback(() => {
    if (playback.activeSceneIndex === null) return;
    const scene = config.orderedScenes[playback.activeSceneIndex];
    if (!scene) return;
    const dup = { ...scene, sceneIndex: Date.now() };
    const newScenes = [...config.orderedScenes];
    newScenes.splice(playback.activeSceneIndex + 1, 0, dup);
    config.setOrderedScenes(newScenes);
    config.setTransitions(t => [...t, { type: "crossfade" as const, durationSec: 0.5 }]);
    toast.success(`Scene ${scene.sceneNumber} duplicated`);
  }, [playback.activeSceneIndex, config.orderedScenes]);

  const handleRippleDelete = useCallback(() => {
    if (playback.activeSceneIndex === null) return;
    const scene = config.orderedScenes[playback.activeSceneIndex];
    config.setOrderedScenes(prev => {
      const updated = prev.filter((_, i) => i !== playback.activeSceneIndex);
      config.setTransitions(t => {
        const newT = [...t];
        const removeIdx = Math.min(playback.activeSceneIndex!, newT.length - 1);
        if (removeIdx >= 0) newT.splice(removeIdx, 1);
        return newT;
      });
      if (playback.activeSceneIndex! >= updated.length) {
        playback.setActiveSceneIndex(updated.length > 0 ? updated.length - 1 : null);
      }
      return updated;
    });
    toast.success(`Scene ${scene?.sceneNumber} removed${rippleEnabled ? " (ripple)" : ""}`);
  }, [playback.activeSceneIndex, config.orderedScenes, rippleEnabled]);

  const handleCloseGaps = useCallback(() => {
    if (gaps.length === 0) return;
    const closed = closeAllGaps(timelineClips);
    config.setOrderedScenes(prev => prev.map((scene, i) => {
      const clip = closed[i];
      if (!clip) return scene;
      return { ...scene, durationSec: clip.durationSec, timeStart: secondsToTime(clip.startSec), timeEnd: secondsToTime(clip.endSec) };
    }));
    toast.success(`Closed ${gaps.length} gap${gaps.length > 1 ? "s" : ""}`);
  }, [gaps, timelineClips, config.orderedScenes]);

  const handleAddMarker = useCallback(() => {
    const marker = createMarker(playback.scrubberPosition);
    setMarkers(prev => [...prev, marker]);
    toast.success(`Marker added at ${formatTimecode(playback.scrubberPosition)}`);
  }, [playback.scrubberPosition]);

  const handleJumpToCut = useCallback((direction: "next" | "prev") => {
    const cutTime = findAdjacentCut(timelineClips, playback.scrubberPosition, direction);
    if (cutTime !== null) {
      playback.setScrubberPosition(cutTime);
      // Find scene at this cut point
      let cumTime = 0;
      for (let i = 0; i < config.orderedScenes.length; i++) {
        if (cutTime <= cumTime + config.orderedScenes[i].durationSec + 0.01) {
          playback.setActiveSceneIndex(i);
          break;
        }
        cumTime += config.orderedScenes[i].durationSec;
      }
    }
  }, [timelineClips, playback.scrubberPosition, config.orderedScenes]);

  const handleNudge = useCallback((frames: number) => {
    const newTime = nudgeFrames(playback.scrubberPosition, frames);
    const clamped = Math.min(newTime, config.totalDuration);
    playback.setScrubberPosition(clamped);
  }, [playback.scrubberPosition, config.totalDuration]);

  const handleZoomToFit = useCallback(() => {
    const width = timelineContainerRef.current?.clientWidth || 800;
    setTimelineZoom(zoomToFit(config.totalDuration, width));
  }, [config.totalDuration]);

  // ─── Keyboard shortcuts ───
  useTimelineKeyboard({
    onPlayPause: playback.handlePlayAll,
    onSplit: handleSplit,
    onTrimStart: () => toast.info("Trim start: coming in next update"),
    onTrimEnd: () => toast.info("Trim end: coming in next update"),
    onDelete: handleRippleDelete,
    onDuplicate: handleDuplicate,
    onNudge: handleNudge,
    onJumpToCut: handleJumpToCut,
    onAddMarker: handleAddMarker,
    onZoomIn: () => setTimelineZoom(z => clampZoom(z + 20)),
    onZoomOut: () => setTimelineZoom(z => clampZoom(z - 20)),
    onJumpToStart: () => { playback.setScrubberPosition(0); playback.setActiveSceneIndex(0); },
    onJumpToEnd: () => { playback.setScrubberPosition(config.totalDuration); playback.setActiveSceneIndex(config.orderedScenes.length - 1); },
    onToggleShortcuts: () => setShortcutsOpen(prev => !prev),
  }, !playback.isPlayingAll);

  const currentActiveScene = playback.isPlayingAll
    ? config.orderedScenes[playback.playbackSceneIdx]
    : (playback.activeSceneIndex !== null ? config.orderedScenes[playback.activeSceneIndex] : null);

  // ─── Empty state ───
  if (config.orderedScenes.length === 0) {
    return (
      <div className="space-y-6">
        <div className="glass-card p-12 flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Film className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold">No Saved Scenes</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Go back to the Storyboard step and save generated videos, or recall previously generated videos from storage.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={onPrev} variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Storyboard
            </Button>
            <RecallVideoDialog
              existingVideoUrls={config.existingVideoUrls}
              onAddScene={config.handleAddRecalledScene}
              nextSceneIndex={config.nextSceneIndex}
            />
          </div>
          {config.savedAssemblies.length > 0 && (
            <div className="mt-4">
              <SavedAssemblyList
                assemblies={config.savedAssemblies}
                loading={config.loadingSavedList}
                onLoad={(id) => config.loadSavedAssembly(id)}
                onDelete={(id) => config.setSavedAssemblies(prev => prev.filter(a => a.id !== id))}
                loadingId={config.loadingAssemblyId}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <AssemblyToolbar
        orderedScenes={config.orderedScenes}
        totalDuration={config.totalDuration}
        costEstimate={config.costEstimate}
        savedAssemblies={config.savedAssemblies}
        loadingSavedTimeline={config.loadingSavedTimeline}
        existingVideoUrls={config.existingVideoUrls}
        nextSceneIndex={config.nextSceneIndex}
        uploadingAudio={config.uploadingAudio}
        audioUrl={audioUrl}
        aiGenerating={config.aiGenerating}
        aiReasoning={config.aiReasoning}
        audioInputRef={config.audioInputRef}
        onLoadSavedAssembly={(id) => config.loadSavedAssembly(id)}
        onAddRecalledScene={config.handleAddRecalledScene}
        onAudioUploadClick={() => config.audioInputRef.current?.click()}
        onReorder={config.handleReorder}
        onClearAll={() => {
          config.setOrderedScenes([]);
          config.setTransitions([]);
          playback.setActiveSceneIndex(null);
          toast.success("All scenes cleared");
        }}
        onAiGenerate={config.handleAiGenerate}
        onDismissAiReasoning={() => config.setAiReasoning(null)}
        handleAudioUpload={config.handleAudioUpload}
        onSelectAll={() => {
          regen.setMultiSelectMode(true);
          regen.setSelectedForRegen(new Set(config.orderedScenes.map((_, i) => i)));
        }}
        onImportExternal={(scene) => {
          config.setOrderedScenes(prev => [...prev, scene]);
          toast.success("External video added to timeline");
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="lg:col-span-2 space-y-2 sm:space-y-3">
          <AssemblyVideoPreview
            videoARef={videoARef}
            videoBRef={videoBRef}
            currentActiveScene={currentActiveScene}
            orderedScenes={config.orderedScenes}
            subtitles={config.subtitles}
            filterStyle={config.getFilterStyle()}
            playback={playback}
            audioUrl={audioUrl}
            onDownload={(scene) => downloadScene(scene)}
            downloading={downloadingSceneIdx !== null}
          />

          <AssemblyPlaybackControls
            orderedScenes={config.orderedScenes}
            totalDuration={config.totalDuration}
            costEstimate={config.costEstimate}
            playback={playback}
            regen={regen}
          />

          <div className="glass-card overflow-hidden" ref={timelineContainerRef}>
            <TimelineToolbarComponent
              snapEnabled={snapEnabled}
              onToggleSnap={() => setSnapEnabled(s => !s)}
              rippleEnabled={rippleEnabled}
              onToggleRipple={() => setRippleEnabled(r => !r)}
              zoom={timelineZoom}
              onZoomChange={(z) => setTimelineZoom(clampZoom(z))}
              onZoomToFit={handleZoomToFit}
              playheadTimeSec={playback.scrubberPosition}
              shortcutsOpen={shortcutsOpen}
              onShortcutsOpenChange={setShortcutsOpen}
              onSplit={handleSplit}
              onAddMarker={handleAddMarker}
              onJumpToCut={handleJumpToCut}
              onRippleDelete={handleRippleDelete}
              onCloseGap={handleCloseGaps}
              onDuplicate={handleDuplicate}
              hasActiveClip={playback.activeSceneIndex !== null}
              hasGaps={gaps.length > 0}
            />
            {/* Track lanes with left-side headers */}
            <div className="flex">
              <TrackLaneHeaders
                tracks={trackStates}
                onUpdate={setTrackStates}
                visibleTracks={["video", "overlay", "caption", "audio"]}
                compact
              />
              <div className="flex-1 min-w-0">
                {/* Video track */}
                <div
                  className="border-b border-border/20 relative"
                  style={{ height: 52, opacity: trackStates.video.visible ? 1 : 0.3 }}
                >
                  {trackStates.video.locked && (
                    <div className="absolute inset-0 z-10 bg-background/10 pointer-events-auto cursor-not-allowed" title="Track locked" />
                  )}
                  <div className="h-full overflow-x-auto relative">
                    <MarkerRulerOverlay
                      markers={markers}
                      timelineDuration={config.totalDuration}
                      onSeek={(timeSec) => {
                        playback.setScrubberPosition(timeSec);
                        let cumTime = 0;
                        for (let i = 0; i < config.orderedScenes.length; i++) {
                          if (timeSec <= cumTime + config.orderedScenes[i].durationSec) {
                            playback.setActiveSceneIndex(i);
                            break;
                          }
                          cumTime += config.orderedScenes[i].durationSec;
                        }
                      }}
                    />
                    <div className="flex h-full items-center px-1 gap-0.5">
                      {config.orderedScenes.map((scene, idx) => {
                        const isActive = (playback.isPlayingAll ? playback.playbackSceneIdx : playback.activeSceneIndex) === idx;
                        const widthPct = config.totalDuration > 0 ? (scene.durationSec / config.totalDuration) * 100 : 100 / config.orderedScenes.length;
                        return (
                          <div
                            key={scene.sceneIndex}
                            onClick={() => {
                              if (trackStates.video.locked || playback.isPlayingAll) return;
                              playback.setActiveSceneIndex(idx);
                              let cumTime = 0;
                              for (let i = 0; i < idx; i++) cumTime += config.orderedScenes[i].durationSec;
                              audioTimelineRef.current?.seekAndPlay(cumTime);
                            }}
                            className={`h-[42px] rounded-sm overflow-hidden border cursor-pointer transition-all flex-shrink-0 relative ${
                              isActive ? "border-primary ring-1 ring-primary/30" : "border-border/30 hover:border-primary/40"
                            } ${trackStates.video.muted ? "grayscale" : ""}`}
                            style={{ width: `${widthPct}%`, minWidth: 28 }}
                            title={`Scene ${scene.sceneNumber} · ${scene.durationSec.toFixed(1)}s`}
                          >
                            {scene.videoUrl ? (
                              <video src={scene.videoUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                            ) : (
                              <div className="w-full h-full bg-secondary flex items-center justify-center">
                                <Film className="h-3 w-3 text-muted-foreground" />
                              </div>
                            )}
                            <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[7px] text-white px-0.5 leading-tight truncate">
                              S{scene.sceneNumber}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {/* Overlay track */}
                <div className="border-b border-border/20" style={{ height: 52, opacity: trackStates.overlay.visible ? 1 : 0.3 }}>
                  <EmptyTrackLane label="Overlay" height={52} />
                </div>
                {/* Caption track */}
                <div className="border-b border-border/20" style={{ height: 52, opacity: trackStates.caption.visible ? 1 : 0.3 }}>
                  {config.subtitles?.enabled ? (
                    <div className="flex items-center h-full px-2">
                      <span className="text-[9px] text-amber-400/70 truncate">♪ Subtitles enabled — {config.subtitles.position || "bottom"}</span>
                    </div>
                  ) : (
                    <EmptyTrackLane label="Caption" height={52} />
                  )}
                </div>
                {/* Audio track */}
                <div style={{ height: 52, opacity: trackStates.audio.visible ? 1 : 0.3 }}>
                  {audioUrl ? (
                    <div className="h-full flex items-center px-2 gap-2">
                      <Music className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                      <span className="text-[9px] text-muted-foreground truncate">Master audio · {config.totalDuration.toFixed(1)}s</span>
                      {trackStates.audio.muted && <span className="text-[8px] text-destructive font-medium">MUTED</span>}
                    </div>
                  ) : (
                    <EmptyTrackLane label="Audio" height={52} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Drag-reorder scene strip */}
          <div className="glass-card overflow-hidden p-4 min-h-[180px]">
            <SceneTimeline
              scenes={config.orderedScenes}
              onReorder={config.handleReorder}
              onRemove={(sceneIndex) => {
                config.setOrderedScenes(prev => {
                  const idx = prev.findIndex(s => s.sceneIndex === sceneIndex);
                  if (idx === -1) return prev;
                  const updated = prev.filter(s => s.sceneIndex !== sceneIndex);
                  config.setTransitions(t => {
                    const newT = [...t];
                    const removeIdx = Math.min(idx, newT.length - 1);
                    if (removeIdx >= 0) newT.splice(removeIdx, 1);
                    return newT;
                  });
                  if (playback.activeSceneIndex !== null && playback.activeSceneIndex >= updated.length) {
                    playback.setActiveSceneIndex(updated.length > 0 ? updated.length - 1 : null);
                  }
                  return updated;
                });
              }}
              activeIndex={playback.isPlayingAll ? playback.playbackSceneIdx : playback.activeSceneIndex}
              onSelect={(idx) => {
                if (playback.isPlayingAll) return;
                playback.setActiveSceneIndex(idx);
                let cumTime = 0;
                for (let i = 0; i < idx; i++) cumTime += config.orderedScenes[i].durationSec;
                audioTimelineRef.current?.seekAndPlay(cumTime);
              }}
              scrubberPosition={playback.scrubberPosition}
              multiSelectMode={regen.multiSelectMode}
              selectedIndices={regen.selectedForRegen}
              onToggleSelect={regen.handleToggleSelect}
              onLyricEdit={(sceneIndex, newLyric) => {
                config.setOrderedScenes(prev =>
                  prev.map(s => s.sceneIndex === sceneIndex ? { ...s, lyricSegment: newLyric } : s)
                );
              }}
              onDownload={(scene) => downloadScene(scene)}
              masterWaveform={masterWaveform || undefined}
            />
          </div>

          {config.orderedScenes.length > 0 && (
            <div className="glass-card p-4">
              <AudioTrackTimeline
                ref={audioTimelineRef}
                audioUrl={trackStates.audio.muted ? null : audioUrl}
                audioFile={trackStates.audio.muted ? null : config.audioFile}
                scenes={config.orderedScenes}
                activeIndex={playback.isPlayingAll ? playback.playbackSceneIdx : playback.activeSceneIndex}
                onSelectScene={(idx) => { if (!playback.isPlayingAll) playback.setActiveSceneIndex(idx); }}
                scrubberPosition={playback.scrubberPosition}
                onUploadAudio={() => config.audioInputRef.current?.click()}
                uploadingAudio={config.uploadingAudio}
                onSeek={(timeSec) => {
                  if (playback.isPlayingAll && !audioUrl) { playback.seekTimerPlayback(timeSec); return; }
                  if (playback.isPlayingAll) return;
                  let cumulative = 0;
                  for (let i = 0; i < config.orderedScenes.length; i++) {
                    if (timeSec < cumulative + config.orderedScenes[i].durationSec) {
                      playback.setActiveSceneIndex(i);
                      const offsetInScene = timeSec - cumulative;
                      const video = playback.activeLayer === "A" ? videoARef.current : videoBRef.current;
                      if (video) {
                        video.src = config.orderedScenes[i].videoUrl;
                        video.onloadeddata = () => { video.currentTime = Math.min(offsetInScene, video.duration || 0); };
                        video.load();
                      }
                      playback.setScrubberPosition(timeSec);
                      break;
                    }
                    cumulative += config.orderedScenes[i].durationSec;
                  }
                }}
                onAutoAlign={(boundaries) => {
                  config.setOrderedScenes(prev => prev.map((scene, i) => {
                    const b = boundaries[i];
                    if (!b) return scene;
                    return { ...scene, durationSec: Math.max(0.5, b.endSec - b.startSec), timeStart: secondsToTime(b.startSec), timeEnd: secondsToTime(b.endSec) };
                  }));
                  toast.success(`Scenes auto-aligned to ${boundaries.length} audio peak boundaries`);
                }}
                onBoundaryDrag={(boundaries) => {
                  config.setOrderedScenes(prev => prev.map((scene, i) => {
                    const b = boundaries[i];
                    if (!b) return scene;
                    return { ...scene, durationSec: Math.max(0.5, b.endSec - b.startSec), timeStart: secondsToTime(b.startSec), timeEnd: secondsToTime(b.endSec) };
                  }));
                }}
                onPlaybackStateChange={playback.handleAudioPlaybackSync}
                externalPlay={playback.isPlayingAll}
                loop={playback.continuousPlay}
                persistedPeakData={persistedPeakData}
                transcriptWords={transcription?.words?.filter((w: any) => w.type === "word" || (!w.type && w.text?.trim())).map((w: any) => ({ text: w.text, start: w.start, end: w.end }))}
              />
            </div>
          )}
        </div>

        <div className="glass-card p-4 space-y-3 max-h-[600px] overflow-y-auto">
          {/* Markers Panel */}
          <MarkerList
            markers={markers}
            onAdd={handleAddMarker}
            onDelete={(id) => setMarkers(prev => prev.filter(m => m.id !== id))}
            onUpdate={(id, updates) => setMarkers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))}
            onSeek={(timeSec) => {
              playback.setScrubberPosition(timeSec);
              let cumTime = 0;
              for (let i = 0; i < config.orderedScenes.length; i++) {
                if (timeSec <= cumTime + config.orderedScenes[i].durationSec) {
                  playback.setActiveSceneIndex(i);
                  break;
                }
                cumTime += config.orderedScenes[i].durationSec;
              }
            }}
          />
          <Tabs defaultValue="transitions" className="w-full">
            <TabsList className="w-full grid grid-cols-5 h-8 text-[10px] sm:text-xs">
              <TabsTrigger value="transitions" className="text-xs">Transitions</TabsTrigger>
              <TabsTrigger value="text" className="text-xs">Text</TabsTrigger>
              <TabsTrigger value="filters" className="text-xs">Filters</TabsTrigger>
              <TabsTrigger value="audio" className="text-xs">Audio</TabsTrigger>
              <TabsTrigger value="vocal-sync" className="text-xs">Vocal Sync</TabsTrigger>
            </TabsList>

            <TabsContent value="transitions" className="mt-3">
              <SectionErrorBoundary name="Transitions" compact>
                <TransitionPicker transitions={config.transitions} sceneCount={config.orderedScenes.length} onChange={config.setTransitions} activeIndex={playback.activeSceneIndex} />
              </SectionErrorBoundary>
            </TabsContent>
            <TabsContent value="text" className="mt-3">
              <SectionErrorBoundary name="Text Overlays" compact>
                <TextOverlayPanel subtitles={config.subtitles} onSubtitlesChange={config.setSubtitles} titleCards={config.titleCards} onTitleCardsChange={config.setTitleCards} sceneCount={config.orderedScenes.length} />
              </SectionErrorBoundary>
            </TabsContent>
            <TabsContent value="filters" className="mt-3">
              <SectionErrorBoundary name="Filters" compact>
                <FilterPanel filter={config.filter} onChange={config.setFilter} />
              </SectionErrorBoundary>
            </TabsContent>
            <TabsContent value="audio" className="mt-3">
              <SectionErrorBoundary name="Audio Enhancement" compact>
                <AudioEnhancementPanel config={config.audioEnhancement} onChange={config.setAudioEnhancement} />
              </SectionErrorBoundary>
            </TabsContent>
            <TabsContent value="vocal-sync" className="mt-3">
              <SectionErrorBoundary name="Vocal Sync" compact>
                <VocalSyncEditorPanel
                  scenes={config.orderedScenes}
                  projectId={projectId}
                  audioUrl={audioUrl}
                  characterName={characterConcepts[selectedCharacterIndex]?.name}
                  activeSceneIndex={playback.activeSceneIndex}
                  onSelectScene={playback.setActiveSceneIndex}
                />
              </SectionErrorBoundary>
            </TabsContent>
          </Tabs>

        </div>
      </div>

      <RenderControls
        rendering={config.rendering}
        renderPhase={config.renderPhase}
        renderPercent={config.renderPercent}
        renderResult={config.renderResult}
        onCancel={config.handleCancelRender}
        onDownload={config.handleDownloadRender}
      />

      {/* ─── Per-scene trim editor ─── */}
      {config.orderedScenes.length > 0 && (
        <SectionErrorBoundary name="Scene Trim Editor" compact>
          <SceneTrimEditor
            scenes={config.orderedScenes}
            trims={sceneTrims}
            onChange={setSceneTrims}
          />
          <MergeDebugReportPanel
            projectId={projectId ?? null}
            audioUrl={audioUrl ?? null}
            audioDurationSec={
              typeof (config as unknown as { audioDuration?: number }).audioDuration === "number"
                ? (config as unknown as { audioDuration?: number }).audioDuration!
                : null
            }
            scenes={config.orderedScenes}
            trims={sceneTrims}
            mergeState={mergeState}
          />
          <MergeDebugComparePanel />
        </SectionErrorBoundary>
      )}

      {/* ─── Merge Assembly Panel ─── */}
      <MergeAssemblyPanel
        mergeState={mergeState}
        onMerge={handleStartMerge}
        onReset={resetMerge}
        sceneCount={config.orderedScenes.length}
        hasAllVideos={hasAllVideos}
        hasAudio={!!audioUrl}
        scenes={config.orderedScenes}
        projectId={projectId ?? null}
        audioUrl={audioUrl ?? null}
        audioDurationSec={
          typeof (config as unknown as { audioDuration?: number }).audioDuration === "number"
            ? (config as unknown as { audioDuration?: number }).audioDuration!
            : null
        }
        trims={sceneTrims}
        onForceRefresh={forceRefresh}
        isStuck={isStuck}
        refreshing={refreshing}
        cooldownRemainingMs={cooldownRemainingMs}
        lastPollAt={lastPollAt}
        lastPollSource={lastPollSource}
        autoRefreshOnStuck={autoRefreshOnStuck}
        onAutoRefreshChange={setAutoRefreshOnStuck}
        autoRefreshContinuous={autoRefreshContinuous}
        onAutoRefreshContinuousChange={setAutoRefreshContinuous}
        refreshAttempts={refreshAttempts}
        consecutiveFailures={consecutiveFailures}
        retryAttempts={retryAttempts}
        lastRetrySource={lastRetrySource}
        lastRetryAt={lastRetryAt}
        retryPending={retryPending}
        displayedProgress={mergeDisplayedProgress}
        progressSource={mergeProgressSource}
        progressLastRealAt={mergeProgressLastRealAt}
        onCancel={cancelMerge}
        canceling={mergeCanceling}
        autoRefreshSuspended={autoRefreshSuspended}
        onResumeAutoRefresh={resumeAutoRefresh}
        refreshHistory={refreshHistory}
        confidenceThresholds={confidenceThresholds}
        onConfidenceThresholdsChange={setConfidenceThresholds}
        onDownloadDebugReport={async () => {
          try {
            await downloadMergeDebugReportFor({
              projectId: projectId ?? null,
              audioUrl: audioUrl ?? null,
              audioDurationSec:
                typeof (config as unknown as { audioDuration?: number }).audioDuration === "number"
                  ? (config as unknown as { audioDuration?: number }).audioDuration!
                  : null,
              scenes: config.orderedScenes,
              trims: sceneTrims,
              mergeState,
            });
            toast.success("Merge debug report downloaded");
          } catch (e) {
            console.error("[debug-report] download failed", e);
            toast.error("Failed to build debug report");
          }
        }}
        onDownloadDebugCsv={async (mode: CsvExportMode) => {
          try {
            await downloadMergeDebugCsvFor(
              {
                projectId: projectId ?? null,
                audioUrl: audioUrl ?? null,
                audioDurationSec:
                  typeof (config as unknown as { audioDuration?: number }).audioDuration === "number"
                    ? (config as unknown as { audioDuration?: number }).audioDuration!
                    : null,
                scenes: config.orderedScenes,
                trims: sceneTrims,
                mergeState,
              },
              mode,
            );
            toast.success("Merge debug CSV downloaded");
          } catch (e) {
            console.error("[debug-csv] download failed", e);
            toast.error("Failed to build debug CSV");
          }
        }}
        onDownloadDebugZip={async () => {
          try {
            await downloadMergeDebugZipFor({
              projectId: projectId ?? null,
              audioUrl: audioUrl ?? null,
              audioDurationSec:
                typeof (config as unknown as { audioDuration?: number }).audioDuration === "number"
                  ? (config as unknown as { audioDuration?: number }).audioDuration!
                  : null,
              scenes: config.orderedScenes,
              trims: sceneTrims,
              mergeState,
            });
            toast.success("Merge debug ZIP downloaded");
          } catch (e) {
            console.error("[debug-zip] download failed", e);
            toast.error("Failed to build debug ZIP");
          }
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onPrev} className="gap-2 border-border text-foreground hover:bg-secondary">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
          </Button>
          <SaveProgressButton stepIndex={4} onBeforeSave={config.handleSave} />
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          <Button variant="outline" onClick={() => config.setSaveDialogOpen(true)} disabled={config.saving || config.rendering || config.orderedScenes.length === 0} className="gap-2 border-primary/30 text-primary hover:bg-primary/10 text-xs sm:text-sm">
            {config.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline">{config.saving ? "Saving…" : "Save Assembly"}</span>
            <span className="sm:hidden">{config.saving ? "…" : "Save"}</span>
          </Button>
          <RenderButton
            rendering={config.rendering}
            renderQuality={config.renderQuality}
            onQualityChange={config.setRenderQuality}
            onRender={config.handleRenderVideo}
            disabled={config.rendering || config.orderedScenes.length === 0}
          />
          <Button onClick={onNext} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            Export <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CharacterPickerDialog open={regen.charPickerOpen} onOpenChange={regen.setCharPickerOpen} onSelect={regen.handleRegenerateWithCharacter} />

      <SaveAssemblyDialog
        open={config.saveDialogOpen}
        onOpenChange={config.setSaveDialogOpen}
        sceneCount={config.orderedScenes.length}
        projectId={projectId}
        saving={config.saving}
        onSave={config.handleSave}
      />

      {/* ─── Past source EOF acknowledgement gate ─── */}
      <Dialog open={eofDialogOpen} onOpenChange={setEofDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Past source EOF — confirm before merge
            </DialogTitle>
            <DialogDescription>
              {eofWarnings.length} scene{eofWarnings.length === 1 ? "" : "s"} request a trim window
              that extends past the end of the source clip. The merge will freeze the last frame
              (or drop tail audio) for the overflow region. Review and acknowledge to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[260px] overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 space-y-1.5">
            {eofWarnings.map((w) => (
              <div
                key={w.sceneNumber}
                className="text-xs flex items-start justify-between gap-3 border-b border-destructive/10 pb-1.5 last:border-b-0 last:pb-0"
              >
                <span className="font-medium">Scene {w.sceneNumber}</span>
                <span className="text-muted-foreground text-right tabular-nums">
                  window {w.startSec.toFixed(2)}s → {(w.startSec + w.durationSec).toFixed(2)}s
                  <br />
                  source {w.sourceDurationSec.toFixed(2)}s
                  <span className="text-destructive font-medium">
                    {" "}(+{w.overflowSec.toFixed(2)}s past EOF)
                  </span>
                </span>
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={eofAckChecked}
              onCheckedChange={(v) => setEofAckChecked(v === true)}
              className="mt-0.5"
            />
            <span>
              I understand the listed scenes extend past their source clip and want to proceed with merge-assembly anyway.
            </span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEofDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!eofAckChecked}
              onClick={confirmEofAndMerge}
            >
              Acknowledge & start merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <style>{`
        @keyframes fadeBlackPulse {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
