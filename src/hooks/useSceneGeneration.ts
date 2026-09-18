/**
 * useSceneGeneration — Generation engine for storyboard scenes.
 * Orchestrates video submission, upscaling, audio caching, and realtime updates.
 * Delegates image generation to useImageGeneration and polling to useVideoPolling.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { composeBoundedVideoPrompt } from "@/lib/video-prompt";
import { type Scene } from "@/contexts/ProjectContext";
import { timeToSeconds, sliceAudioToWav } from "@/lib/audio-utils";
import { type UpscaleJobState, VIDEO_DURATION, safeErrorMsg } from "@/types/storyboard";
import { useVideoPolling } from "@/hooks/useVideoPolling";
import { useBatchGeneration } from "@/hooks/useBatchGeneration";
import { useImageGeneration, type UseImageGenerationParams } from "@/hooks/useImageGeneration";
import { sanitizeForSafetyChecker } from "@/lib/prompt-sanitizer";
import { assertLipSyncReady, evaluateLipSyncReadiness } from "@/lib/lip-sync-readiness";
import {
  NEGATIVE_PROMPT_BASE,
  buildArticulationBlock,
  buildFaceFramingLock,
} from "@/lib/prompt-builders/lip-sync-prompt";
import { buildContinuityLock } from "@/lib/character-continuity";

export interface UseSceneGenerationParams extends UseImageGenerationParams {
  persistSceneVideoUrl: (sceneNumber: number, videoUrl: string, quality: string) => void;
  audioUrl?: string;
  file?: File | null;
  globalProvider: string;
  referenceSceneIndex: number | null;
  confirmJob: (provider: string, count: number) => Promise<boolean>;
}

export function useSceneGeneration(params: UseSceneGenerationParams) {
  const {
    scenes, setScenes, projectId, userId,
    getCharacterImageUrl, persistSceneVideoUrl,
    audioUrl, file, globalProvider, referenceSceneIndex, confirmJob,
  } = params;

  // --- Image generation hook ---
  const img = useImageGeneration(params);
  const scenesRef = useRef<Scene[]>(scenes);
  scenesRef.current = scenes;

  // --- Polling hook ---
  const polling = useVideoPolling({
    setScenes,
    persistSceneVideoUrl,
    getSceneSnapshot: (index) => scenesRef.current[index],
  });
  const { videoJobs, setVideoJobs, pollTimers, videoProgressTimers, startVideoProgress, stopVideoProgress, cancelVideoJob, startPolling, reconnectActiveJobs, nudgeJob } = polling;

  // --- Realtime: render_jobs progress/status pushes ---
  // Subscribes to postgres_changes on render_jobs scoped to the current
  // project so progress/status/output updates land in the UI in ~ms instead
  // of waiting for the next poll tick. We don't trust the payload directly —
  // a successful realtime event simply nudges the existing polling tick,
  // which re-reads through job-status (RLS-safe, includes webhook-derived
  // fields) and runs the same state-machine rules (markDone/markFailed).
  // Polling stays armed as a fallback for when the websocket drops.
  // Exposes a coarse Connected / Disconnected indicator so the UI can show
  // a realtime status pill and warn the user when we drop back to polling.
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected" | "paused">("connecting");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);
  const hasEverConnectedRef = useRef(false);
  const inDisconnectEpisodeRef = useRef(false);
  const reconnectTokenRef = useRef(0); // bump to force the effect to re-subscribe
  const attemptRef = useRef(0);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_ATTEMPTS = 8;
  // After MAX_ATTEMPTS failures we enter "paused": auto-retry stops AND the
  // manual Reconnect button is disabled. The only way out is `resetRealtime`,
  // which explicitly resets the channel state (a user-acknowledged reset).
  const exhaustedRef = useRef(false);

  // Manual user action: cancel any pending backoff and re-subscribe immediately.
  // No-op while we're in the "paused" terminal state — the user must call
  // resetRealtime first to acknowledge the outage and reset the attempt counter.
  const reconnectRealtime = useCallback(() => {
    if (exhaustedRef.current) return;
    if (backoffTimerRef.current) { clearTimeout(backoffTimerRef.current); backoffTimerRef.current = null; }
    attemptRef.current = 0;
    setNextRetryAt(null);
    setReconnectAttempt((n) => n + 1);
    reconnectTokenRef.current += 1;
    setRealtimeStatus("connecting");
  }, []);

  // Explicit "reset" action exposed when the channel is paused. Clears the
  // exhausted flag, resets the attempt counter, and re-arms a fresh subscribe.
  const resetRealtime = useCallback(() => {
    if (backoffTimerRef.current) { clearTimeout(backoffTimerRef.current); backoffTimerRef.current = null; }
    exhaustedRef.current = false;
    attemptRef.current = 0;
    setNextRetryAt(null);
    setReconnectAttempt((n) => n + 1);
    reconnectTokenRef.current += 1;
    setRealtimeStatus("connecting");
  }, []);


  useEffect(() => {
    if (!projectId || !userId) return;
    setRealtimeStatus("connecting");
    let cancelled = false;
    const channel = supabase
      .channel(`render_jobs:project:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "render_jobs", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string } | undefined;
          if (row?.id) nudgeJob(row.id);
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
          attemptRef.current = 0;
          exhaustedRef.current = false;
          setNextRetryAt(null);
          if (inDisconnectEpisodeRef.current) {
            toast.success("Realtime reconnected — polling fallback no longer needed, live updates resumed");
            inDisconnectEpisodeRef.current = false;
          }
          hasEverConnectedRef.current = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // Warn once per disconnect episode, and only after we've actually been connected.
          if (hasEverConnectedRef.current && !inDisconnectEpisodeRef.current) {
            toast.warning("Realtime disconnected — falling back to polling", {
              description: "Auto-reconnecting with backoff. Click Reconnect to retry now.",
            });
            inDisconnectEpisodeRef.current = true;
          }
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap. Cap attempts at MAX_ATTEMPTS.
          if (attemptRef.current < MAX_ATTEMPTS) {
            setRealtimeStatus("disconnected");
            const next = attemptRef.current + 1;
            attemptRef.current = next;
            const delay = Math.min(30_000, 1000 * 2 ** (next - 1));
            setNextRetryAt(Date.now() + delay);
            if (backoffTimerRef.current) clearTimeout(backoffTimerRef.current);
            backoffTimerRef.current = setTimeout(() => {
              backoffTimerRef.current = null;
              setNextRetryAt(null);
              reconnectTokenRef.current += 1;
              setReconnectAttempt((n) => n + 1);
            }, delay);
          } else {
            // Terminal: give up auto-reconnecting until the user explicitly resets.
            exhaustedRef.current = true;
            setNextRetryAt(null);
            setRealtimeStatus("paused");
            if (hasEverConnectedRef.current) {
              toast.error("Realtime updates paused after repeated failures", {
                description: "Polling will continue. Click Reset to retry the realtime channel.",
              });
            }
          }
        }

      });
    return () => {
      cancelled = true;
      if (backoffTimerRef.current) { clearTimeout(backoffTimerRef.current); backoffTimerRef.current = null; }
      supabase.removeChannel(channel);
    };
  }, [projectId, userId, nudgeJob, reconnectAttempt]);




  // --- State ---
  const [upscaleJobs, setUpscaleJobs] = useState<Record<number, UpscaleJobState>>({});
  const upscalePollTimers = useRef<Record<number, NodeJS.Timeout>>({});
  const jobIdMap = useRef<Record<number, string>>({});
  const submittingVideoJobs = useRef<Record<number, boolean>>({});
  const freshlyGeneratedVideos = useRef<Set<number>>(new Set());
  const cachedAudioUrl = useRef<string | null>(null);
  const segmentAudioCache = useRef<Record<number, string>>({});

  // --- Audio Caching ---
  const getCachedAudioUrl = useCallback(async (): Promise<string | null> => {
    if (cachedAudioUrl.current) return cachedAudioUrl.current;
    if (audioUrl && audioUrl.startsWith("http")) { cachedAudioUrl.current = audioUrl; return audioUrl; }
    if (file && userId) {
      const ext = file.name?.split('.').pop() || 'mp3';
      const path = `${userId}/cached-audio/full-audio-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("media-uploads").upload(path, file, { upsert: true, contentType: file.type || "audio/mpeg" });
      if (!error) {
        const { data: signedData } = await supabase.storage.from("media-uploads").createSignedUrl(path, 7200);
        if (signedData?.signedUrl) { cachedAudioUrl.current = signedData.signedUrl; return signedData.signedUrl; }
      }
    }
    return null;
  }, [audioUrl, file, userId]);

  // Track overlap bleed metadata per scene for merge trimming
  const segmentBleedMap = useRef<Record<number, { leadBleedSec: number; tailBleedSec: number }>>({});

  const getSegmentAudioUrl = useCallback(async (sceneIndex: number): Promise<string | null> => {
    if (segmentAudioCache.current[sceneIndex]) return segmentAudioCache.current[sceneIndex];
    const scene = scenes[sceneIndex];
    if (!scene) return null;
    const startSec = timeToSeconds(scene.time_start || "0:00");
    let endSec = timeToSeconds(scene.time_end || "0:00");
    if (endSec <= startSec) return null;

    // IMPORTANT: Do NOT extend the segment with lead/tail bleed for video generation.
    // WAN 2.5 syncs the video to the supplied audio starting at t=0, so any lead bleed
    // would cause the generated lipsync/motion to be offset from the scene's actual
    // lyrics — i.e. "video generated, but not to the uploaded track". The bleed
    // concept only applies to the merge crossfade step, which must therefore use
    // zeroed bleed metadata for clips generated this way.
    segmentBleedMap.current[sceneIndex] = { leadBleedSec: 0, tailBleedSec: 0 };

    // FAL/WAN 2.5 enforces a 30-second max audio duration
    let finalEnd = endSec;
    if (finalEnd - startSec > 30) finalEnd = startSec + 30;

    const source = file || audioUrl;
    if (!source || !userId) return null;
    try {
      toast.info(`Preparing audio segment for scene ${sceneIndex + 1}…`);
      const wavBlob = await sliceAudioToWav(source, startSec, finalEnd);
      // Stamp the slice boundaries into the path so a stale cached URL can
      // never silently be reused for a scene whose timing has since changed.
      const startTag = Math.round(startSec * 100);
      const endTag = Math.round(finalEnd * 100);
      const path = `${userId}/segment-audio/scene-${scene.scene_number}-${startTag}-${endTag}-${Date.now()}.wav`;
      const { error } = await supabase.storage.from("media-uploads").upload(path, wavBlob, { upsert: true, contentType: "audio/wav" });
      if (error) return null;
      const { data: signedData } = await supabase.storage.from("media-uploads").createSignedUrl(path, 7200);
      if (signedData?.signedUrl) { segmentAudioCache.current[sceneIndex] = signedData.signedUrl; return signedData.signedUrl; }
    } catch (err) { console.error("Failed to slice/upload segment audio:", err); }
    return null;
  }, [scenes, file, audioUrl, userId]);


  const getActiveRenderJobCount = useCallback(async (): Promise<number | null> => {
    if (!userId) return null;
    const { count, error } = await supabase
      .from("render_jobs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["queued", "submitted", "processing"]);

    if (error) {
      console.warn("Failed to preflight active render job count:", error);
      return null;
    }

    return count ?? 0;
  }, [userId]);

  // --- Video Submission ---
  const submitVideoJob = useCallback(async (index: number, quality: "preview" | "hd" = "hd", modelOverride?: string, refSceneIdx?: number | null) => {
    const scene = scenes[index];
    if (!scene) return;
    if (scene.generatingVideo || submittingVideoJobs.current[index]) {
      toast.info(`Scene ${index + 1} video generation is already starting.`);
      return;
    }

    submittingVideoJobs.current[index] = true;

    try {
      if (projectId && userId) {
        const { data: activeSceneJob } = await supabase
          .from("render_jobs")
          .select("id, provider_task_id, status_url, response_url, quality, provider, progress, created_at")
          .eq("project_id", projectId)
          .eq("user_id", userId)
          .eq("scene_number", scene.scene_number)
          .in("status", ["queued", "submitted", "processing"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeSceneJob?.id && (activeSceneJob.provider_task_id || activeSceneJob.status_url)) {
          const resumeProvider = modelOverride || globalProvider || "wan-25";
          const resumeQuality = (activeSceneJob.quality as "preview" | "hd") || quality;
          setScenes(prev => prev.map((s, i) => i === index ? {
            ...s,
            generatingVideo: true,
            videoRequestId: activeSceneJob.provider_task_id || undefined,
            videoJobId: activeSceneJob.id,
            videoStatusUrl: activeSceneJob.status_url || undefined,
            videoResponseUrl: activeSceneJob.response_url || undefined,
            videoQuality: resumeQuality,
          } : s));
          startVideoProgress(index, { quality: resumeQuality, provider: resumeProvider });
          setVideoJobs(prev => ({
            ...prev,
            [index]: {
              ...prev[index],
              progress: Math.max(prev[index]?.progress || 0, activeSceneJob.progress || 2),
              status: "running",
              startedAt: activeSceneJob.created_at ? new Date(activeSceneJob.created_at).getTime() : Date.now(),
              realProgress: typeof activeSceneJob.progress === "number" ? activeSceneJob.progress : null,
              phase: "processing",
              phaseUpdatedAt: activeSceneJob.created_at || null,
              lastProvider: resumeProvider,
              lastQuality: resumeQuality,
            },
          }));
          jobIdMap.current[index] = activeSceneJob.id;
          startPolling(index, activeSceneJob.provider_task_id || activeSceneJob.id, activeSceneJob.status_url || undefined, activeSceneJob.response_url || undefined, activeSceneJob.id, resumeProvider);
          toast.info(`Reconnected to the running video job for scene ${index + 1}.`);
          return;
        }
      }

      const activeJobCount = await getActiveRenderJobCount();
      if (activeJobCount != null && activeJobCount >= 5) {
        toast.warning("You already have 5 video jobs running. Wait for one to finish before starting another.", { duration: 8000 });
        return;
      }

    const charImgUrl = await getCharacterImageUrl();
    // Auto-anchor: prefer the explicit refSceneIdx, otherwise fall back to the
    // project-level referenceSceneIndex, otherwise the first earlier scene with
    // a generated image. This keeps every WAN render visually consistent with
    // the established look even when the user hasn't manually pinned a ref.
    let effectiveRefIdx: number | null = refSceneIdx ?? null;
    if (effectiveRefIdx == null && referenceSceneIndex != null && referenceSceneIndex !== index) {
      effectiveRefIdx = referenceSceneIndex;
    }
    if (effectiveRefIdx == null) {
      for (let i = 0; i < index; i++) {
        if (scenes[i]?.imageUrl) { effectiveRefIdx = i; break; }
      }
    }
    const refScene = effectiveRefIdx != null ? scenes[effectiveRefIdx] : null;
    // CRITICAL: image_url is the first frame of the generated video (image-to-video model).
    // ALWAYS prefer the scene's own image so the video matches its thumbnail/storyboard.
    // The reference scene is only a fallback for visual-style anchoring when this scene
    // has no image yet, and the character image is the last resort.
    const imageForVideo = scene?.imageUrl || refScene?.imageUrl || charImgUrl || null;
    const resolvedModel = modelOverride || "wan-25";
    if (!imageForVideo && resolvedModel !== "musetalk-local") { toast.error(`No image found for scene ${index + 1}. Generate the scene image first.`); return; }

    // Cloud lip-sync options and R5B MuseTalk Local require an existing video + audio.
    const isLipsyncModel = resolvedModel === "sync-3" || resolvedModel === "sync-v2" || resolvedModel === "musetalk-local";
    const needsAudio = isLipsyncModel || resolvedModel === "sync-so";
    if (isLipsyncModel && !scene.videoUrl) {
      toast.error(`Scene ${index + 1} needs an existing video first. Generate with WAN 2.5, then apply lipsync.`);
      return;
    }

    // --- Pre-flight lip-sync readiness gate ---
    // Block submission for A-Roll lip-sync scenes whose framing/safety
    // settings would let the model crop out the face or break mouth sync.
    // B-Roll and pure lipsync-only models (which use existing video) skip
    // this gate since they have their own validation paths.
    if (!isLipsyncModel && resolvedModel !== "sync-so") {
      const gate = assertLipSyncReady(scene);
      if (gate.ok === false) {
        toast.error(
          `Scene ${index + 1} not lip-sync ready — ${gate.warnings.join("; ")}. Open Scene Director to fix.`,
          { duration: 10000 },
        );
        return;
      }
    }

    const resolvedModel_ = resolvedModel;
    const videoDuration = VIDEO_DURATION;
    const rawLyrics = scene.lyric_segment?.replace(/\s+/g, " ").trim() || "";
    // Strip adlibs (parenthesized text like "(yeah)", "(uh)", etc.) — keep only lead vocals
    const cleanedLyrics = rawLyrics.replace(/\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
    // Mask profanity / drug / weapon refs to avoid provider safety-checker rejections
    // (fal-kling's content_policy_violation breaks retries on otherwise valid scenes).
    const { sanitized: segmentLyrics, changed: lyricsSanitized, hits: sanitizedHits } =
      sanitizeForSafetyChecker(cleanedLyrics);
    if (lyricsSanitized) {
      console.info(`[scene ${index + 1}] Sanitized ${sanitizedHits.length} flagged term(s) for safety checker:`, sanitizedHits);
    }
    const wordCount = segmentLyrics ? segmentLyrics.split(/\s+/).filter(w => w.length > 0).length : 0;
    const isBroll = scene.is_broll === true;
    const isInstrumental = isBroll || wordCount < 3;
    const sceneGenre = scene.genre as string | undefined;
    const performVerb = sceneGenre === "Hip-Hop" ? "raps" : "sings";
    const brollPrompt = (scene as any).broll_prompt as string | undefined;
    const demeanour = (scene as any).demeanour as string | undefined;
    const lyricsDirective = isInstrumental
      ? (isBroll && brollPrompt
          ? `B-ROLL CUTAWAY: ${brollPrompt}. Character does NOT sing or rap. Mouth stays closed.`
          : "Instrumental section — character does NOT sing or move lips. Mouth stays closed or in a natural resting position.")
      : `Character ${performVerb}: "${segmentLyrics}".`;
    // Direction must belong to the current scene. The reference scene anchors
    // identity and continuity only; copying its action/visual prompt caused
    // later scenes to repeat scene 1's lyrics and staging.
    const actingNotes = scene.action_description || (isInstrumental ? "Character vibes to the music — head nods, sways gently, feels the beat." : "Passionate delivery with direct eye contact.");
    const demeanourDirective = demeanour ? `DEMEANOUR: ${demeanour}.` : "";
    const performanceDirection = `${lyricsDirective} ${actingNotes} ${demeanourDirective}`.trim();
    const visualPrompt = scene.visual_prompt || refScene?.visual_prompt;
    const cameraStyle = scene.camera_style || refScene?.camera_style;
    const startSec = timeToSeconds(scene.time_start || "0:00");
    const endSec = timeToSeconds(scene.time_end || "0:00");
    const segDuration = endSec > startSec ? (endSec - startSec).toFixed(1) : videoDuration.toString();
    const totalScenes = scenes.length;
    const scenePosition = `Scene ${index + 1} of ${totalScenes} (${scene.time_start}–${scene.time_end})`;

    // --- Lip-sync readiness / continuity blocks ---
    const readiness = evaluateLipSyncReadiness(scene);
    const isAroll = readiness.isARoll && !isInstrumental;
    const articulationBlock = buildArticulationBlock({
      lyric: segmentLyrics,
      durationSec: parseFloat(segDuration) || videoDuration,
      isARoll: isAroll,
      performVerb,
    });
    const faceFramingBlock = buildFaceFramingLock({
      isARoll: isAroll,
      shotSize: (scene as any)?.camera_direction?.shotSize,
    });
    // Character continuity lock — wardrobe + location pulled from reference
    // scene so outfits and environments stop drifting between A-Roll shots.
    const continuity = buildContinuityLock({
      scene,
      referenceScene: refScene as Scene | null,
      character: (await getCharacterImageUrl().then((url) => url ? { imageUrl: url, outfit: (scene as any)?.attire_override } : null)) as any,
    });

    const videoPrompt = composeBoundedVideoPrompt([
      { text: `PERFORMANCE DIRECTION: ${performanceDirection}`, maxChars: 350 },
      { text: articulationBlock || null, maxChars: 280 },
      { text: visualPrompt ? `VISUAL SCENE: ${visualPrompt}` : null, maxChars: 380 },
      { text: continuity.promptFragment ? continuity.promptFragment.trim() : null, maxChars: 120 },
      { text: `CONTINUITY: ${scenePosition}. One continuous segment of a full music video. Fill the entire ${segDuration}s with motion; no freeze frames or early stops.`, maxChars: 200 },
      { text: refScene && !continuity.enforced ? "CONSISTENCY: Match the reference identity, wardrobe, palette, and environment." : null, maxChars: 80 },
      { text: `TECHNICAL: ARRI Alexa, 35mm anamorphic, f/2, natural grain and skin texture. One continuous audio-reactive ${segDuration}s shot.`, maxChars: 190 },
      { text: "REALISM: Natural hair, fabric, blinks, breathing and weight shifts; no waxy skin, plastic eyes or uncanny stillness.", maxChars: 100 },
      { text: faceFramingBlock || (isBroll ? "FRAMING: Dynamic B-roll; no performer singing." : "FRAMING: Medium close-up, face 40-60% of frame."), maxChars: 110 },
      { text: isAroll ? null : (isInstrumental ? "FACE: Front-facing, mouth closed, natural blinks." : "FACE: Front-facing, mouth actively synced and fully visible."), maxChars: 100 },
      { text: isBroll ? "CAMERA: Organic dolly, handheld breath or crane drift." : "CAMERA: Locked or slow push-in; track the face without cuts or shake.", maxChars: 90 },
      { text: isInstrumental ? "BODY: Subtle rhythmic movement; no frozen pose." : "BODY: Natural breathing, weight shift and one grounded gesture.", maxChars: 80 },
      { text: cameraStyle, maxChars: 100 },
      { text: `NEGATIVE: ${NEGATIVE_PROMPT_BASE}`, maxChars: 180 },
    ]);



    // Final safety pass over the full composed prompt. Earlier we sanitized
    // only `segmentLyrics`, but raw lyrics can also reach the prompt via
    // LLM-generated fields (action_description, visual_prompt, broll_prompt)
    // that quote the original transcript verbatim. Re-running the sanitizer
    // on the joined string catches those leaks before fal's content_policy
    // checker rejects the job.
    const { sanitized: safeVideoPrompt, changed: promptSanitized, hits: promptHits } =
      sanitizeForSafetyChecker(videoPrompt);
    if (promptSanitized) {
      console.info(`[scene ${index + 1}] Final-pass sanitized ${promptHits.length} flagged term(s) in composed prompt:`, promptHits);
    }
    const finalVideoPrompt = safeVideoPrompt;

    setScenes(prev => prev.map((s, i) => i === index ? { ...s, generatingVideo: true, videoUrl: isLipsyncModel ? s.videoUrl : undefined, videoRequestId: undefined, videoJobId: undefined, videoQuality: isLipsyncModel ? s.videoQuality : undefined } : s));
    startVideoProgress(index, { quality, provider: resolvedModel });

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let resolvedImageUrl = imageForVideo;
      if (typeof imageForVideo === "string" && imageForVideo.startsWith("data:")) {
        try {
          const imgResp = await fetch(imageForVideo);
          const blob = await imgResp.blob();
          const ext = blob.type?.includes("png") ? "png" : "jpg";
          const path = `${userId}/scene-images/scene-${scene.scene_number}-${Date.now()}.${ext}`;
          await supabase.storage.from("media-uploads").upload(path, blob, { upsert: true, contentType: blob.type });
          const { data: signed } = await supabase.storage.from("media-uploads").createSignedUrl(path, 7200);
          if (signed?.signedUrl) resolvedImageUrl = signed.signedUrl;
        } catch (e) { console.warn("Failed to upload scene image for video job:", e); }
      }
      // Always (re)slice from current scene boundaries. We DO NOT fall back to
      // a stored segment_audio_url — a stale URL (older boundaries) would cause
      // the generated video to lipsync to the wrong portion of the track, i.e.
      // the lyrics shown for the scene wouldn't match the audio in the render.
      delete segmentAudioCache.current[index];
      let resolvedAudioUrl: string | null = null;
      try { resolvedAudioUrl = await getSegmentAudioUrl(index); } catch (audioErr) { console.warn(`Failed to get segment audio for scene ${index + 1}:`, audioErr); }
      if (!resolvedAudioUrl) {
        toast.error(`Scene ${index + 1}: could not prepare audio segment from uploaded track. Re-check scene timings.`);
        setScenes(prev => prev.map((s, i) => i === index ? { ...s, generatingVideo: false } : s));
        stopVideoProgress(index, "error");
        return;
      }
      // Persist the fresh per-scene slice so subsequent jobs/merge use the same audio.
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, segmentAudioUrl: resolvedAudioUrl!, segment_audio_url: resolvedAudioUrl! } as any : s));
      if (needsAudio && !resolvedAudioUrl) {
        toast.error(`Scene ${index + 1} needs audio. Ensure the scene has a valid audio segment.`);
        setScenes(prev => prev.map((s, i) => i === index ? { ...s, generatingVideo: false } : s));
        stopVideoProgress(index, "error");
        return;
      }
      const existingVideoUrl = isLipsyncModel ? scene.videoUrl : undefined;
      // Only forward audio to WAN 2.5 when this scene is a true A-Roll
      // lip-sync segment. WAN 2.5 drives mouth articulation from the audio
      // channel, so passing audio for B-Roll or instrumental scenes causes
      // the character to lip-sync to the instrumental (observed defect).
      // Lip-sync-dedicated models (Sync-3, Sync-v2, SadTalker) always need
      // audio and are handled server-side.
      const audioUrlForJob = isLipsyncModel || isAroll ? resolvedAudioUrl : null;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-video-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image_url: resolvedImageUrl, video_url: existingVideoUrl, audio_url: audioUrlForJob, prompt: finalVideoPrompt, duration: videoDuration, aspect_ratio: "16:9", quality, scene_number: scene.scene_number, project_id: projectId, model: resolvedModel_, tracking_id: scene.trackingId, audio_time_start: scene.time_start, audio_time_end: scene.time_end, is_broll: scene.is_broll === true, is_instrumental: isInstrumental, is_aroll: isAroll }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 429) { toast.warning(err.error || "Too many video jobs running.", { duration: 8000 }); setScenes(prev => prev.map((s, i) => i === index ? { ...s, generatingVideo: false } : s)); stopVideoProgress(index, "error"); return; }
        throw new Error(safeErrorMsg(err.error) || `Video submission failed (${resp.status})`);
      }
      const data = await resp.json();
      if (data.job_id) jobIdMap.current[index] = data.job_id;
      setScenes(prev => prev.map((s, i) => i === index ? {
        ...s,
        videoRequestId: data.request_id,
        videoJobId: data.job_id || data.request_id,
        videoStatusUrl: data.status_url,
        videoResponseUrl: data.response_url,
        videoQuality: quality,
      } : s));
      toast.success(resolvedModel_ === "musetalk-local"
        ? `Scene ${index + 1}: local MuseTalk lip sync queued on this PC.`
        : `${videoDuration}s video rendering for scene ${index + 1} (~1-2 min)…`);
      startPolling(index, data.request_id, data.status_url, data.response_url, data.job_id, resolvedModel_);
    } catch (err: any) {
      setScenes(prev => prev.map((s, i) => i === index ? { ...s, generatingVideo: false } : s));
      stopVideoProgress(index, "error");
      toast.error(err.message || "Failed to start video generation.");
    } finally {
      delete submittingVideoJobs.current[index];
    }
  }, [scenes, getActiveRenderJobCount, getCharacterImageUrl, userId, projectId, setScenes, startVideoProgress, stopVideoProgress, startPolling, getSegmentAudioUrl, referenceSceneIndex, globalProvider, setVideoJobs]);

  // --- Batch hook ---
  const batch = useBatchGeneration({ scenes, submitVideoJob, globalProvider, referenceSceneIndex, confirmJob });

  // --- Upscale ---
  const submitUpscaleJob = useCallback(async (index: number) => {
    const scene = scenes[index];
    if (!scene.videoUrl) { toast.error("No video to upscale."); return; }
    setUpscaleJobs(prev => ({ ...prev, [index]: { requestId: "", statusUrl: "", responseUrl: "", status: "submitting", progress: 0 } }));
    try {
      const resp = await supabase.functions.invoke("upscale-video", { body: { video_url: scene.videoUrl, project_id: projectId, scene_number: scene.scene_number } });
      if (resp.error) throw new Error(resp.error.message);
      const data = resp.data as any;
      if (data?.error) throw new Error(data.error);
      setUpscaleJobs(prev => ({ ...prev, [index]: { requestId: data.request_id, statusUrl: data.status_url, responseUrl: data.response_url, status: "processing", progress: 10 } }));
      toast.success(`Scene ${index + 1} upscale started.`);
      pollUpscaleJob(index, data.status_url, data.response_url);
    } catch (err: any) {
      setUpscaleJobs(prev => ({ ...prev, [index]: { ...prev[index], status: "failed", error: err.message } }));
      toast.error(`Upscale failed: ${err.message}`);
    }
  }, [scenes, projectId]);

  const pollUpscaleJob = useCallback((index: number, statusUrl: string, responseUrl: string) => {
    if (upscalePollTimers.current[index]) clearInterval(upscalePollTimers.current[index]);
    const timer = setInterval(async () => {
      try {
        const resp = await supabase.functions.invoke("check-job-status", { body: { provider: "fal", status_url: statusUrl, response_url: responseUrl } });
        const data = resp.data as any;
        const status = (data?.status || "").toUpperCase();
        if (status === "COMPLETED" || status === "SUCCEEDED") {
          clearInterval(upscalePollTimers.current[index]);
          const outputUrl = data?.videoUrl || data?.result?.video?.url;
          if (outputUrl) {
            setScenes(prev => prev.map((s, idx) => idx === index ? { ...s, videoUrl: outputUrl, videoQuality: "upscaled" as const } : s));
            freshlyGeneratedVideos.current.add(index);
            if (projectId && userId) {
              await supabase.from("scenes").update({ video_url: outputUrl, video_quality: "upscaled" } as any)
                .eq("project_id", projectId).eq("scene_number", scenes[index].scene_number).eq("user_id", userId);
            }
          }
          setUpscaleJobs(prev => ({ ...prev, [index]: { ...prev[index], status: "succeeded", progress: 100 } }));
          toast.success(`Scene ${index + 1} video upscaled!`);
        } else if (status === "FAILED") {
          clearInterval(upscalePollTimers.current[index]);
          setUpscaleJobs(prev => ({ ...prev, [index]: { ...prev[index], status: "failed", error: data?.error || "Upscale failed" } }));
          toast.error(`Scene ${index + 1} upscale failed.`);
        } else {
          setUpscaleJobs(prev => ({ ...prev, [index]: { ...prev[index], progress: Math.min(90, (prev[index]?.progress || 10) + 5) } }));
        }
      } catch { /* keep polling */ }
    }, 5000);
    upscalePollTimers.current[index] = timer;
  }, [scenes, projectId, userId, setScenes]);

  // --- Cleanup ---
  const cleanup = useCallback(() => {
    Object.values(pollTimers.current).forEach(t => { clearTimeout(t); clearInterval(t); });
    Object.values(videoProgressTimers.current).forEach(clearInterval);
    Object.values(upscalePollTimers.current).forEach(clearInterval);
  }, [pollTimers, videoProgressTimers]);

  const clearAllCache = useCallback(async () => {
    cleanup();
    cachedAudioUrl.current = null;
    jobIdMap.current = {};
    segmentAudioCache.current = {};
    setScenes(prev => prev.map(s => ({ ...s, imageUrl: undefined, videoUrl: undefined, videoQuality: undefined, generatingVideo: false, generatingImage: false, videoRequestId: undefined, videoJobId: undefined, videoStatusUrl: undefined, videoResponseUrl: undefined })));
    setVideoJobs({});
    if (projectId && userId) {
      await Promise.all([
        supabase.from("scenes").update({ scene_image_url: null, video_url: null, video_quality: null, lipsync_video_url: null, base_video_url: null, enhanced_video_url: null, performance_video_url: null, runway_task_id: null, last_generation_error: null } as any).eq("project_id", projectId).eq("user_id", userId),
        supabase.from("render_jobs").update({ status: "cancelled", error: "Cache cleared by user" } as any).eq("project_id", projectId).eq("user_id", userId).in("status", ["queued", "processing", "submitted"]),
        supabase.from("lipsync_jobs").update({ status: "cancelled", error_message: "Cache cleared by user" } as any).eq("project_id", projectId).eq("user_id", userId).in("status", ["queued", "processing", "submitted"]),
        supabase.from("generation_jobs").update({ status: "cancelled", error_message: "Cache cleared by user" } as any).eq("project_id", projectId).eq("user_id", userId).in("status", ["queued", "processing", "submitted"]),
      ]);
    }
    toast.success("All cache cleared. Pipeline ready for fresh generation.");
  }, [cleanup, projectId, userId, setScenes, setVideoJobs]);

  // --- Realtime handler ---
  const handleRealtimeUpdate = useCallback((payload: any) => {
    if (!polling.mountedRef.current) return;
    const row = payload.new as any;
    const sceneIdx = Object.entries(jobIdMap.current).find(([, jid]) => jid === row.id);
    if (!sceneIdx) return;
    const idx = parseInt(sceneIdx[0]);
    if (row.status === 'succeeded' && row.output?.video_url) {
      const sceneNum = scenes[idx]?.scene_number ?? idx + 1;
      setScenes(prev => prev.map((s, i) => i === idx ? { ...s, videoUrl: row.output.video_url, generatingVideo: false, videoRequestId: undefined, videoJobId: undefined, videoStatusUrl: undefined, videoResponseUrl: undefined, videoQuality: row.quality } : s));
      freshlyGeneratedVideos.current.add(idx);
      persistSceneVideoUrl(sceneNum, row.output.video_url, row.quality);
      stopVideoProgress(idx, "done");
      if (pollTimers.current[idx]) { clearInterval(pollTimers.current[idx]); delete pollTimers.current[idx]; }
      toast.success(`Scene ${idx + 1} video ready!`);
    } else if (row.status === 'failed') {
      setScenes(prev => prev.map((s, i) => i === idx ? { ...s, generatingVideo: false, videoRequestId: undefined, videoJobId: undefined, videoStatusUrl: undefined, videoResponseUrl: undefined } : s));
      stopVideoProgress(idx, "error");
      if (pollTimers.current[idx]) { clearInterval(pollTimers.current[idx]); delete pollTimers.current[idx]; }
      toast.error(safeErrorMsg(row.error) || `Video failed for scene ${idx + 1}.`);
    } else if (row.progress) {
      setVideoJobs(prev => ({ ...prev, [idx]: { ...prev[idx], progress: Math.max(prev[idx]?.progress || 0, row.progress), status: "running" } }));
    }
  }, [scenes, setScenes, persistSceneVideoUrl, stopVideoProgress, pollTimers, setVideoJobs, polling.mountedRef]);

  return {
    // Image generation (delegated)
    ...img,
    // Video state
    videoJobs, setVideoJobs,
    batchGenerating: batch.batchGenerating, batchProgress: batch.batchProgress,
    upscaleJobs,
    // Refs
    batchAbort: batch.batchAbort, jobIdMap, freshlyGeneratedVideos, cachedAudioUrl, segmentAudioCache,
    pollTimers, videoProgressTimers,
    // Video actions
    submitVideoJob, startPolling, cancelVideoJob, reconnectActiveJobs,
    startVideoProgress, stopVideoProgress,
    generateSelectedVideos: batch.generateSelectedVideos, generateAllVideos: batch.generateAllVideos, abortBatch: batch.abortBatch,
    submitUpscaleJob,
    getCachedAudioUrl, getSegmentAudioUrl,
    cleanup, clearAllCache,
    handleRealtimeUpdate,
    realtimeStatus,
    reconnectRealtime,
    resetRealtime,
    reconnectAttempt: attemptRef.current,
    nextRetryAt,

  };
}
