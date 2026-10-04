import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import type { TransitionConfig } from "@/components/assembly/TransitionPicker";
import type { AudioTrackTimelineHandle } from "@/components/assembly/AudioTrackTimeline";
import { timeToSeconds } from "@/lib/audio-utils";
import { getCachedBlobUrl } from "@/hooks/useVideoPreloader";

/** Pre-compute absolute start/end seconds for each scene */
function buildSceneTimings(scenes: SavedScene[]) {
  return scenes.map(s => ({
    startSec: timeToSeconds(s.timeStart),
    endSec: timeToSeconds(s.timeEnd),
  }));
}

/** Find which scene index contains the given time (using absolute positions) */
function findSceneAtTime(timings: { startSec: number; endSec: number }[], timeSec: number): number {
  for (let i = 0; i < timings.length; i++) {
    if (timeSec >= timings[i].startSec && timeSec < timings[i].endSec) return i;
  }
  // If past the last scene's end, return -1
  if (timings.length > 0 && timeSec >= timings[timings.length - 1].endSec) return -1;
  // If before any scene, find nearest
  for (let i = 0; i < timings.length; i++) {
    if (timeSec < timings[i].startSec) return i;
  }
  return -1;
}

export interface PlaybackState {
  isPlayingAll: boolean;
  playbackSceneIdx: number;
  playbackProgress: number;
  activeLayer: "A" | "B";
  transitioning: boolean;
  transitionStyle: string;
  loopFading: boolean;
  audioSyncPlaying: boolean;
  scrubberPosition: number;
  activeSceneIndex: number | null;
}

export interface UseAssemblyPlaybackOptions {
  orderedScenes: SavedScene[];
  transitions: TransitionConfig[];
  totalDuration: number;
  audioUrl: string | null;
  videoARef: React.RefObject<HTMLVideoElement>;
  videoBRef: React.RefObject<HTMLVideoElement>;
  audioTimelineRef: React.RefObject<AudioTrackTimelineHandle>;
}

