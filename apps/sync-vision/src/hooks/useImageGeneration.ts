/**
 * useImageGeneration — Image generation, regeneration, AI pen editing,
 * auto-optimization, and character swap for storyboard scenes.
 * Includes mounted-ref guard to prevent state updates after navigation.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type Scene, useProject } from "@/contexts/ProjectContext";
import { MAX_RETRIES, RETRY_DELAY, delay } from "@/types/storyboard";
import { logStagedError } from "@/lib/media-contract";
import { buildSceneDirectorPayload } from "@/lib/scene-director-payload";
import { sanitizeAspectRatio, sanitizeVisualStyle, parseTrackDetailsRejection } from "@/lib/track-details";
import { parseTierRequired } from "@/lib/tierRequired";
import { reportTierRequired } from "@/lib/invokeGated";

export interface UseImageGenerationParams {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  projectId?: string;
  userId?: string;
  characterStyle?: string;
  characterPayload: Record<string, any> | null;
  getCharacterImageUrl: () => Promise<string | null>;
  persistSceneImageUrl: (sceneNumber: number, imageUrl: string) => void;
  keepCharacterConsistent?: boolean;
  /** Track Details from the Upload step — the edge function uses
   *  `aspect_ratio` in place of the hardcoded "16:9 widescreen" string and
   *  layers `visual_style_override` on top of the built-in artStyle. */
  trackDetails?: { visual_style?: string; aspect_ratio?: string } | null;
}

