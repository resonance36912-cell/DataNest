import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { timeToSeconds, secondsToTime } from "@/lib/audio-utils";
import { supabase } from "@/integrations/supabase/client";
import { Scene, useProject } from "@/contexts/ProjectContext";
import { canGenerateDownstream, alignReferenceLinesToTimings } from "@/lib/lyrics-alignment";
import { loadFilteredLyricLines } from "@/lib/prompt-filter";
import { sanitizeAspectRatio, sanitizeVisualStyle, TRACK_DETAIL_LIMITS, parseTrackDetailsRejection } from "@/lib/track-details";
import { parseTierRequired } from "@/lib/tierRequired";
import { reportTierRequired } from "@/lib/invokeGated";
import type { PersistScenesOptions } from "@/hooks/useScenePersistence";

interface UseStoryboardHandlersArgs {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  projectId: string | null;
  userId: string | undefined;
  verification: any;
  setVerification?: (v: any) => void;
  characterPayload: any;
  sceneTheme: string;
  sceneGenre: string;
  sceneLocation: string;
  lockSetting: boolean;
  lockSettingLocation: string;
  audioSegments: any[] | undefined;
  transcription: any;
  savedSceneIndices: number[];
  setSavedSceneIndices: React.Dispatch<React.SetStateAction<number[]>>;
  gen: any;
  persistScenesToDb: (scenes: Scene[], options?: PersistScenesOptions) => Promise<void>;
}

