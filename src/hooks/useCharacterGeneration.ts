import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProject, CharacterConcept } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import type { GalleryImage } from "@/components/assembly/RecallGalleryDialog";
import { loadFilteredLyricLines } from "@/lib/prompt-filter";
import { parseTierRequired } from "@/lib/tierRequired";
import { reportTierRequired } from "@/lib/invokeGated";

interface CharacterImageResponse {
  imageUrl?: string;
  error?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
}

interface CharacterImageRequestResult extends CharacterImageResponse {
  status: number;
}

// ─── API helpers ───

const getRetryAfterSeconds = (response: Response, fallbackSeconds = 8) => {
  const retryAfter = response.headers.get("Retry-After");
  if (!retryAfter) return fallbackSeconds;
  const numericValue = Number(retryAfter);
  if (Number.isFinite(numericValue) && numericValue > 0) return Math.ceil(numericValue);
  const dateValue = Date.parse(retryAfter);
  if (!Number.isNaN(dateValue)) return Math.max(Math.ceil((dateValue - Date.now()) / 1000), 1);
  return fallbackSeconds;
};

const readFunctionError = async (response: Response, fallback: string) => {
  const data = await response.clone().json().catch(() => null) as { error?: unknown } | null;
  if (typeof data?.error === "string" && data.error.trim()) return data.error;
  const text = await response.text().catch(() => "");
  return text || fallback;
};

const getInvokeErrorResponse = (error: unknown) => {
  const context = (error as { context?: unknown } | null)?.context;
  return context instanceof Response ? context : null;
};

const isRateLimitError = (error: unknown) => {
  const response = getInvokeErrorResponse(error);
  if (response?.status === 429) return true;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && /429|rate limit/i.test(message);
};

const readInvokeError = async (error: unknown, fallback: string) => {
  const response = getInvokeErrorResponse(error);
  if (response) return readFunctionError(response, fallback);
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
};