export function useImageGeneration(params: UseImageGenerationParams) {
  const {
    scenes, setScenes, projectId, userId,
    characterStyle, characterPayload, getCharacterImageUrl,
    persistSceneImageUrl, keepCharacterConsistent, trackDetails,
  } = params;

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const { setServerTrackDetailIssues } = useProject();

  const [generatingAllImages, setGeneratingAllImages] = useState(false);
  const previousImageUrls = useRef<Record<number, string>>({});
  const [imageGenProgress, setImageGenProgress] = useState<{ current: number; total: number } | null>(null);
  const [autoOptimizing, setAutoOptimizing] = useState<Record<number, boolean>>({});
  const [aiPenLoading, setAiPenLoading] = useState(false);
  const imageGenCancelRef = useRef(false);
  const feedbackMemory = useRef<Array<{ feedback: string; scene_number: number }>>([]);

  const isCreditsExhaustedPayload = (data: any) =>
    Boolean(data?.ai_credits_exhausted) ||
    /credits? exhausted|add credits|add funds/i.test(String(data?.error || ""));

  const notifyCreditsExhausted = () => {
    toast.error("Add AI credits to continue.", {
      description: "Open Settings → Plans & credits to add credits, then try again.",
      duration: 10000,
    });
  };

  const getLearningContext = useCallback(() => {
    const memories = feedbackMemory.current;
    if (!memories.length) return undefined;
    return memories.slice(-10).map(m => m.feedback).join("; ");
  }, []);

  const generateSceneImage = useCallback(async (scenesList: Scene[], index: number, retries = 0, feedback?: string): Promise<string | null> => {
    const scene = scenesList[index];
    if (!scene) {
      console.warn(`Scene at index ${index} not found in list of ${scenesList.length} scenes`);
      return null;
    }
    // Correlation ID — sent to the edge function via `x-correlation-id` and
    // logged locally so a failure in the browser can be matched 1:1 to the
    // edge-function log line for the same request.
    const cid =
      (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `cid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const cidTag = `[scene-image cid=${cid} scene=${index + 1}]`;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const charImageUrl = await getCharacterImageUrl();
      const charPayloadWithImage = characterPayload ? { ...characterPayload, imageUrl: charImageUrl } : null;
      const director = buildSceneDirectorPayload(scene);
      const shotRole = (scene as any).shot_role as string | undefined;
      const isAroll = shotRole
        ? (shotRole === "A_ROLL_LIP_SYNC" || shotRole === "PERFORMANCE_CLOSEUP")
        : (scene.isAroll !== false);
      const isBroll = shotRole
        ? shotRole.startsWith("B_ROLL")
        : (scene.is_broll === true);
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-scene-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, "x-correlation-id": cid },
        body: JSON.stringify({ visual_prompt: scene.visual_prompt, scene_number: scene.scene_number, style: characterStyle || "realistic", character: charPayloadWithImage, feedback: feedback || undefined, learning_context: getLearningContext(), is_aroll: isAroll, is_broll: isBroll, broll_prompt: (scene as any).broll_prompt || undefined, project_id: projectId, keep_character_consistent: keepCharacterConsistent ?? true, attire_override: (scene as any).attire_override || undefined, director, aspect_ratio: sanitizeAspectRatio(trackDetails?.aspect_ratio), visual_style_override: sanitizeVisualStyle(trackDetails?.visual_style) || undefined }),
      });
      // Prefer server-echoed correlation_id (survives proxy rewrites); fall
      // back to header, then to the locally-minted cid.
      const respCid = resp.headers.get("x-correlation-id") || cid;
      if (resp.status === 429 && retries < MAX_RETRIES) { toast.info(`Rate limited on scene ${index + 1} — retrying…`); await delay(RETRY_DELAY * (retries + 1)); return generateSceneImage(scenesList, index, retries + 1); }
      if (resp.ok) {
        const data = await resp.json();
        if (isCreditsExhaustedPayload(data)) {
          notifyCreditsExhausted();
          return null;
        }
        if (data.deferred || data.rateLimited) {
          if (retries < MAX_RETRIES) { toast.info(`Scene ${index + 1} rate limited — will retry shortly…`); await delay(RETRY_DELAY * (retries + 1)); return generateSceneImage(scenesList, index, retries + 1); }
          toast.warning(`Scene ${index + 1} deferred due to rate limits. Try regenerating later.`, { description: `Trace ID: ${data.correlation_id || respCid}` });
          console.warn(`${cidTag} deferred/rate-limited`, data);
          return null;
        }
        if (data.imageUrl) return data.imageUrl as string;
      } else {
        const errData = await resp.json().catch(() => ({}));
        const errCid = (errData as any)?.correlation_id || respCid;
        console.warn(`${cidTag} failed (status=${resp.status}) server-cid=${errCid}`, errData);
        // Strict Track Details rejection from the edge function — surface
        // the per-field messages in the storyboard summary and toast so
        // the user knows exactly what to fix instead of seeing a generic
        // "generation failed" retry loop.
        if (resp.status === 400) {
          const rejection = parseTrackDetailsRejection(errData);
          if (rejection) {
            setServerTrackDetailIssues(rejection.fieldErrors);
            const parts = [rejection.fieldErrors.aspect_ratio, rejection.fieldErrors.visual_style].filter(Boolean).join(" · ");
            toast.error(rejection.message, {
              description: `${parts || "Update the Upload step and try again."} — Trace ID: ${errCid}`,
              duration: 10000,
            });
            return null;
          }
        }
        if (resp.status === 402) {
          const tier = await parseTierRequired(errData, "generate-scene-image");
          if (tier) { await reportTierRequired(tier); return null; }
          if (isCreditsExhaustedPayload(errData)) { notifyCreditsExhausted(); return null; }
        } else if (isCreditsExhaustedPayload(errData)) {
          notifyCreditsExhausted();
          return null;
        }
        if (retries < MAX_RETRIES) { await delay(RETRY_DELAY); return generateSceneImage(scenesList, index, retries + 1); }
        // Retries exhausted — surface the trace ID so the user can quote it
        // when reporting the failure (matches the [cid=…] line in edge logs).
        const msg = (errData as any)?.error || `Scene ${index + 1} generation failed (${resp.status}).`;
        toast.error(msg, { description: `Trace ID: ${errCid}`, duration: 8000 });
      }
    } catch (err) {
      console.warn(`${cidTag} network/error:`, err);
      if (retries < MAX_RETRIES) { await delay(RETRY_DELAY); return generateSceneImage(scenesList, index, retries + 1); }
      toast.error(`Scene ${index + 1} generation failed.`, { description: `Trace ID: ${cid}`, duration: 8000 });
    }
    return null;
  }, [characterPayload, characterStyle, getCharacterImageUrl, getLearningContext, projectId, keepCharacterConsistent, trackDetails]);

  const generateSingleSceneImage = useCallback(async (scenesList: Scene[], index: number) => {
    const effectiveScenes = scenesList.length > 0 ? scenesList : scenes;
    if (mountedRef.current) setScenes(prev => prev.map((s, i) => i === index ? { ...s, generatingImage: true } : s));
    const imageUrl = await generateSceneImage(effectiveScenes, index);
    if (!mountedRef.current) return;
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageUrl: imageUrl || undefined, generatingImage: false } : s));
    if (imageUrl) { persistSceneImageUrl(effectiveScenes[index]?.scene_number ?? index + 1, imageUrl); }
    else { toast.error(`Failed to generate image for scene ${index + 1}. Try again.`); }
  }, [scenes, generateSceneImage, persistSceneImageUrl, setScenes]);

  const generateAllImages = useCallback(async () => {
    imageGenCancelRef.current = false;
    setGeneratingAllImages(true);
    const toGenerateIndices = scenes.reduce<number[]>((acc, s, i) => (!s.imageUrl ? [...acc, i] : acc), []);
    const total = toGenerateIndices.length;
    let done = 0;
    setImageGenProgress({ current: 0, total });
    if (mountedRef.current) setScenes(prev => prev.map((s, i) => toGenerateIndices.includes(i) ? { ...s, generatingImage: true } : s));
    // Concurrency raised from 3→4 and inter-batch cool-off from 1500ms→500ms.
    // The edge function already handles its own per-call 429 backoff, so we
    // can keep the client wave tighter without tripping rate limits.
    const CONCURRENCY = 4;
    for (let batchStart = 0; batchStart < toGenerateIndices.length; batchStart += CONCURRENCY) {
      if (imageGenCancelRef.current || !mountedRef.current) break;
      const batch = toGenerateIndices.slice(batchStart, batchStart + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(i => generateSceneImage(scenes, i)));
      if (!mountedRef.current) break;
      results.forEach((result, batchIdx) => {
        const i = batch[batchIdx];
        const imageUrl = result.status === "fulfilled" ? result.value : null;
        done++;
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, imageUrl: imageUrl || undefined, generatingImage: false } : s));
        if (imageUrl) persistSceneImageUrl(scenes[i]?.scene_number ?? i + 1, imageUrl);
        setImageGenProgress({ current: done, total });
      });
      if (batchStart + CONCURRENCY < toGenerateIndices.length) await delay(500);
    }
    if (!mountedRef.current) return;
    if (imageGenCancelRef.current) {
      setScenes(prev => prev.map(s => s.generatingImage ? { ...s, generatingImage: false } : s));
      toast.info("Image generation cancelled.");
    } else { toast.success("Image generation complete!"); }
    setGeneratingAllImages(false);
    setImageGenProgress(null);
  }, [scenes, generateSceneImage, persistSceneImageUrl, setScenes]);

  const cancelImageGeneration = useCallback(() => { imageGenCancelRef.current = true; }, []);

  const autoOptimizeScene = useCallback(async (index: number, feedback: string) => {
    if (autoOptimizing[index]) return;
    setAutoOptimizing(prev => ({ ...prev, [index]: true }));
    feedbackMemory.current.push({ feedback, scene_number: scenes[index]?.scene_number || index + 1 });
    toast.info(`Auto-optimizing scene ${index + 1} based on your feedback…`);
    if (mountedRef.current) setScenes(prev => prev.map((s, i) => i === index ? { ...s, generatingImage: true, videoUrl: undefined } : s));
    const imageUrl = await generateSceneImage(scenes, index, 0, feedback);
    if (!mountedRef.current) return;
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageUrl: imageUrl || s.imageUrl, generatingImage: false } : s));
    setAutoOptimizing(prev => ({ ...prev, [index]: false }));
    if (imageUrl) toast.success(`Scene ${index + 1} auto-optimized!`);
    else toast.error(`Auto-optimization failed for scene ${index + 1}.`);
  }, [autoOptimizing, scenes, generateSceneImage, setScenes]);

  const aiEditSceneImage = useCallback(async (index: number, instruction: string) => {
    const scene = scenes[index];
    if (!scene?.imageUrl) { toast.error("Generate the scene image first."); return; }
    // Store previous image for undo
    previousImageUrls.current[index] = scene.imageUrl;
    setAiPenLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const charImageUrl = await getCharacterImageUrl();
      const charPayloadWithImage = characterPayload ? { ...characterPayload, imageUrl: charImageUrl } : null;
      const director = buildSceneDirectorPayload(scene);
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-scene-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          visual_prompt: `${instruction}. Keep the same character identity, face, and attire unchanged. Only modify what is explicitly requested. Original scene: ${scene.visual_prompt}`,
          scene_number: scene.scene_number, style: characterStyle || "realistic", character: charPayloadWithImage,
          project_id: projectId, keep_character_consistent: true,
          attire_override: (scene as any).attire_override || undefined,
          director,
          aspect_ratio: sanitizeAspectRatio(trackDetails?.aspect_ratio),
          visual_style_override: sanitizeVisualStyle(trackDetails?.visual_style) || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || isCreditsExhaustedPayload(data)) {
        if (resp.status === 402) {
          const tier = await parseTierRequired(data, "generate-scene-image");
          if (tier) { await reportTierRequired(tier); return; }
          notifyCreditsExhausted(); return;
        }
        if (isCreditsExhaustedPayload(data)) { notifyCreditsExhausted(); return; }
        const rejection = resp.status === 400 ? parseTrackDetailsRejection(data) : null;
        if (rejection) {
          setServerTrackDetailIssues(rejection.fieldErrors);
          const parts = [rejection.fieldErrors.aspect_ratio, rejection.fieldErrors.visual_style].filter(Boolean).join(" · ");
          toast.error(rejection.message, { description: parts || undefined, duration: 10000 });
          return;
        }
        throw new Error(data.error || "AI edit failed");
      }
      if (data.imageUrl) { setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageUrl: data.imageUrl, videoUrl: undefined } : s)); toast.success("Scene image updated!"); }
    } catch (err: any) { logStagedError("storyboard", err.message || "AI edit failed", { scene: index }); toast.error(err.message || "AI edit failed. Try again."); }
    finally { setAiPenLoading(false); }
  }, [scenes, characterPayload, characterStyle, getCharacterImageUrl, projectId, setScenes, trackDetails]);

  const undoAiEdit = useCallback((index: number) => {
    const prevUrl = previousImageUrls.current[index];
    if (!prevUrl) { toast.info("No previous version to undo."); return; }
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageUrl: prevUrl, videoUrl: undefined } : s));
    delete previousImageUrls.current[index];
    toast.success("Reverted to previous image.");
  }, [setScenes]);

  const saveAiEdit = useCallback((index: number) => {
    const scene = scenes[index];
    if (!scene?.imageUrl) return;
    persistSceneImageUrl(scene.scene_number, scene.imageUrl);
    delete previousImageUrls.current[index];
    toast.success(`Scene ${index + 1} image saved.`);
  }, [scenes, persistSceneImageUrl]);

  const regenerateSceneImage = useCallback(async (index: number) => {
    if (mountedRef.current) setScenes(prev => prev.map((s, i) => i === index ? { ...s, generatingImage: true, imageUrl: undefined } : s));
    const imageUrl = await generateSceneImage(scenes, index);
    if (!mountedRef.current) return;
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, imageUrl: imageUrl || undefined, generatingImage: false } : s));
    if (imageUrl) { persistSceneImageUrl(scenes[index]?.scene_number ?? index + 1, imageUrl); toast.success(`Scene ${index + 1} image regenerated!`); }
    else toast.error(`Failed to regenerate image for scene ${index + 1}.`);
  }, [scenes, generateSceneImage, persistSceneImageUrl, setScenes]);

  const regenerateWithCharacterImage = useCallback(async (sceneIndex: number, characterImageUrl: string) => {
    const scene = scenes[sceneIndex];
    if (!scene) return;
    toast.info(`Regenerating scene ${sceneIndex + 1} with new character…`);
    setScenes(prev => prev.map((s, i) => i === sceneIndex ? { ...s, generatingImage: true, imageUrl: undefined, videoUrl: undefined, videoQuality: undefined } : s));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-scene-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visual_prompt: scene.visual_prompt, scene_number: scene.scene_number, style: characterStyle || "realistic", character: characterPayload ? { ...characterPayload, imageUrl: characterImageUrl } : { imageUrl: characterImageUrl }, project_id: projectId, keep_character_consistent: keepCharacterConsistent ?? true, attire_override: (scene as any).attire_override || undefined, director: buildSceneDirectorPayload(scene), aspect_ratio: sanitizeAspectRatio(trackDetails?.aspect_ratio), visual_style_override: sanitizeVisualStyle(trackDetails?.visual_style) || undefined }),
      });
      const data = await resp.json();
      if (!resp.ok || isCreditsExhaustedPayload(data)) {
        if (resp.status === 402) {
          const tier = await parseTierRequired(data, "generate-scene-image");
          if (tier) { await reportTierRequired(tier); return; }
          notifyCreditsExhausted(); return;
        }
        if (isCreditsExhaustedPayload(data)) { notifyCreditsExhausted(); return; }
        const rejection = resp.status === 400 ? parseTrackDetailsRejection(data) : null;
        if (rejection) {
          setServerTrackDetailIssues(rejection.fieldErrors);
          const parts = [rejection.fieldErrors.aspect_ratio, rejection.fieldErrors.visual_style].filter(Boolean).join(" · ");
          toast.error(rejection.message, { description: parts || undefined, duration: 10000 });
          return;
        }
        throw new Error(data.error || "Image generation failed");
      }
      if (data.imageUrl) {
        setScenes(prev => prev.map((s, i) => i === sceneIndex ? { ...s, imageUrl: data.imageUrl, generatingImage: false } : s));
        persistSceneImageUrl(scene.scene_number, data.imageUrl);
        if (projectId && userId) { await supabase.from("scenes").update({ video_url: null, video_quality: null } as any).eq("project_id", projectId).eq("scene_number", scene.scene_number).eq("user_id", userId); }
        toast.success(`Scene ${sceneIndex + 1} regenerated with new character! Generate video when ready.`);
      } else throw new Error("No image returned");
    } catch (err: any) {
      logStagedError("storyboard", err.message || "Character regen failed", { scene: sceneIndex });
      setScenes(prev => prev.map((s, i) => i === sceneIndex ? { ...s, generatingImage: false } : s));
      toast.error(err.message || "Failed to regenerate with new character.");
    }
  }, [scenes, characterPayload, characterStyle, projectId, userId, persistSceneImageUrl, setScenes, keepCharacterConsistent, trackDetails]);

  return {
    generatingAllImages, imageGenProgress,
    autoOptimizing, aiPenLoading,
    imageGenCancelRef, previousImageUrls,
    generateSceneImage, generateSingleSceneImage, generateAllImages, cancelImageGeneration,
    regenerateSceneImage, regenerateWithCharacterImage,
    autoOptimizeScene, aiEditSceneImage, undoAiEdit, saveAiEdit,
  };
}