export function useAssemblyPlayback({
  orderedScenes,
  transitions,
  totalDuration,
  audioUrl,
  videoARef,
  videoBRef,
  audioTimelineRef,
}: UseAssemblyPlaybackOptions) {
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [playbackSceneIdx, setPlaybackSceneIdx] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [activeLayer, setActiveLayer] = useState<"A" | "B">("A");
  const [transitioning, setTransitioning] = useState(false);
  const transitionStyle = "cut";
  const transitionTimerRef = useRef<number | null>(null);
  const loopCrossfadeRef = useRef(false);
  const [loopFading, setLoopFading] = useState(false);
  const [audioSyncPlaying, setAudioSyncPlaying] = useState(false);
  const [continuousPlay, setContinuousPlay] = useState(false);
  const continuousPlayRef = useRef(false);
  useEffect(() => { continuousPlayRef.current = continuousPlay; }, [continuousPlay]);
  const audioSyncSceneRef = useRef<number>(-1);
  const [activeSceneIndex, setActiveSceneIndex] = useState<number | null>(orderedScenes.length > 0 ? 0 : null);
  const [scrubberPosition, setScrubberPosition] = useState(0);

  // Pre-compute absolute time positions for each scene
  const sceneTimings = useMemo(() => buildSceneTimings(orderedScenes), [orderedScenes]);
  const playAllSceneRef = useRef<number>(-1);
  const timerOffsetRef = useRef<number>(0);
  const timerWallRef = useRef<number>(0);
  const activeLayerRef = useRef(activeLayer);
  const mountedRef = useRef(true);
  useEffect(() => { activeLayerRef.current = activeLayer; }, [activeLayer]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Load video source on layer A when a scene is selected (non-playback mode)
  useEffect(() => {
    if (isPlayingAll) return;
    const video = videoARef.current;
    if (!video) return;
    const currentScene = activeSceneIndex !== null ? orderedScenes[activeSceneIndex] : null;
    if (currentScene?.videoUrl) {
      video.src = getCachedBlobUrl(currentScene.videoUrl) || currentScene.videoUrl;
      video.loop = false;
      video.load();
    } else {
      video.removeAttribute("src");
    }
  }, [isPlayingAll, activeSceneIndex, orderedScenes]);

  // Intra-scene loop crossfade — only for audio-scrub mode, NOT Play All
  // During Play All the timer/audio engine handles scene transitions
  useEffect(() => {
    if (!audioSyncPlaying || isPlayingAll) {
      loopCrossfadeRef.current = false;
      setLoopFading(false);
      return;
    }

    const currentVideo = activeLayer === "A" ? videoARef.current : videoBRef.current;
    if (!currentVideo) return;

    const CROSSFADE_LEAD = 0.6;
    const CROSSFADE_DUR = 500;

    const checkLoop = () => {
      if (!currentVideo || currentVideo.paused) return;
      const vidDur = currentVideo.duration;
      const vidTime = currentVideo.currentTime;
      if (!vidDur || !isFinite(vidDur) || vidDur < 1) return;

      const timeLeft = vidDur - vidTime;

      if (timeLeft <= CROSSFADE_LEAD && timeLeft > 0 && !loopCrossfadeRef.current) {
        loopCrossfadeRef.current = true;
        setLoopFading(true);

        const nextLayer = activeLayer === "A" ? "B" : "A";
        const nextVideo = nextLayer === "A" ? videoARef.current : videoBRef.current;
        if (nextVideo) {
          nextVideo.src = currentVideo.src;
          nextVideo.muted = !!audioUrl;
          nextVideo.currentTime = 0;
          nextVideo.load();
          nextVideo.play().catch(() => {});
        }

        setTimeout(() => {
          currentVideo.pause();
          setActiveLayer(nextLayer);
          setLoopFading(false);
          loopCrossfadeRef.current = false;
        }, CROSSFADE_DUR);
      }
    };

    const interval = setInterval(checkLoop, 100);
    return () => clearInterval(interval);
  }, [isPlayingAll, audioSyncPlaying, activeLayer]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current); };
  }, []);

  const playOnLayer = useCallback((layer: "A" | "B", sceneIdx: number) => {
    const video = layer === "A" ? videoARef.current : videoBRef.current;
    const scene = orderedScenes[sceneIdx];
    if (!video || !scene) return;
    video.src = getCachedBlobUrl(scene.videoUrl) || scene.videoUrl;
    video.loop = true; // Loop to prevent blackout when video < scene duration
    video.load();
    video.play().catch(() => {});
  }, [orderedScenes]);

  const startPlayback = useCallback(() => {
    const startIdx = activeSceneIndex !== null && activeSceneIndex >= 0 && activeSceneIndex < orderedScenes.length
      ? activeSceneIndex : 0;
    // Use absolute time position from scene timing
    const startTimeSec = sceneTimings[startIdx]?.startSec ?? 0;
    setPlaybackSceneIdx(startIdx);
    setActiveSceneIndex(startIdx);
    setPlaybackProgress(totalDuration > 0 ? (startTimeSec / totalDuration) * 100 : 0);
    setScrubberPosition(startTimeSec);
    setActiveLayer("A");
    setTransitioning(false);
    setIsPlayingAll(true);
    playAllSceneRef.current = -1;
    timerOffsetRef.current = startTimeSec;
    playOnLayer("A", startIdx);
    if (videoBRef.current) { videoBRef.current.pause(); videoBRef.current.removeAttribute("src"); }
    // Seek audio to the correct position when starting from a non-zero scene
    if (audioUrl && audioTimelineRef.current && startTimeSec > 0) {
      audioTimelineRef.current.seekAndPlay(startTimeSec);
    }
  }, [playOnLayer, activeSceneIndex, orderedScenes, totalDuration, audioUrl]);

  // Seekable timer offset for fallback engine
  const seekTimerPlayback = useCallback((timeSec: number) => {
    timerOffsetRef.current = timeSec;
    timerWallRef.current = performance.now();

    const idx = findSceneAtTime(sceneTimings, timeSec);
    if (idx >= 0) {
      const offsetInScene = timeSec - sceneTimings[idx].startSec;
      setActiveSceneIndex(idx);
      setPlaybackSceneIdx(idx);
      setScrubberPosition(timeSec);
      playAllSceneRef.current = idx;

      const curLayer = activeLayerRef.current;
      const video = curLayer === "A" ? videoARef.current : videoBRef.current;
      if (video) {
        video.src = getCachedBlobUrl(orderedScenes[idx].videoUrl) || orderedScenes[idx].videoUrl;
        video.muted = !!audioUrl;
        video.loop = true;
        video.load();
        video.play().then(() => {
          video.currentTime = Math.min(offsetInScene, video.duration || 0);
        }).catch(() => {});
      }
    }
  }, [orderedScenes, sceneTimings]);

  // Timer-based fallback playback engine (no audio track)
  useEffect(() => {
    if (!isPlayingAll || audioUrl) return;

    timerWallRef.current = performance.now();
    // timerOffsetRef is pre-set by startPlayback to the correct scene offset
    let cancelled = false;

    const tick = () => {
      if (cancelled || !mountedRef.current) return;
      const elapsed = timerOffsetRef.current + (performance.now() - timerWallRef.current) / 1000;

      const targetIdx = findSceneAtTime(sceneTimings, elapsed);

      if (targetIdx < 0) {
        const curLayer = activeLayerRef.current;
        const video = curLayer === "A" ? videoARef.current : videoBRef.current;
        if (video) video.pause();
        if (continuousPlayRef.current) {
          timerOffsetRef.current = 0;
          timerWallRef.current = performance.now();
          playAllSceneRef.current = -1;
          if (mountedRef.current) {
            setPlaybackSceneIdx(0);
            setActiveSceneIndex(0);
            setScrubberPosition(0);
            setPlaybackProgress(0);
          }
          requestAnimationFrame(tick);
          return;
        }
        if (mountedRef.current) {
          setIsPlayingAll(false);
          setPlaybackProgress(100);
        }
        toast.success("Preview complete");
        return;
      }

      setPlaybackProgress(totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0);
      setScrubberPosition(elapsed);
      setActiveSceneIndex(targetIdx);
      setPlaybackSceneIdx(targetIdx);

      if (playAllSceneRef.current !== targetIdx) {
        const isFirst = playAllSceneRef.current === -1;
        playAllSceneRef.current = targetIdx;

        if (!isFirst) {
          const curLayer = activeLayerRef.current;
          const nextLayer = curLayer === "A" ? "B" : "A";
          const nextVideo = nextLayer === "A" ? videoARef.current : videoBRef.current;
          if (nextVideo) {
            nextVideo.src = getCachedBlobUrl(orderedScenes[targetIdx].videoUrl) || orderedScenes[targetIdx].videoUrl;
            nextVideo.loop = true;
            nextVideo.muted = !!audioUrl;
            nextVideo.load();
            nextVideo.play().catch(() => {});
          }
          const oldVideo = curLayer === "A" ? videoARef.current : videoBRef.current;
          if (oldVideo) oldVideo.pause();
          setActiveLayer(nextLayer);
        }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => { cancelled = true; };
  }, [isPlayingAll, audioUrl, orderedScenes, totalDuration]);

  // Audio-driven playback engine for Play All mode
  const handlePlayAllAudioSync = useCallback((state: { isPlaying: boolean; timeSec: number }) => {
    if (!isPlayingAll || !mountedRef.current) return;

    if (!state.isPlaying) {
      const video = activeLayer === "A" ? videoARef.current : videoBRef.current;
      if (video) video.pause();
      setIsPlayingAll(false);
      setPlaybackProgress(100);
      return;
    }

    const targetSceneIdx = findSceneAtTime(sceneTimings, state.timeSec);

    if (targetSceneIdx < 0) {
      if (continuousPlayRef.current && audioUrl && audioTimelineRef.current) {
        // Loop: seek audio back to start
        audioTimelineRef.current.seekAndPlay(0);
        playAllSceneRef.current = -1;
        return;
      }
      const video = activeLayer === "A" ? videoARef.current : videoBRef.current;
      if (video) video.pause();
      setIsPlayingAll(false);
      setPlaybackProgress(100);
      toast.success("Preview complete");
      return;
    }

    setPlaybackProgress(totalDuration > 0 ? (state.timeSec / totalDuration) * 100 : 0);
    setScrubberPosition(state.timeSec);
    setActiveSceneIndex(targetSceneIdx);
    setPlaybackSceneIdx(targetSceneIdx);

    if (playAllSceneRef.current !== targetSceneIdx) {
      const isFirst = playAllSceneRef.current === -1;
      playAllSceneRef.current = targetSceneIdx;

      if (!isFirst) {
        const nextLayer = activeLayer === "A" ? "B" : "A";
        const nextVideo = nextLayer === "A" ? videoARef.current : videoBRef.current;
        if (nextVideo) {
          nextVideo.src = getCachedBlobUrl(orderedScenes[targetSceneIdx].videoUrl) || orderedScenes[targetSceneIdx].videoUrl;
          nextVideo.loop = true;
          nextVideo.muted = !!audioUrl;
          nextVideo.load();
          nextVideo.play().catch(() => {});
        }
        const oldVideo = activeLayer === "A" ? videoARef.current : videoBRef.current;
        if (oldVideo) oldVideo.pause();
        setActiveLayer(nextLayer);
      }
    }
  }, [isPlayingAll, activeLayer, orderedScenes, totalDuration]);

  const handlePlayAll = useCallback(() => {
    if (isPlayingAll) {
      (activeLayer === "A" ? videoARef.current : videoBRef.current)?.pause();
      setIsPlayingAll(false);
    } else {
      startPlayback();
    }
  }, [isPlayingAll, activeLayer, startPlayback]);

  const handleRestart = useCallback(() => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    setTransitioning(false);
    startPlayback();
  }, [startPlayback]);

  /** Skip to the next scene during Play All playback */
  const handleSkipScene = useCallback(() => {
    if (!isPlayingAll) return;
    const nextIdx = playbackSceneIdx + 1;
    if (nextIdx >= orderedScenes.length) {
      const video = activeLayer === "A" ? videoARef.current : videoBRef.current;
      if (video) video.pause();
      setIsPlayingAll(false);
      setPlaybackProgress(100);
      toast.success("Preview complete");
      return;
    }

    const nextStartSec = sceneTimings[nextIdx]?.startSec ?? 0;

    if (audioUrl && audioTimelineRef.current) {
      audioTimelineRef.current.seekAndPlay(nextStartSec);
    } else {
      timerOffsetRef.current = nextStartSec;
      timerWallRef.current = performance.now();
      setPlaybackSceneIdx(nextIdx);
      setActiveSceneIndex(nextIdx);
      setScrubberPosition(nextStartSec);
      playAllSceneRef.current = nextIdx;

      const curLayer = activeLayerRef.current;
      const nextLayer = curLayer === "A" ? "B" : "A";
      const nextVideo = nextLayer === "A" ? videoARef.current : videoBRef.current;
      if (nextVideo) {
        nextVideo.src = getCachedBlobUrl(orderedScenes[nextIdx].videoUrl) || orderedScenes[nextIdx].videoUrl;
        nextVideo.loop = true;
        nextVideo.muted = !!audioUrl;
        nextVideo.load();
        nextVideo.play().catch(() => {});
      }
      const oldVideo = curLayer === "A" ? videoARef.current : videoBRef.current;
      if (oldVideo) oldVideo.pause();
      setActiveLayer(nextLayer);
    }
  }, [isPlayingAll, playbackSceneIdx, orderedScenes, activeLayer, audioUrl]);

  // Audio-driven video sync (scrub + Play All combined handler)
  const handleAudioPlaybackSync = useCallback((state: { isPlaying: boolean; timeSec: number }) => {
    if (isPlayingAll) {
      handlePlayAllAudioSync(state);
      return;
    }

    if (!state.isPlaying) {
      if (audioSyncPlaying) {
        const video = activeLayer === "A" ? videoARef.current : videoBRef.current;
        if (video) video.pause();
        setAudioSyncPlaying(false);
        audioSyncSceneRef.current = -1;
      }
      return;
    }

    let targetSceneIdx = findSceneAtTime(sceneTimings, state.timeSec);
    const offsetInScene = targetSceneIdx >= 0 ? state.timeSec - sceneTimings[targetSceneIdx].startSec : 0;

    if (targetSceneIdx < 0) {
      targetSceneIdx = orderedScenes.length - 1;
      if (targetSceneIdx < 0) return;
    }

    setActiveSceneIndex(targetSceneIdx);
    setScrubberPosition(state.timeSec);
    setAudioSyncPlaying(true);

    if (audioSyncSceneRef.current !== targetSceneIdx) {
      const isFirstScene = audioSyncSceneRef.current === -1;
      audioSyncSceneRef.current = targetSceneIdx;
      const scene = orderedScenes[targetSceneIdx];
      if (!scene) return;

      if (isFirstScene) {
        const video = activeLayer === "A" ? videoARef.current : videoBRef.current;
        if (video) {
          video.muted = !!audioUrl;
          video.src = getCachedBlobUrl(scene.videoUrl) || scene.videoUrl;
          video.loop = true;
          video.load();
          video.play().then(() => {
            if (offsetInScene > 0.1 && video.duration > 0) {
              video.currentTime = Math.min(offsetInScene, video.duration);
            }
          }).catch(() => {});
        }
      } else {
        const nextLayer = activeLayer === "A" ? "B" : "A";
        const nextVideo = nextLayer === "A" ? videoARef.current : videoBRef.current;
        if (nextVideo) {
          nextVideo.muted = !!audioUrl;
          nextVideo.src = getCachedBlobUrl(scene.videoUrl) || scene.videoUrl;
          nextVideo.loop = true;
          nextVideo.load();
          nextVideo.play().then(() => {
            if (offsetInScene > 0.1 && nextVideo.duration > 0) {
              nextVideo.currentTime = Math.min(offsetInScene, nextVideo.duration);
            }
          }).catch(() => {});
        }
        const oldVideo = activeLayer === "A" ? videoARef.current : videoBRef.current;
        if (oldVideo) oldVideo.pause();
        setActiveLayer(nextLayer);
      }
    }
  }, [isPlayingAll, handlePlayAllAudioSync, audioSyncPlaying, activeLayer, orderedScenes]);

  // CSS for transition effects
  const getTransitionCSS = useCallback((type: string, dur: number, entering: boolean): React.CSSProperties => {
    const base: React.CSSProperties = { transition: `all ${dur}s ease-in-out`, position: "absolute", inset: 0 };
    if (type === "crossfade") return { ...base, opacity: entering ? 1 : 0 };
    if (type === "fade-black") return { ...base, opacity: entering ? 1 : 0 };
    if (type === "wipe-left") return { ...base, clipPath: entering ? "inset(0 0 0 0)" : "inset(0 0 0 100%)" };
    if (type === "wipe-right") return { ...base, clipPath: entering ? "inset(0 0 0 0)" : "inset(0 100% 0 0)" };
    return { ...base, opacity: entering ? 1 : 0, transition: "none" };
  }, []);

  // Compute dual-layer visibility
  const currentTrans = transitions[playbackSceneIdx] || { type: "cut", durationSec: 0.5 };
  const makeLayerStyle = useCallback((layer: "A" | "B"): React.CSSProperties => {
    const isActive = isPlayingAll || audioSyncPlaying;
    if (!isActive) {
      return layer === "A"
        ? { position: "absolute", inset: 0 }
        : { position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" };
    }
    const isCurrent = activeLayer === layer;

    if (loopFading && !transitioning) {
      return {
        position: "absolute", inset: 0,
        transition: "opacity 0.5s ease-in-out",
        opacity: isCurrent ? 0 : 1,
      };
    }

    if (!transitioning) {
      return isCurrent
        ? { position: "absolute", inset: 0, opacity: 1 }
        : { position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" };
    }
    return getTransitionCSS(currentTrans.type, currentTrans.durationSec, !isCurrent);
  }, [isPlayingAll, audioSyncPlaying, activeLayer, loopFading, transitioning, currentTrans, getTransitionCSS]);

  return {
    // State
    isPlayingAll,
    playbackSceneIdx,
    playbackProgress,
    activeLayer,
    transitioning,
    transitionStyle,
    loopFading,
    audioSyncPlaying,
    scrubberPosition,
    activeSceneIndex,
    currentTrans,
    continuousPlay,
    // State setters
    setActiveSceneIndex,
    setScrubberPosition,
    setPlaybackProgress,
    setContinuousPlay,
    // Actions
    handlePlayAll,
    handleRestart,
    handleSkipScene,
    handleAudioPlaybackSync,
    seekTimerPlayback,
    // Helpers
    makeLayerStyle,
    getTransitionCSS,
  };
}
