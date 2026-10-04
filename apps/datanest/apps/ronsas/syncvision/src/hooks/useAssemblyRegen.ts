import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import type { CharacterOption } from "@/components/assembly/CharacterPickerDialog";
import type { GalleryImage } from "@/components/assembly/RecallGalleryDialog";

interface UseAssemblyRegenOptions {
  orderedScenes: SavedScene[];
  setOrderedScenes: React.Dispatch<React.SetStateAction<SavedScene[]>>;
  projectId: string | null;
  userId: string | undefined;
  activeSceneIndex: number | null;
  setActiveSceneIndex: (idx: number | null) => void;
  characterConcepts: any[];
  selectedCharacterIndex: number | null;
  setConcepts: (c: any[]) => void;
  setSelectedConcept: (i: number) => void;
  setConfirmed: (b: boolean) => void;
  setCurrentStep: (s: number) => void;
  setPendingStoryboardGen: (b: boolean) => void;
  pendingCharacterRegen: any;
  setPendingCharacterRegen: (c: any) => void;
  file: any;
  transcription: any;
  audioUrl?: string | null;
}

export function useAssemblyRegen({
  orderedScenes, setOrderedScenes, projectId, userId,
  activeSceneIndex, setActiveSceneIndex,
  characterConcepts, selectedCharacterIndex,
  setConcepts, setSelectedConcept, setConfirmed,
  setCurrentStep, setPendingStoryboardGen,
  pendingCharacterRegen, setPendingCharacterRegen,
  file, transcription, audioUrl,
}: UseAssemblyRegenOptions) {
  const [charPickerOpen, setCharPickerOpen] = useState(false);
  const [regenSceneIdx, setRegenSceneIdx] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenProgress, setRegenProgress] = useState("");
  const regenPollTimer = useRef<number | null>(null);
  const regenCancelRef = useRef(false);

  const isCreditsExhaustedPayload = (data: any) =>
    Boolean(data?.ai_credits_exhausted) ||
    /credits? exhausted|add credits|add funds/i.test(String(data?.error || ""));

  const notifyCreditsExhausted = () => {
    toast.error("Add AI credits to continue.", {
      description: "Open Settings → Plans & credits to add credits, then try again.",
      duration: 10000,
    });
  };

  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedForRegen, setSelectedForRegen] = useState<Set<number>>(new Set());

  const handleToggleSelect = useCallback((idx: number) => {
    setSelectedForRegen(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  }, []);

  const handleOpenCharPicker = useCallback((sceneIdx: number) => {
    setRegenSceneIdx(sceneIdx); setCharPickerOpen(true);
  }, []);

  const handleOpenBatchCharPicker = useCallback(() => {
    if (selectedForRegen.size === 0) { toast.warning("Select at least one scene to regenerate"); return; }
    setRegenSceneIdx(null); setCharPickerOpen(true);
  }, [selectedForRegen]);

  const regenOneScene = useCallback(async (
    sceneIdx: number, character: CharacterOption, headers: Record<string, string>, label: string,
  ): Promise<{ videoUrl: string; imageUrl: string; sceneIdx: number }> => {
    const scene = orderedScenes[sceneIdx];
    if (!scene) throw new Error(`Scene at index ${sceneIdx} not found`);

    setRegenProgress(`${label} — generating image…`);
    const imageResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-scene-image`, {
      method: "POST", headers,
      body: JSON.stringify({
        visual_prompt: scene.lyricSegment || `Cinematic music video scene ${scene.sceneNumber}`,
        scene_number: scene.sceneNumber, style: "realistic",
        character: { name: character.name, description: character.description || "", outfit: character.outfit || "", vibe: character.vibe || "", imageUrl: character.imageUrl },
        project_id: projectId || undefined,
      }),
    });
    const imageData = await imageResp.json().catch(() => ({}));
    if (!imageResp.ok || isCreditsExhaustedPayload(imageData)) {
      if (imageResp.status === 402 || isCreditsExhaustedPayload(imageData)) {
        notifyCreditsExhausted();
        throw new Error("Add AI credits to continue.");
      }
      throw new Error(imageData.error || `Image generation failed for S${scene.sceneNumber}`);
    }
    const { imageUrl: newImageUrl } = imageData;
    if (!newImageUrl) throw new Error(`No image URL for S${scene.sceneNumber}`);

    setRegenProgress(`${label} — submitting video…`);
    const videoResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-video-job`, {
      method: "POST", headers,
      body: JSON.stringify({
        image_url: newImageUrl, prompt: scene.lyricSegment || "Cinematic music video scene with natural subtle motion",
        duration: 10, quality: "hd", scene_number: scene.sceneNumber, project_id: projectId || undefined, model: "wan-25",
      }),
    });
    if (!videoResp.ok) { const err = await videoResp.json().catch(() => ({})); throw new Error(err.error || `Video submission failed for S${scene.sceneNumber}`); }

    const { status_url, response_url } = await videoResp.json();
    setRegenProgress(`${label} — generating video… 0%`);

    const pollStart = Date.now();
    const MAX_POLL = 10 * 60 * 1000;
    const videoUrl = await new Promise<string>((resolve, reject) => {
      const check = async () => {
        if (Date.now() - pollStart > MAX_POLL) { reject(new Error(`Video timed out for S${scene.sceneNumber}`)); return; }
        try {
          const checkResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-job-status`, { method: "POST", headers, body: JSON.stringify({ status_url, response_url }) });
          if (checkResp.ok) {
            const result = await checkResp.json();
            if (["COMPLETED", "succeeded", "completed"].includes(result.status)) {
              const url = result.video_url || result.output?.video?.url || result.output?.video_url;
              if (url) { resolve(url); return; }
            }
            if (["FAILED", "failed"].includes(result.status)) { reject(new Error(result.error || `Video failed for S${scene.sceneNumber}`)); return; }
            setRegenProgress(`${label} — generating video… ${result.progress || 0}%`);
          }
        } catch { /* retry */ }
        const elapsed = Date.now() - pollStart;
        const interval = elapsed < 30000 ? 3000 : elapsed < 90000 ? 5000 : 10000;
        regenPollTimer.current = window.setTimeout(check, interval);
      };
      check();
    });

    if (projectId && character.id) {
      await supabase.from("scenes").update({ character_id: character.id } as any)
        .eq("project_id", projectId).eq("scene_number", scene.sceneNumber).eq("user_id", userId!)
        .then(({ error }) => { if (error) console.warn("Failed to link character to scene:", error); });
    }

    return { videoUrl, imageUrl: newImageUrl, sceneIdx };
  }, [orderedScenes, projectId, userId]);

  const handleRegenerateWithCharacter = useCallback(async (character: CharacterOption) => {
    if (!userId) return;
    const indices: number[] = regenSceneIdx !== null ? [regenSceneIdx] : Array.from(selectedForRegen).sort((a, b) => a - b);
    if (indices.length === 0) return;
    setRegenerating(true);
    const total = indices.length;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const headers = { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` };
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const scene = orderedScenes[idx];
        const label = total > 1 ? `Scene ${i + 1}/${total} (S${scene?.sceneNumber})` : `Scene S${scene?.sceneNumber}`;
        const result = await regenOneScene(idx, character, headers, label);
        setOrderedScenes(prev => prev.map((s, j) => j === result.sceneIdx ? { ...s, videoUrl: result.videoUrl, imageUrl: result.imageUrl } : s));
        toast.success(`S${scene?.sceneNumber} regenerated with ${character.name}`);
      }
      if (total > 1) toast.success(`All ${total} scenes regenerated!`);
    } catch (e: any) {
      toast.error("Regeneration failed: " + (e.message || "Unknown error"));
    } finally {
      setRegenerating(false); setRegenProgress(""); setRegenSceneIdx(null);
      setMultiSelectMode(false); setSelectedForRegen(new Set());
      if (regenPollTimer.current) clearTimeout(regenPollTimer.current);
    }
  }, [regenSceneIdx, selectedForRegen, orderedScenes, userId, regenOneScene]);

  // ─── Regen Character from gallery ───
  const [regenningChar, setRegenningChar] = useState(false);
  const [charRegenProgress, setCharRegenProgress] = useState("");
  const [regenCharGalleryOpen, setRegenCharGalleryOpen] = useState(false);
  const [charDropdownChars, setCharDropdownChars] = useState<CharacterOption[]>([]);
  const [charDropdownLoading, setCharDropdownLoading] = useState(false);
  const [selectedDropdownCharId, setSelectedDropdownCharId] = useState<string | null>(null);

  const currentCharacterOption = useMemo<CharacterOption | null>(() => {
    const idx = selectedCharacterIndex ?? (characterConcepts.length > 0 ? 0 : null);
    if (idx === null) return null;
    const currentCharacter = characterConcepts[idx];
    if (!currentCharacter?.imageUrl) return null;
    return {
      id: `current-${idx}`,
      name: currentCharacter.name || currentCharacter.label || "Current Character",
      vibe: currentCharacter.vibe || null, outfit: currentCharacter.outfit || null,
      imageUrl: currentCharacter.imageUrl,
      description: currentCharacter.description || currentCharacter.visual_prompt || null,
      projectId: projectId || "", projectName: "This project",
    };
  }, [characterConcepts, selectedCharacterIndex, projectId]);

  const loadCharactersForDropdown = useCallback(async () => {
    if (!userId) return;
    setCharDropdownLoading(true);
    try {
      const { data: chars } = await supabase.from("characters")
        .select("id, name, vibe, outfit, reference_image_url, extra_details, project_id, confirmed")
        .eq("user_id", userId).not("reference_image_url", "is", null).order("created_at", { ascending: false });
      const dbChars = chars || [];
      const projectIds = [...new Set(dbChars.map(c => c.project_id).filter(Boolean))];
      const { data: projects } = projectIds.length
        ? await supabase.from("projects").select("id, name").in("id", projectIds)
        : { data: [] as Array<{ id: string; name: string }> };
      const projMap = new Map((projects || []).map(p => [p.id, p.name]));
      const mappedDbChars: CharacterOption[] = dbChars.map(c => ({
        id: c.id, name: c.name || "Unnamed Character", vibe: c.vibe, outfit: c.outfit,
        imageUrl: c.reference_image_url, description: c.extra_details,
        projectId: c.project_id, projectName: projMap.get(c.project_id) || "Unknown",
      }));
      const mergedChars = currentCharacterOption
        ? [currentCharacterOption, ...mappedDbChars.filter(char => char.imageUrl !== currentCharacterOption.imageUrl)]
        : mappedDbChars;
      setCharDropdownChars(mergedChars);
      setSelectedDropdownCharId(prev => prev && mergedChars.some(char => char.id === prev) ? prev : currentCharacterOption?.id || mergedChars[0]?.id || null);
    } catch { toast.error("Failed to load characters"); } finally { setCharDropdownLoading(false); }
  }, [userId, currentCharacterOption]);

  const handleRegenWithDropdownChar = useCallback(async (character: CharacterOption) => {
    if (!userId || !character.imageUrl) { toast.error("Character has no reference image"); return; }
    if (activeSceneIndex === null) { toast.error("Select a scene on the timeline first"); return; }
    setRegenningChar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const headers = { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` };
      const scene = orderedScenes[activeSceneIndex];
      const label = `S${scene?.sceneNumber} with ${character.name}`;
      const result = await regenOneScene(activeSceneIndex, character, headers, label);
      setOrderedScenes(prev => prev.map((s, j) => j === result.sceneIdx ? { ...s, videoUrl: result.videoUrl, imageUrl: result.imageUrl } : s));
      toast.success(`Scene ${scene?.sceneNumber} regenerated with ${character.name}`);
    } catch (e: any) {
      toast.error("Regen failed: " + (e.message || "Unknown error"));
    } finally { setRegenningChar(false); setCharRegenProgress(""); }
  }, [userId, activeSceneIndex, orderedScenes, regenOneScene]);

  const handleRecallCharacterForRegen = useCallback(async (galleryImage: GalleryImage) => {
    if (galleryImage.type !== "character" || !galleryImage.image_url) { toast.error("Select a character image"); return; }
    setRegenCharGalleryOpen(false);
    try {
      const { data: srcChar } = await supabase.from("characters").select("*").eq("id", galleryImage.id).single();
      if (!srcChar) throw new Error("Could not load character data");
      let charData = srcChar;
      if (srcChar.project_id !== projectId && projectId && userId) {
        const { data: newChar, error: insertErr } = await supabase.from("characters").insert({
          project_id: projectId, user_id: userId, name: srcChar.name || "Recalled Character",
          gender: srcChar.gender, age_range: srcChar.age_range, ethnicity: srcChar.ethnicity,
          hairstyle: srcChar.hairstyle, facial_features: srcChar.facial_features, outfit: srcChar.outfit,
          accessories: srcChar.accessories, vibe: srcChar.vibe, extra_details: srcChar.extra_details,
          reference_image_url: srcChar.reference_image_url, confirmed: true,
        }).select("*").single();
        if (insertErr || !newChar) throw new Error("Failed to import character");
        charData = newChar;
      }
      const imported = {
        label: charData.name || "Recalled Character", name: charData.name || "Recalled Character",
        description: [charData.gender, charData.ethnicity, charData.facial_features].filter(Boolean).join(", "),
        outfit: charData.outfit || "", vibe: charData.vibe || "",
        visual_prompt: charData.extra_details || "", imageUrl: charData.reference_image_url || undefined,
        recalledFromGallery: true,
      };
      setConcepts([imported]); setSelectedConcept(0); setConfirmed(true);
      if (!file && !audioUrl && !transcription) {
        toast.success(`"${imported.name}" saved as reference — upload your audio track to continue`); setCurrentStep(0);
      } else {
        toast.success(`"${imported.name}" loaded — generating scenes…`); setPendingStoryboardGen(true); setCurrentStep(3);
      }
    } catch (e: any) { toast.error("Import failed: " + (e.message || "Unknown error")); }
  }, [userId, projectId, setConcepts, setSelectedConcept, setConfirmed, setPendingStoryboardGen, setCurrentStep, file, audioUrl, transcription]);

  // ─── Auto-regen from pending ───
  const pendingRegenProcessedRef = useRef(false);
  useEffect(() => {
    if (!pendingCharacterRegen || pendingRegenProcessedRef.current) return;
    if (!userId || orderedScenes.length === 0 || regenerating || regenningChar) return;
    pendingRegenProcessedRef.current = true;
    const char: CharacterOption = {
      id: pendingCharacterRegen.id, name: pendingCharacterRegen.name,
      imageUrl: pendingCharacterRegen.imageUrl, description: pendingCharacterRegen.description || "",
      vibe: pendingCharacterRegen.vibe || null, outfit: pendingCharacterRegen.outfit || null,
      projectId: projectId || "", projectName: "",
    };
    setActiveSceneIndex(0); setPendingCharacterRegen(null);
    setTimeout(() => { toast.info(`Auto-regenerating scene 1 with ${char.name}…`); handleRegenWithDropdownChar(char); }, 500);
  }, [pendingCharacterRegen, userId, orderedScenes.length, regenerating, regenningChar]);

  const cancelRegen = useCallback(() => {
    regenCancelRef.current = true;
    if (regenPollTimer.current) clearTimeout(regenPollTimer.current);
    setRegenerating(false); setRegenProgress("");
  }, []);

  const cancelRegenChar = useCallback(() => {
    regenCancelRef.current = true;
    if (regenPollTimer.current) clearTimeout(regenPollTimer.current);
    setRegenningChar(false); setCharRegenProgress("");
  }, []);

  return {
    charPickerOpen, setCharPickerOpen,
    regenerating, regenProgress, regenningChar, charRegenProgress,
    multiSelectMode, setMultiSelectMode, selectedForRegen, setSelectedForRegen,
    handleToggleSelect, handleOpenCharPicker, handleOpenBatchCharPicker,
    handleRegenerateWithCharacter, handleRegenWithDropdownChar, handleRecallCharacterForRegen,
    regenCharGalleryOpen, setRegenCharGalleryOpen,
    charDropdownChars, charDropdownLoading, selectedDropdownCharId, setSelectedDropdownCharId,
    loadCharactersForDropdown, currentCharacterOption,
    cancelRegen, cancelRegenChar,
  };
}