export function useStoryboardHandlers({
  scenes, setScenes, projectId, userId,
  verification, setVerification, characterPayload, sceneTheme, sceneGenre, sceneLocation,
  lockSetting, lockSettingLocation, audioSegments, transcription,
  savedSceneIndices, setSavedSceneIndices,
  gen, persistScenesToDb,
}: UseStoryboardHandlersArgs) {
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const [generating, setGenerating] = useState(false);
  const [regeneratingScene, setRegeneratingScene] = useState<number | null>(null);
  const [sceneRatings, setSceneRatings] = useState<Record<number, number>>({});
  const [sceneComments, setSceneComments] = useState<Record<number, string>>({});
  const [activeReviewIndex, setActiveReviewIndex] = useState(0);
  const [sceneApproved, setSceneApproved] = useState<Record<number, boolean>>({});
  const [editingTime, setEditingTime] = useState<{ sceneIdx: number; field: "start" | "end"; value: string } | null>(null);
  const [pendingFalDelete, setPendingFalDelete] = useState<number | null>(null);
  const [downloadingSceneIdx, setDownloadingSceneIdx] = useState<number | null>(null);

  // Per-segment generation status: indexed by audioSegment index.
  type SegState = "generating" | "success" | "error";
  const [segmentStatus, setSegmentStatus] = useState<Record<number, { state: SegState; error?: string; at: number }>>({});
  const markSegments = (indices: number[], state: SegState, error?: string) => {
    if (!indices.length) return;
    const at = Date.now();
    setSegmentStatus(prev => {
      const next = { ...prev };
      indices.forEach(i => { next[i] = { state, error, at }; });
      return next;
    });
  };


  const commentDebounceTimers = useRef<Record<number, NodeJS.Timeout>>({});
  const downloadingRef = useRef<Set<number>>(new Set());

  const snapToWord = useCallback((timeSec: number): number => {
    if (!transcription?.words?.length) return timeSec;
    let closest = timeSec;
    let minDist = Infinity;
    for (const w of transcription.words) {
      for (const t of [w.start, w.end]) {
        const dist = Math.abs(t - timeSec);
        if (dist < minDist) { minDist = dist; closest = t; }
      }
    }
    return minDist <= 0.5 ? closest : timeSec;
  }, [transcription]);

  const commitTimeEdit = useCallback(() => {
    if (!editingTime) return;
    const { sceneIdx, field, value } = editingTime;
    const sec = timeToSeconds(value);
    const snapped = snapToWord(sec);
    const newTime = secondsToTime(snapped);
    setScenes(prev => prev.map((s, idx) => idx === sceneIdx ? { ...s, [field === "start" ? "time_start" : "time_end"]: newTime } : s));
    if (snapped !== sec) toast.info(`Snapped to word boundary: ${newTime}`);
    setEditingTime(null);
  }, [editingTime, snapToWord, setScenes]);

  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [3000, 6000]; // ms

  const project = useProject();
  const { setServerTrackDetailIssues } = project;

  const generateScenes = async (rawIndices?: Set<number> | number[] | any) => {
    if (!verification) { toast.error("No song analysis available. Please complete previous steps."); return; }
    if (!audioSegments?.length) { toast.error("Audio not segmented yet. Please segment audio in the Analysis step first."); return; }

    // VERIFIED_LYRICS_LOCK gate — refuse to author scenes from unverified ASR.
    if (!canGenerateDownstream(project.transcriptLockStatus, project.transcriptQualityStatus)) {
      toast.error("Transcript is not verified yet. Fix lyrics before generating scenes.", {
        description: "Open the Verified Lyrics Lock panel in the Analysis step, paste your reference lyrics, and click 'Mark verified'.",
        duration: 8000,
      });
      return;
    }

    // Normalise to Set for safe .has() usage — handle any input type defensively
    let onlyIndices: Set<number> | undefined;
    if (rawIndices != null) {
      if (rawIndices instanceof Set) {
        onlyIndices = rawIndices;
      } else if (Array.isArray(rawIndices)) {
        onlyIndices = new Set(rawIndices as number[]);
      } else if (typeof rawIndices === "object" && typeof rawIndices[Symbol.iterator] === "function") {
        onlyIndices = new Set(rawIndices);
      } else {
        console.warn("[generateScenes] Invalid onlyIndices, generating all scenes", rawIndices);
        onlyIndices = undefined;
      }
    }
    const segmentsToSend = onlyIndices
      ? audioSegments.filter((_, i) => onlyIndices!.has(i))
      : audioSegments;
    if (segmentsToSend.length === 0) { toast.info("No segments selected."); return; }
    const targetSegIndices = segmentsToSend.map(s => s.index);
    markSegments(targetSegIndices, "generating");
    setGenerating(true);


    // Clip verified word timings into each segment window so the storyline
    // model can author per-line shot notes anchored to real audio time.
    const allWords: Array<{ text: string; start: number; end: number }> =
      Array.isArray(transcription?.words) ? transcription.words : [];
    const wordsForSegment = (start: number, end: number) =>
      allWords
        .filter((w) => typeof w.start === "number" && w.start >= start - 0.05 && w.start < end + 0.05)
        .map((w) => ({ text: String(w.text ?? ""), start: +Number(w.start).toFixed(3), end: +Number(w.end ?? w.start).toFixed(3) }));

    // VERIFIED_LYRICS_LOCK: when the user locked a verified transcript, replace
    // each segment's ASR-derived lyrics with the slice of the locked reference
    // that falls inside the segment window — ASR drives timing, reference owns
    // the words.
    const lockedRef = project.referenceTranscript?.trim();
    const useLocked = !!lockedRef && project.transcriptLockStatus !== "unlocked";
    const alignedLines = useLocked
      ? alignReferenceLinesToTimings(lockedRef!, allWords, audioSegments[audioSegments.length - 1]?.end_sec)
      : [];

    // PROMPT_FILTERS: when the user opted in, mirror the transcript-export
    // filters (skip-empty + min-confidence) onto the lyrics fed to the AI so
    // the generated prompts line up with what they'll export.
    const promptFilters = project.promptFilterSettings;
    const usePromptFilters = !!(
      promptFilters?.enabled &&
      (promptFilters.skip_empty || promptFilters.min_confidence_enabled) &&
      projectId && project.activeTranscriptVersionId
    );
    let allowedWindows: Array<{ start: number; end: number }> = [];
    if (usePromptFilters) {
      try {
        const res = await loadFilteredLyricLines(projectId!, project.activeTranscriptVersionId!, promptFilters);
        allowedWindows = res.lines
          .filter((l) => l.start_sec != null && l.end_sec != null)
          .map((l) => ({ start: l.start_sec as number, end: l.end_sec as number }));
        if (res.excludedCount > 0) {
          toast.info(`Prompt filters dropped ${res.excludedCount}/${res.totalCount} lyric line${res.excludedCount === 1 ? "" : "s"} before generation.`);
        }
      } catch (err) {
        console.warn("[generateScenes] prompt filters failed to load, falling back to raw lyrics:", err);
      }
    }

    const intersectsAllowed = (start: number, end: number) =>
      allowedWindows.some((w) => w.start < end - 0.05 && w.end > start + 0.05);

    const lyricsForSegment = (start: number, end: number, fallback: string) => {
      const baseText = useLocked
        ? alignedLines
            .filter((l) => l.start_sec < end - 0.05 && l.end_sec > start + 0.05)
            .map((l) => l.text)
            .join("\n")
        : (fallback || "");
      if (!usePromptFilters) return baseText;
      // Drop the segment text whenever no kept lyric line overlaps this window.
      return intersectsAllowed(start, end) ? baseText : "";
    };

    // Track Details (title/artist/visual style/aspect ratio + optional pasted
    // lyrics) — captured on the Upload step and threaded verbatim so the model
    // can actually respect them. Prefer visual_style as the scene theme when
    // the user picked one; otherwise fall back to whatever the panel provides.
    const td = project.trackDetails;
    const safeVisualStyle = sanitizeVisualStyle(td?.visual_style);
    const safeAspect = sanitizeAspectRatio(td?.aspect_ratio);
    // User's explicit toolbar theme selection wins over the persisted visual_style
    // default so the ThemePicker is never silently ignored. "auto" means defer to
    // visual_style (or the server's cinematic fallback when both are empty).
    const userPickedTheme = sceneTheme && sceneTheme !== "auto" ? sceneTheme : "";
    const themeForRequest = userPickedTheme || safeVisualStyle || sceneTheme;
    const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").trim().slice(0, n) : "");

    const requestBody = JSON.stringify({
      segments: segmentsToSend.map(seg => ({
        index: seg.index,
        lyrics: lyricsForSegment(seg.start_sec, seg.end_sec, seg.lyrics || ""),
        start_sec: seg.start_sec,
        end_sec: seg.end_sec,
        words: wordsForSegment(seg.start_sec, seg.end_sec),
        source_of_truth: useLocked ? "verified_reference" : "asr",
      })),
      character: characterPayload, mood: verification.mood, theme: themeForRequest, energy: verification.energy,
      genre: sceneGenre && sceneGenre !== "auto" ? sceneGenre : "",
      project_id: projectId, lockSetting: lockSetting ? (lockSettingLocation.trim() || true) : false,
      transcript_lock_status: project.transcriptLockStatus,
      transcript_quality_status: project.transcriptQualityStatus,
      // Track Details passthrough — sanitised so malformed strings can't
      // poison the system prompt or exceed the model's context window.
      song_title: clip(td?.song_title, TRACK_DETAIL_LIMITS.song_title),
      artist_name: clip(td?.artist_name, TRACK_DETAIL_LIMITS.artist_name),
      visual_style: safeVisualStyle,
      aspect_ratio: safeAspect,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = RETRY_DELAYS[attempt - 1] || 6000;
          toast.info(`Retrying scene generation (attempt ${attempt + 1}/${MAX_RETRIES + 1})…`);
          await new Promise(r => setTimeout(r, delay));
        }

        const { data: { session: genSession } } = await supabase.auth.getSession();
        const genToken = genSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-storylines`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${genToken}` },
          body: requestBody,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Generation failed" }));
          // Strict server-side Track Details rejection — surface the
          // per-field messages inline so the user knows exactly what to
          // fix, and store them in context so the storyboard summary
          // renders them alongside client-side validation issues.
          const rejection = response.status === 400 ? parseTrackDetailsRejection(err) : null;
          if (rejection) {
            setServerTrackDetailIssues(rejection.fieldErrors);
            markSegments(targetSegIndices, "error", rejection.message);
            const parts = [rejection.fieldErrors.aspect_ratio, rejection.fieldErrors.visual_style].filter(Boolean).join(" · ");
            toast.error(rejection.message, {
              description: parts || "Update the Upload step and try again.",
              duration: 10000,
            });
            setGenerating(false);
            return;
          }
          if (response.status === 402) {
            const tier = await parseTierRequired(err, "generate-storylines");
            if (tier) {
              await reportTierRequired(tier);
              markSegments(targetSegIndices, "error", tier.message);
              setGenerating(false);
              return;
            }
            markSegments(targetSegIndices, "error", "AI credits exhausted");
            toast.error("AI credits exhausted. Please top up to continue.");
            setGenerating(false);
            return;
          }
          if (response.status === 429) {
            if (attempt < MAX_RETRIES) { lastError = new Error("Rate limited"); continue; }
            markSegments(targetSegIndices, "error", "Rate limited");
            toast.error("Too many requests. Please wait a moment and try again.");
            setGenerating(false);
            return;
          }
          if (response.status === 401 || response.status === 403) {
            markSegments(targetSegIndices, "error", "Session expired");
            toast.error("Session expired. Please refresh and try again.");
            setGenerating(false);
            return;
          }

          throw new Error(err.error || `Generation failed (${response.status})`);
        }
        // Clear any prior server rejection now that the call succeeded.
        setServerTrackDetailIssues({});

        const result = await response.json();
        if (!mountedRef.current) { setGenerating(false); return; }
        if (!result.scenes?.length) throw new Error("AI returned no scenes — try regenerating");
        if (result.ai_credits_exhausted) {
          toast.error("Add AI credits to continue", {
            description: result.message || "Generated editable draft scenes so you can keep working.",
            duration: 10000,
          });
        } else if (result.fallback) {
          toast.warning(result.message || "Generated editable draft scenes because automated storylines are temporarily unavailable.");
        }

        // Map returned scenes back to their original segment indices.
        // The AI sometimes returns fewer scenes than segments; align by
        // scene_number / segmentIndex when present, then backfill any
        // missing segment from its raw lyric data so EVERY snipped segment
        // becomes a storyboard scene (1:1 with the uploaded track).
        const targetIndices = onlyIndices ? Array.from(onlyIndices).sort((a, b) => a - b) : audioSegments.map((_, i) => i);
        const appliedGenre = sceneGenre && sceneGenre !== "auto" ? sceneGenre : undefined;
        const verb = appliedGenre === "Hip-Hop" ? "raps" : "sings";

        // Index AI scenes by the segment they claim to cover (1-based scene_number, segmentIndex, or array order).
        const aiByOrig = new Map<number, any>();
        result.scenes.forEach((s: any, ri: number) => {
          const claim =
            typeof s?.segmentIndex === "number" ? s.segmentIndex :
            typeof s?.scene_number === "number" ? s.scene_number - 1 :
            (targetIndices[ri] ?? ri);
          if (!aiByOrig.has(claim)) aiByOrig.set(claim, s);
        });

        const enrichedScenes = targetIndices.map((origIdx) => {
          const seg = audioSegments![origIdx];
          const s = aiByOrig.get(origIdx) || {};
          const lyrics = s.lyric_segment || seg?.lyrics || "";
          const aiDesc = s.action_description || "";
          const hasLyricsInDesc = aiDesc.toLowerCase().includes("transcribed lyrics") || (lyrics && aiDesc.toLowerCase().includes(lyrics.slice(0, 20).toLowerCase()));
          const timeStart = seg ? secondsToTime(seg.start_sec) : (s.time_start || "0:00");
          const timeEnd = seg ? secondsToTime(seg.end_sec) : (s.time_end || "0:00");
          const planEntry = project.brollPlan?.[origIdx];
          const isBroll = planEntry?.is_broll === true;
          const planBrollPrompt = planEntry?.broll_prompt || "";
          return { ...s, isAroll: !isBroll, is_broll: isBroll, section_type: s.section_type || "verse", section_index: s.section_index || 1, segmentIndex: origIdx, scene_number: origIdx + 1, lyric_segment: lyrics, time_start: timeStart, time_end: timeEnd, action_description: hasLyricsInDesc ? aiDesc : lyrics ? `Character ${verb} the transcribed lyrics: "${lyrics}". Passionate delivery with direct eye contact.` : aiDesc || `Character ${verb} to camera with passionate delivery.`, demeanour: s.demeanour || "", broll_prompt: planBrollPrompt || s.broll_prompt || "", genre: appliedGenre };
        });

        const missingCount = targetIndices.length - aiByOrig.size;
        if (missingCount > 0) {
          console.warn(`[generateScenes] AI returned ${aiByOrig.size}/${targetIndices.length} scenes — backfilled ${missingCount} from raw segments.`);
          toast.info(`Backfilled ${missingCount} scene${missingCount === 1 ? "" : "s"} the AI skipped so every segment is covered.`);
        }

        if (onlyIndices) {
          setScenes(prev => {
            const next = [...prev];
            enrichedScenes.forEach((es: Scene, ri: number) => {
              const origIdx = targetIndices[ri];
              if (origIdx < next.length) { next[origIdx] = es; } else { next.push(es); }
            });
            return next;
          });
          try {
            await persistScenesToDb(enrichedScenes, { deleteMissing: false });
          } catch (persistError) {
            console.error("[generateScenes] partial scene persistence failed:", persistError);
            markSegments(targetSegIndices, "error", "Generated, but could not save scenes");
            toast.error("Scenes were generated but could not be saved.", {
              description: "No extra AI request was started. Check your connection, then use Save before retrying generation.",
              duration: 8000,
            });
            setGenerating(false);
            return;
          }
          toast.success(`Regenerated ${enrichedScenes.length} scene(s)! Generating images…`);
          const firstIdx = targetIndices[0];
          setActiveReviewIndex(firstIdx);
          setTimeout(() => { setScenes(cur => { gen.generateSingleSceneImage(cur, firstIdx); return cur; }); }, 100);
        } else {
          setScenes(enrichedScenes);
          try {
            await persistScenesToDb(enrichedScenes, { deleteMissing: true });
          } catch (persistError) {
            console.error("[generateScenes] scene persistence failed:", persistError);
            markSegments(targetSegIndices, "error", "Generated, but could not save scenes");
            toast.error("Scenes were generated but could not be saved.", {
              description: "No extra AI request was started. Check your connection, then use Save before retrying generation.",
              duration: 8000,
            });
            setGenerating(false);
            return;
          }
          setActiveReviewIndex(0);
          setSceneApproved({});
          toast.success(`Generated ${result.scenes.length} scenes from ${audioSegments.length} segments! Generating images…`);
          gen.generateSingleSceneImage(enrichedScenes, 0);
        }
        // Mark per-segment status — success for any segment the AI returned,
        // error for any in the requested set the AI silently dropped.
        const succeededSet = new Set<number>(Array.from(aiByOrig.keys()));
        const succeeded = targetSegIndices.filter(i => succeededSet.has(i));
        const dropped = targetSegIndices.filter(i => !succeededSet.has(i));
        markSegments(succeeded, "success");
        markSegments(dropped, "error", "AI skipped this segment");

        setGenerating(false);
        return; // Success — exit retry loop
      } catch (err: any) {
        lastError = err;
        console.error(`Scene generation error (attempt ${attempt + 1}):`, err);
        if (attempt < MAX_RETRIES) continue; // Retry on transient errors
      }
    }

    // All retries exhausted
    markSegments(targetSegIndices, "error", lastError?.message || "Generation failed");
    toast.error(lastError?.message || "Failed to generate scenes after multiple attempts.", {
      description: "Check your connection and try again.",
      duration: 6000,
    });
    setGenerating(false);

  };

  const regenerateScene = async (index: number) => {
    if (!verification) return;
    const scene = scenes[index];
    setRegeneratingScene(index);
    try {
      const { data: { session: regenSession } } = await supabase.auth.getSession();
      const regenToken = regenSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${regenToken}` },
        body: JSON.stringify({ verification, character: characterPayload, theme: sceneTheme, location: sceneLocation, singleScene: { scene_number: scene.scene_number, section_type: scene.section_type, section_index: scene.section_index, lyric_segment: scene.lyric_segment, time_start: scene.time_start, time_end: scene.time_end } }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Regen failed");
      const result = await response.json();
      if (!mountedRef.current) { setRegeneratingScene(null); return; }
      const newScene = result.scenes?.[0];
      if (newScene) {
        const enrichedScene = { ...newScene, scene_number: scene.scene_number, section_type: newScene.section_type || scene.section_type, section_index: newScene.section_index || scene.section_index, isAroll: true, generatingImage: true };
        setScenes(prev => prev.map((s, i) => i === index ? enrichedScene : s));
        const imageUrl = await gen.generateSceneImage([...scenes.slice(0, index), enrichedScene, ...scenes.slice(index + 1)], index);
        if (!mountedRef.current) { setRegeneratingScene(null); return; }
        setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageUrl: imageUrl || undefined, generatingImage: false } : s));
        toast.success(`Scene ${index + 1} regenerated!`);
      }
    } catch (err: any) { if (mountedRef.current) toast.error(err.message || "Failed to regenerate scene."); }
    finally { setRegeneratingScene(null); }
  };

  const deleteScene = (index: number) => {
    const scene = scenes[index];
    if (!scene) return;
    if (!scene.videoUrl && !scene.imageUrl) {
      toast.info("No video or image to clear on this scene.");
      return;
    }
    setScenes(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], videoUrl: undefined, imageUrl: undefined, videoQuality: undefined };
      return updated;
    });
    toast.success("Scene video/image cleared — you can recall or regenerate it.");
  };

  const downloadSceneVideo = async (index: number) => {
    if (downloadingRef.current.has(index)) return;
    const scene = scenes[index];
    if (!scene.videoUrl) return;
    downloadingRef.current.add(index);
    setDownloadingSceneIdx(index);
    try {
      const resp = await fetch(scene.videoUrl);
      if (!mountedRef.current) return;
      const blob = await resp.blob();
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `scene-${index + 1}-video.mp4`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Scene ${index + 1} video downloaded!`);
    } catch { if (mountedRef.current) toast.error("Failed to download video."); }
    finally { downloadingRef.current.delete(index); if (mountedRef.current) setDownloadingSceneIdx(null); }
  };

  const handleDeleteVideo = async (idx: number) => {
    const scene = scenes[idx];
    const previousVideoUrl = scene.videoUrl;
    const previousVideoQuality = scene.videoQuality;
    setScenes(prev => prev.map((s, j) => j === idx ? { ...s, videoUrl: undefined, videoQuality: undefined } : s));
    gen.freshlyGeneratedVideos.current.delete(idx);

    // Delay DB update to allow undo
    const dbTimeout = setTimeout(async () => {
      if (projectId && userId) {
        await supabase.from("scenes").update({ video_url: null, video_quality: null } as any)
          .eq("project_id", projectId).eq("scene_number", scene.scene_number).eq("user_id", userId);
      }
    }, 6000);

    toast.success(`Scene ${idx + 1} video deleted.`, {
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(dbTimeout);
          setScenes(prev => prev.map((s, j) => j === idx ? { ...s, videoUrl: previousVideoUrl, videoQuality: previousVideoQuality } : s));
          toast.info(`Scene ${idx + 1} video restored.`);
        },
      },
      duration: 5000,
    });
  };

  const requestDeleteVideoFal = (idx: number) => {
    setPendingFalDelete(idx);
  };

  const confirmDeleteVideoFal = async () => {
    const idx = pendingFalDelete;
    if (idx === null) return;
    setPendingFalDelete(null);
    const s = scenes[idx];
    const previousState = { videoUrl: s.videoUrl, videoQuality: s.videoQuality, enhancedVideoUrl: s.enhancedVideoUrl, lipSyncVideoUrl: s.lipSyncVideoUrl };
    const urlsToDelete = [s.videoUrl].filter(Boolean) as string[];
    if (s.enhancedVideoUrl?.includes("fal.media")) urlsToDelete.push(s.enhancedVideoUrl);
    if (s.lipSyncVideoUrl?.includes("fal.media")) urlsToDelete.push(s.lipSyncVideoUrl);

    // Optimistically remove from UI
    setScenes(prev => prev.map((ss, j) => j === idx ? { ...ss, videoUrl: undefined, videoQuality: undefined, enhancedVideoUrl: undefined, lipSyncVideoUrl: undefined } : ss));
    gen.freshlyGeneratedVideos.current.delete(idx);

    toast.info(`Deleting ${urlsToDelete.length} file(s) from FAL storage…`, {
      action: {
        label: "Undo",
        onClick: () => {
          setScenes(prev => prev.map((ss, j) => j === idx ? { ...ss, ...previousState } : ss));
          toast.info(`Scene ${idx + 1} video restored.`);
        },
      },
      duration: 5000,
    });

    // Delay actual deletion to allow undo window
    await new Promise(r => setTimeout(r, 5500));

    // Check if undo was triggered (video restored)
    const currentScene = scenes[idx];
    if (currentScene?.videoUrl === previousState.videoUrl) return;

    try {
      const { data, error } = await supabase.functions.invoke("delete-fal-asset", { body: { urls: urlsToDelete } });
      if (error) throw error;
      const deletedCount = (data?.results || []).filter((r: any) => r.deleted).length;
      if (projectId && userId) {
        await supabase.from("scenes").update({ video_url: null, video_quality: null, enhanced_video_url: null, lipsync_video_url: null } as any)
          .eq("project_id", projectId).eq("scene_number", s.scene_number).eq("user_id", userId);
      }
      toast.success(`Scene ${idx + 1}: ${deletedCount}/${urlsToDelete.length} files deleted from FAL.`);
    } catch (err) {
      console.error("FAL delete error:", err);
      toast.error("Failed to delete from FAL storage.");
    }
  };

  const handleApprove = (idx: number) => {
    setSceneApproved(prev => ({ ...prev, [idx]: true }));
    toast.success(`Scene ${idx + 1} approved!`);
    if (idx < scenes.length - 1) {
      const nextUnapproved = scenes.findIndex((_, j) => j > idx && !sceneApproved[j]);
      setActiveReviewIndex(nextUnapproved >= 0 ? nextUnapproved : idx + 1);
    }
  };

  const handleUnapprove = (idx: number) => {
    setSceneApproved(prev => ({ ...prev, [idx]: false }));
    toast.info(`Scene ${idx + 1} unapproved — regenerate as needed.`);
  };

  const handleToggleAssembly = (idx: number) => {
    if (savedSceneIndices.includes(idx)) {
      setSavedSceneIndices((prev) => prev.filter(j => j !== idx));
    } else {
      setSavedSceneIndices((prev) => [...prev, idx]);
      toast.success(`Scene ${idx + 1} added to assembly`);
    }
  };

  const handleRatingChange = (index: number, rating: number) => {
    setSceneRatings(prev => ({ ...prev, [index]: rating }));
    const comment = sceneComments[index];
    if (rating <= 3 && comment?.trim() && scenes[index]?.imageUrl && !gen.autoOptimizing[index]) {
      gen.autoOptimizeScene(index, comment.trim());
    }
  };

  const handleCommentSubmit = (index: number, comment: string) => {
    setSceneComments(prev => ({ ...prev, [index]: comment }));
    if (commentDebounceTimers.current[index]) clearTimeout(commentDebounceTimers.current[index]);
    commentDebounceTimers.current[index] = setTimeout(() => {
      const rating = sceneRatings[index] || 0;
      if (rating >= 1 && rating <= 3 && comment.trim() && scenes[index]?.imageUrl && !gen.autoOptimizing[index]) {
        gen.autoOptimizeScene(index, comment.trim());
      }
    }, 2000);
  };

  const handleUpdateScene = (idx: number, updates: Partial<Scene>) => {
    setScenes(prev => {
      const updated = prev.map((s, j) => j === idx ? { ...s, ...updates } : s);

      // Sync lyric_segment edits back to master lyrics
      if (updates.lyric_segment !== undefined && setVerification && verification) {
        const masterLyrics = updated
          .map(s => s.lyric_segment || "")
          .filter(l => l.trim())
          .join("\n");
        setVerification({ ...verification, verified_lyrics: masterLyrics });
        if (projectId) {
          supabase.from("projects").update({ lyrics: masterLyrics }).eq("id", projectId).then();
        }
      }

      // Persist is_broll toggle immediately
      if (updates.is_broll !== undefined && projectId && userId) {
        const sceneNum = updated[idx]?.scene_number;
        if (sceneNum != null) {
          supabase.from("scenes").update({ is_broll: updates.is_broll } as any)
            .eq("project_id", projectId).eq("scene_number", sceneNum).eq("user_id", userId).then();
        }
      }

      return updated;
    });
  };

  return {
    generating, setGenerating,
    regeneratingScene, setRegeneratingScene,
    sceneRatings, setSceneRatings,
    sceneComments, setSceneComments,
    activeReviewIndex, setActiveReviewIndex,
    sceneApproved, setSceneApproved,
    editingTime, setEditingTime,
    commitTimeEdit,
    generateScenes, regenerateScene, deleteScene, downloadSceneVideo, downloadingSceneIdx,
    segmentStatus, retrySegment: (idx: number) => generateScenes(new Set([idx])),
    retryFailedSegments: () => {
      const failed = Object.entries(segmentStatus).filter(([, v]) => v.state === "error").map(([k]) => Number(k));
      if (failed.length === 0) { toast.info("No failed segments to retry."); return; }
      return generateScenes(new Set(failed));
    },

    handleDeleteVideo, requestDeleteVideoFal, confirmDeleteVideoFal, pendingFalDelete, setPendingFalDelete,
    handleApprove, handleUnapprove, handleToggleAssembly,
    handleRatingChange, handleCommentSubmit, handleUpdateScene,
  };
}