export function useCharacterGeneration() {
  const {
    verification, characterConcepts: concepts, setCharacterConcepts: setConcepts,
    selectedCharacterIndex: selectedConcept, setSelectedCharacterIndex: setSelectedConcept,
    characterConfirmed: confirmed, setCharacterConfirmed: setConfirmed,
    characterStyle, setScenes, projectId,
    setCurrentStep, setPendingStoryboardGen,
    file, transcription, audioUrl,
    promptFilterSettings, activeTranscriptVersionId,
  } = useProject();
  const { user } = useAuth();

  const [generating, setGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importingCharacter, setImportingCharacter] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [imageRating, setImageRating] = useState(0);

  // Reference image state
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceMeta, setReferenceMeta] = useState<{ name: string; size: number } | null>(null);
  const [referenceBase64, setReferenceBase64] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showUseAsIsChoice, setShowUseAsIsChoice] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const swapInputRef = useRef<HTMLInputElement>(null);
  const imageRequestInFlightRef = useRef(false);
  const characterRequestInFlightRef = useRef(false);
  const imageRateLimitUntilRef = useRef(0);
  const cancelledRef = useRef(false);

  const selectedCharacterIndex = selectedConcept !== null && concepts[selectedConcept] ? selectedConcept : concepts[0] ? 0 : null;
  const character = selectedCharacterIndex !== null ? concepts[selectedCharacterIndex] : null;

  const getRateLimitCooldownSeconds = () => Math.max(Math.ceil((imageRateLimitUntilRef.current - Date.now()) / 1000), 0);

  // PROMPT_FILTERS: when enabled on the project, replace verified_lyrics on the
  // verification payload with the same filtered text the user will export, so
  // character prompts cite the same cues.
  const buildVerificationForPrompt = useCallback(async () => {
    const s = promptFilterSettings;
    if (!verification || !s?.enabled || (!s.skip_empty && !s.min_confidence_enabled) ||
        !projectId || !activeTranscriptVersionId) {
      return verification;
    }
    try {
      const { combinedText, excludedCount, totalCount } = await loadFilteredLyricLines(
        projectId, activeTranscriptVersionId, s,
      );
      if (excludedCount > 0) {
        toast.info(`Prompt filters dropped ${excludedCount}/${totalCount} lyric line${excludedCount === 1 ? "" : "s"} from the character brief.`);
      }
      return { ...verification, verified_lyrics: combinedText };
    } catch (err) {
      console.warn("[useCharacterGeneration] prompt filters failed:", err);
      return verification;
    }
  }, [verification, promptFilterSettings, projectId, activeTranscriptVersionId]);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read reference image."));
      reader.readAsDataURL(file);
    });

  const clearDownstreamData = useCallback(async () => {
    setScenes([]);
    if (!user?.id || !projectId) return;
    try {
      await supabase.from("render_jobs").delete().eq("project_id", projectId).eq("user_id", user.id);
      await supabase.from("lipsync_jobs").delete().eq("project_id", projectId).eq("user_id", user.id);
      await supabase.from("generation_jobs").delete().eq("project_id", projectId).eq("user_id", user.id);
      await supabase.from("scenes").delete().eq("project_id", projectId).eq("user_id", user.id);
      await supabase.from("characters").delete().eq("project_id", projectId).eq("user_id", user.id);
    } catch (err) {
      console.warn("Failed to clear downstream DB data:", err);
    }
  }, [user?.id, projectId, setScenes]);

  const requestCharacterImage = (payload: {
    visual_prompt: string; name: string; style: "animated" | "realistic"; referenceImage?: string;
  }): Promise<CharacterImageRequestResult> =>
    supabase.functions.invoke("generate-character-image", { body: payload }).then(async ({ data, error }) => {
      if (error) {
        const tier = await parseTierRequired(error, "generate-character-image");
        if (tier) {
          await reportTierRequired(tier);
          return { status: 402, error: tier.message, rateLimited: false };
        }
        const response = getInvokeErrorResponse(error);
        return {
          status: response?.status ?? 500,
          error: await readInvokeError(error, "Image generation failed. You can retry."),
          rateLimited: isRateLimitError(error),
          retryAfterSeconds: response ? getRetryAfterSeconds(response) : undefined,
        };
      }
      const result = (data ?? {}) as CharacterImageResponse;
      return {
        status: result.rateLimited ? 429 : 200,
        imageUrl: result.imageUrl, error: result.error,
        rateLimited: Boolean(result.rateLimited), retryAfterSeconds: result.retryAfterSeconds,
      };
    });

  const handleCancelGeneration = useCallback(() => {
    cancelledRef.current = true;
    characterRequestInFlightRef.current = false;
    imageRequestInFlightRef.current = false;
    setGenerating(false); setIsGeneratingImage(false); setEditing(false);
    toast.info("Generation cancelled.");
  }, []);

  const generateSingleCharacter = useCallback(async (fromSong = false, referenceImageOverride?: string | null) => {
    if (characterRequestInFlightRef.current) return;
    await clearDownstreamData();
    cancelledRef.current = false;
    characterRequestInFlightRef.current = true;
    setGenerating(true); setIsGeneratingImage(true); setSelectedConcept(null); setConfirmed(false);
    try {
      const details = fromSong ? {} : {};
      const activeReference = referenceImageOverride ?? referenceBase64 ?? undefined;
      const verificationPayload = await buildVerificationForPrompt();
      const { data, error } = await supabase.functions.invoke("generate-character-unified", {
        body: { verification: verificationPayload, characterDetails: details, style: characterStyle, ...(activeReference ? { referenceImage: activeReference } : {}) },
      });
      if (error) {
        const tier = await parseTierRequired(error, "generate-character-unified");
        if (tier) { await reportTierRequired(tier); return; }
        const response = getInvokeErrorResponse(error);
        if (response?.status === 402) { toast.error("AI credits exhausted."); return; }
        if (response?.status === 429 || isRateLimitError(error)) { toast.error("Too many requests. Please wait."); return; }
        throw new Error(await readInvokeError(error, "Generation failed"));
      }
      const result = (data ?? {}) as { concept?: CharacterConcept; hasImage?: boolean; rateLimited?: boolean; retryAfterSeconds?: number; error?: string };
      if (result.rateLimited) {
        const waitSeconds = result.retryAfterSeconds ?? 8;
        imageRateLimitUntilRef.current = Date.now() + waitSeconds * 1000;
        toast.warning(`Service is busy. Try again in ${waitSeconds} seconds.`); return;
      }
      if (result.error) throw new Error(result.error);
      if (!result.concept) throw new Error("No character generated");
      setConcepts([result.concept]); setSelectedConcept(0);
      toast.success(result.hasImage ? "Character created with image!" : "Character concept created! Image generation pending.");
    } catch (err: any) {
      console.error("Character generation error:", err);
      toast.error(err.message || "Failed to generate character.");
    } finally {
      characterRequestInFlightRef.current = false; setGenerating(false); setIsGeneratingImage(false);
    }
  }, [clearDownstreamData, verification, characterStyle, referenceBase64, setConcepts, setSelectedConcept, setConfirmed, buildVerificationForPrompt]);

  // This version accepts formData from outside
  const generateFromDetails = useCallback(async (formData: Record<string, string>) => {
    if (characterRequestInFlightRef.current) return;
    await clearDownstreamData();
    cancelledRef.current = false;
    characterRequestInFlightRef.current = true;
    setGenerating(true); setIsGeneratingImage(true); setSelectedConcept(null); setConfirmed(false);
    try {
      const activeReference = referenceBase64 ?? undefined;
      const verificationPayload = await buildVerificationForPrompt();
      const { data, error } = await supabase.functions.invoke("generate-character-unified", {
        body: { verification: verificationPayload, characterDetails: formData, style: characterStyle, ...(activeReference ? { referenceImage: activeReference } : {}) },
      });
      if (error) {
        const tier = await parseTierRequired(error, "generate-character-unified");
        if (tier) { await reportTierRequired(tier); return; }
        const response = getInvokeErrorResponse(error);
        if (response?.status === 402) { toast.error("AI credits exhausted."); return; }
        if (response?.status === 429 || isRateLimitError(error)) { toast.error("Too many requests. Please wait."); return; }
        throw new Error(await readInvokeError(error, "Generation failed"));
      }
      const result = (data ?? {}) as { concept?: CharacterConcept; hasImage?: boolean; rateLimited?: boolean; retryAfterSeconds?: number; error?: string };
      if (result.rateLimited) {
        const waitSeconds = result.retryAfterSeconds ?? 8;
        imageRateLimitUntilRef.current = Date.now() + waitSeconds * 1000;
        toast.warning(`Service is busy. Try again in ${waitSeconds} seconds.`); return;
      }
      if (result.error) throw new Error(result.error);
      if (!result.concept) throw new Error("No character generated");
      setConcepts([result.concept]); setSelectedConcept(0);
      toast.success(result.hasImage ? "Character created with image!" : "Character concept created!");
    } catch (err: any) {
      console.error("Character generation error:", err);
      toast.error(err.message || "Failed to generate character.");
    } finally {
      characterRequestInFlightRef.current = false; setGenerating(false); setIsGeneratingImage(false);
    }
  }, [clearDownstreamData, verification, characterStyle, referenceBase64, setConcepts, setSelectedConcept, setConfirmed, buildVerificationForPrompt]);

  const generateImageForConcept = useCallback(async (concept: CharacterConcept, index: number, baseConcepts: CharacterConcept[] = concepts, referenceImageOverride?: string | null) => {
    const cooldownSeconds = getRateLimitCooldownSeconds();
    if (cooldownSeconds > 0) { toast.warning(`Image service is busy. Try again in ${cooldownSeconds} seconds.`); return false; }
    if (imageRequestInFlightRef.current) return false;
    imageRequestInFlightRef.current = true; setIsGeneratingImage(true);
    const updatedConcepts = baseConcepts.length ? [...baseConcepts] : [];
    updatedConcepts[index] = { ...(updatedConcepts[index] ?? concept), ...concept };
    setConcepts([...updatedConcepts]);
    let imageGenerated = false; let generatedImageUrl: string | undefined;
    const activeReferenceImage = referenceImageOverride ?? referenceBase64 ?? undefined;
    try {
      const result = await requestCharacterImage({ visual_prompt: concept.visual_prompt, name: concept.name, style: characterStyle, ...(activeReferenceImage ? { referenceImage: activeReferenceImage } : {}) });
      if (result.rateLimited || result.status === 429) { const w = result.retryAfterSeconds ?? 8; imageRateLimitUntilRef.current = Date.now() + w * 1000; toast.warning(`Image service is busy. Try again in ${w} seconds.`); return false; }
      if (result.status === 402) { toast.error(result.error || "AI credits exhausted."); return false; }
      if (result.error) { toast.error(result.error); return false; }
      if (result.imageUrl) { imageRateLimitUntilRef.current = 0; generatedImageUrl = result.imageUrl; imageGenerated = true; }
      else toast.error("AI did not return an image. You can retry.");
    } catch (err) {
      toast.error(err instanceof TypeError ? "Image service timed out." : "Network error generating image.");
    } finally {
      imageRequestInFlightRef.current = false; setIsGeneratingImage(false);
    }
    if (generatedImageUrl) { updatedConcepts[index] = { ...updatedConcepts[index], imageUrl: generatedImageUrl }; setConcepts([...updatedConcepts]); }
    if (imageGenerated) toast.success("Character image ready!");
    return imageGenerated;
  }, [concepts, referenceBase64, characterStyle, setConcepts]);

  const regenerateSelectedCharacter = useCallback(async () => {
    if (selectedCharacterIndex === null || !character || editing) return;
    await generateImageForConcept(character, selectedCharacterIndex, concepts);
  }, [selectedCharacterIndex, character, editing, generateImageForConcept, concepts]);

  const aiEditImage = useCallback(async (instruction: string) => {
    if (!concepts[0]?.imageUrl) { toast.error("No image to edit."); return; }
    const cooldownSeconds = getRateLimitCooldownSeconds();
    if (cooldownSeconds > 0) { toast.warning(`Image service is busy. Try again in ${cooldownSeconds} seconds.`); return; }
    setEditing(true);
    try {
      const result = await requestCharacterImage({ visual_prompt: instruction, name: concepts[0].name, style: characterStyle, referenceImage: concepts[0].imageUrl });
      if (result.rateLimited || result.status === 429) { const w = result.retryAfterSeconds ?? 8; imageRateLimitUntilRef.current = Date.now() + w * 1000; toast.warning(`Image editing is busy. Try again in ${w} seconds.`); return; }
      if (result.error) { toast.error(result.error || "Edit failed."); return; }
      if (result.imageUrl) { imageRateLimitUntilRef.current = 0; setConcepts([{ ...concepts[0], imageUrl: result.imageUrl }]); toast.success("Image edited successfully!"); return; }
      toast.error("Edit failed. Try again.");
    } catch (err) {
      toast.error(err instanceof TypeError ? "Image service timed out." : "Edit failed.");
    } finally {
      setEditing(false); setEditPrompt("");
    }
  }, [concepts, characterStyle, setConcepts]);

  const enhanceFaceResemblance = useCallback(() => {
    if (!referenceBase64) { toast.error("Upload a reference image first."); return; }
    aiEditImage("CRITICAL: Make the face in this image match the uploaded reference photo EXACTLY. Preserve the exact same facial features, eye shape, nose, mouth, jawline, skin tone, and expression. Keep the outfit, pose, and background the same.");
  }, [referenceBase64, aiEditImage]);

  // ─── Reference image handling ───
  const handleSwapReference = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setReferenceBase64(reader.result as string);
      const url = URL.createObjectURL(file);
      if (referencePreview) URL.revokeObjectURL(referencePreview);
      setReferencePreview(url); setReferenceMeta({ name: file.name, size: file.size });
      toast.success("New reference loaded! Click 'Enhance Face' to apply.");
    };
    reader.readAsDataURL(file);
  }, [referencePreview]);

  const handleImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image too large. Maximum 10MB."); return; }
    if (uploading || generating || characterRequestInFlightRef.current || isGeneratingImage || imageRequestInFlightRef.current) {
      toast.info("Please wait for the current generation to finish."); return;
    }
    if (referencePreview) URL.revokeObjectURL(referencePreview);
    setReferenceMeta({ name: file.name, size: file.size }); setReferencePreview(URL.createObjectURL(file));
    setPendingFile(file); setShowUseAsIsChoice(true);
  }, [uploading, generating, isGeneratingImage, referencePreview]);

  const handleUseAsIs = useCallback(async () => {
    const f = pendingFile;
    setShowUseAsIsChoice(false); setPendingFile(null);
    if (!f) return;
    setUploading(true);
    try {
      const base64 = await readFileAsDataUrl(f);
      setReferenceBase64(base64);
      const ext = f.name.split(".").pop() || "png";
      const storagePath = `references/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("media-uploads").upload(storagePath, f, { upsert: true });
      let publicUrl = base64;
      if (!uploadErr) { const { data: signedData } = await supabase.storage.from("media-uploads").createSignedUrl(storagePath, 3600 * 24); if (signedData?.signedUrl) publicUrl = signedData.signedUrl; }
      await clearDownstreamData();
      const concept: CharacterConcept = { label: "Uploaded Character", name: "Uploaded Character", description: "Custom reference image", outfit: "", vibe: "", visual_prompt: "User-provided reference portrait", imageUrl: publicUrl };
      setConcepts([concept]); setSelectedConcept(0); setConfirmed(true);
      if (projectId && user) {
        await supabase.from("characters").insert({ project_id: projectId, user_id: user.id, name: "Uploaded Character", reference_image_url: publicUrl, extra_details: "User-provided reference portrait — used as-is", confirmed: true });
      }
      toast.success("Reference image set as character!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to set reference image.");
    } finally {
      setUploading(false);
    }
  }, [pendingFile, clearDownstreamData, setConcepts, setSelectedConcept, setConfirmed, projectId, user]);

  const handleGenerateFromReference = useCallback(async () => {
    const f = pendingFile;
    setShowUseAsIsChoice(false); setPendingFile(null);
    if (!f) return;
    setUploading(true);
    try {
      const base64 = await readFileAsDataUrl(f);
      setReferenceBase64(base64);
      const ext = f.name.split(".").pop() || "png";
      const path = `references/${crypto.randomUUID()}.${ext}`;
      supabase.storage.from("media-uploads").upload(path, f, { upsert: true }).then(({ error }) => { if (error) console.warn("Storage upload failed:", error.message); });
      toast.success("Reference image ready!"); setUploading(false);
      if (verification) { toast.info("Starting character generation from reference..."); await generateSingleCharacter(true, base64); }
    } catch (err: any) {
      toast.error(err?.message || "Failed to process reference image.");
    } finally {
      setUploading(false);
    }
  }, [pendingFile, verification, generateSingleCharacter]);

  const removeReference = useCallback(() => {
    if (referencePreview) URL.revokeObjectURL(referencePreview);
    setReferencePreview(null); setReferenceBase64(null); setReferenceMeta(null);
  }, [referencePreview]);

  const downloadCharacterImage = useCallback(async () => {
    const imgUrl = character?.imageUrl;
    if (!imgUrl) return;
    try {
      const resp = await fetch(imgUrl); const blob = await resp.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${(character?.name || "character").replace(/\s+/g, "-").toLowerCase()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { toast.error("Failed to download image."); }
  }, [character]);

  const handleConfirm = useCallback(() => {
    if (selectedCharacterIndex === null) { toast.error("No character generated yet."); return; }
    if (selectedConcept !== selectedCharacterIndex) setSelectedConcept(selectedCharacterIndex);
    setConfirmed(true); toast.success("Character confirmed! Ready for scene generation.");
  }, [selectedCharacterIndex, selectedConcept, setSelectedConcept, setConfirmed]);

  const deleteCharacter = useCallback(() => {
    setConcepts([]); setSelectedConcept(null); setConfirmed(false); setImageRating(0);
    toast.info("Character deleted.");
  }, [setConcepts, setSelectedConcept, setConfirmed]);

  const handleImportCharacter = useCallback(async (galleryImage: GalleryImage) => {
    if (!user || !projectId || galleryImage.type !== "character") { toast.error("Select a character image to import"); return; }
    setImportingCharacter(true);
    try {
      const { data: srcChar, error: fetchErr } = await supabase.from("characters").select("*").eq("id", galleryImage.id).single();
      if (fetchErr || !srcChar) throw new Error("Could not load character data");
      await clearDownstreamData();
      const { data: newChar, error: insertErr } = await supabase.from("characters").insert({
        project_id: projectId, user_id: user.id, name: srcChar.name || "Imported Character",
        gender: srcChar.gender, age_range: srcChar.age_range, ethnicity: srcChar.ethnicity,
        hairstyle: srcChar.hairstyle, facial_features: srcChar.facial_features, outfit: srcChar.outfit,
        accessories: srcChar.accessories, vibe: srcChar.vibe, extra_details: srcChar.extra_details,
        reference_image_url: srcChar.reference_image_url, confirmed: true,
      }).select("*").single();
      if (insertErr || !newChar) throw new Error(insertErr?.message || "Failed to import character");
      const imported: CharacterConcept = {
        label: newChar.name || "Recalled Character", name: newChar.name || "Recalled Character",
        description: [newChar.gender, newChar.ethnicity, newChar.facial_features].filter(Boolean).join(", "),
        outfit: newChar.outfit || "", vibe: newChar.vibe || "", visual_prompt: newChar.extra_details || "",
        imageUrl: newChar.reference_image_url || undefined, recalledFromGallery: true,
      };
      setConcepts([imported]); setSelectedConcept(0); setConfirmed(true);
      if (newChar.reference_image_url) {
        if (referencePreview) URL.revokeObjectURL(referencePreview);
        setReferencePreview(newChar.reference_image_url); setReferenceBase64(null);
        setReferenceMeta({ name: newChar.name || "Imported", size: 0 });
      }
      if (!file && !audioUrl && !transcription) {
        toast.success(`"${imported.name}" saved as reference — upload your audio track to continue`); setCurrentStep(0);
      } else {
        toast.success(`"${imported.name}" loaded — generating scenes…`); setPendingStoryboardGen(true); setCurrentStep(3);
      }
    } catch (e: any) {
      toast.error("Import failed: " + (e.message || "Unknown error"));
    } finally {
      setImportingCharacter(false);
    }
  }, [user, projectId, setConcepts, setSelectedConcept, setConfirmed, clearDownstreamData, referencePreview, file, audioUrl, transcription, setCurrentStep, setPendingStoryboardGen]);

  return {
    // State
    generating, isGeneratingImage, editing, uploading, importingCharacter,
    editPrompt, setEditPrompt, imageRating, setImageRating,
    // Reference
    referencePreview, referenceMeta, referenceBase64,
    showUseAsIsChoice, pendingFile,
    fileInputRef, swapInputRef,
    // Character
    character, selectedCharacterIndex, confirmed,
    // Actions
    handleCancelGeneration, generateSingleCharacter, generateFromDetails,
    regenerateSelectedCharacter, aiEditImage, enhanceFaceResemblance,
    handleImageSelect, handleUseAsIs, handleGenerateFromReference,
    removeReference, handleSwapReference, downloadCharacterImage,
    handleConfirm, deleteCharacter, handleImportCharacter,
  };
}
