import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, ZoomIn, Sparkles, ExternalLink, Image as ImageIcon, Film, ChevronLeft, ChevronRight, X, PenLine, Loader2, Type, Settings2, Eraser, Play, Square, Mic, Upload, BookmarkPlus, Check, RefreshCw } from "lucide-react";
import Lightbox from "@/components/studio/Lightbox";
import { saveToLibrary } from "@/lib/library";
import type { CreativeBrief } from "@/pages/Studio";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { fileToVisualReference, getSourceDisplayName } from "@/lib/media";
import { handleEdgeFunctionError, handleResponseError } from "@/lib/errorHandlers";
import { usePremiumGate, useTier } from "@/lib/tier";
import { Lock } from "lucide-react";
// Heavy panels — only mounted when the user actually opens video / overlay / voiceover.
const VideoRenderer = lazy(() => import("./VideoRenderer"));
const TextOverlayEditor = lazy(() => import("./TextOverlayEditor"));
const VoiceoverJinglePanel = lazy(() => import("./VoiceoverJinglePanel"));
import { DEFAULT_OVERLAY_CONFIG, type TextOverlayConfig } from "./textOverlayConfig";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface VideoVariant {
  posterUrl: string;
  headline?: string;
  subheadline?: string;
  callToAction?: string;
  colors?: string[];
}

interface PreviewPanelProps {
  isGenerating: boolean;
  hasGenerated: boolean;
  contentType: string;
  style: string;
  aspectRatio?: string;
  files: File[];
  screenshotUrl?: string | null;
  brief?: CreativeBrief | null;
  posters: string[];
  videos?: VideoVariant[];
  onPostersChange?: (posters: string[]) => void;
  onVideosChange?: (videos: VideoVariant[]) => void;
  onRegenerateVariant?: (variantIndex: number) => void | Promise<void>;
  regeneratingVariants?: number[];
}

const PreviewPanel = ({
  isGenerating,
  hasGenerated,
  contentType,
  style,
  aspectRatio = "16:9",
  files,
  screenshotUrl,
  brief,
  posters,
  videos = [],
  onPostersChange,
  onVideosChange,
  onRegenerateVariant,
  regeneratingVariants = [],
}: PreviewPanelProps) => {
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [selectedPoster, setSelectedPoster] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [showTextOverlay, setShowTextOverlay] = useState(false);
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [overlayConfig, setOverlayConfig] = useState<TextOverlayConfig>({ ...DEFAULT_OVERLAY_CONFIG });
  const [cinematicIntensity, setCinematicIntensity] = useState(0);
  const [isRegeneratingCinematic, setIsRegeneratingCinematic] = useState(false);
  const [cinematicVideoUrl, setCinematicVideoUrl] = useState<string | null>(null);
  const [cinematicProgress, setCinematicProgress] = useState("");
  const [cinematicPresetLabel, setCinematicPresetLabel] = useState<string>("");
  const [cinematicScenes, setCinematicScenes] = useState<{ url: string; duration: string }[]>([]);
  const [cinematicQuality, setCinematicQuality] = useState<"standard" | "master">("standard");
  const premiumGate = usePremiumGate();
  const { isPremium } = useTier();
  const [isExtending, setIsExtending] = useState(false);
  const [removalMode, setRemovalMode] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [showRemovalConfirm, setShowRemovalConfirm] = useState(false);
  const [removalLabel, setRemovalLabel] = useState("");
  const [showVoiceover, setShowVoiceover] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const cinematicCancelledRef = useRef(false);
  const overlayFileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const primaryFile = useMemo(() => files[0] ?? null, [files]);
  const hasUploadedMedia = Boolean(primaryFile && uploadedPreviewUrl);
  const hasPosters = posters.length > 0;
  const hasVideos = videos.length > 0;
  const hasAnyPreview = Boolean(screenshotUrl || hasUploadedMedia || brief || hasPosters || hasVideos);

  useEffect(() => {
    if (!primaryFile) { setUploadedPreviewUrl(null); return; }
    const objectUrl = URL.createObjectURL(primaryFile);
    setUploadedPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [primaryFile]);

  useEffect(() => { setSelectedPoster(0); setCinematicVideoUrl(null); setCinematicScenes([]); setCinematicPresetLabel(""); }, [posters, videos]);

  const handleDownload = async () => {
    const url = hasVideos ? videos[selectedPoster]?.posterUrl : posters[selectedPoster];
    if (!url) return;
    const filename = hasVideos ? `video-frame-${selectedPoster + 1}.png` : `poster-${selectedPoster + 1}.png`;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      await navigator.clipboard.writeText(url);
      toast({ title: "Download link copied", description: "Paste the link in a new tab to download the file." });
    }
  };

  const handleSaveToLibrary = async () => {
    const url = hasVideos ? videos[selectedPoster]?.posterUrl : posters[selectedPoster];
    if (!url) return;
    setIsSaving(true);
    try {
      const kind = hasVideos ? "video" : contentType;
      const label = `${brief?.brand ? brief.brand + " — " : ""}${kind} variant ${selectedPoster + 1}`;
      await saveToLibrary({
        url,
        kind,
        label,
        aspectRatio,
        brief: brief ? (brief as unknown as Record<string, unknown>) : null,
      });
      setSavedKey(url);
      toast({ title: "Saved to your Library", description: "Find it any time at /library." });
    } catch (e) {
      toast({ title: "Couldn't save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleZoom = () => {
    if (hasVideos && videos[selectedPoster]) { setZoomOpen(true); return; }
    if (posters[selectedPoster]) setZoomOpen(true);
  };

  const handleEdit = async (
    promptOverride?: string,
    removalRegion?: { x: number; y: number; w: number; h: number } | null,
  ) => {
    const instruction = (promptOverride ?? editPrompt).trim();
    const currentImage = hasVideos ? videos[selectedPoster]?.posterUrl : posters[selectedPoster];
    const primarySource = files[0] ?? null;
    const sourceDisplayName = getSourceDisplayName(primarySource, brief?.brand || "Source product");

    if (!instruction || !currentImage) return;

    setIsEditing(true);
    try {
      const base64 = currentImage.startsWith("data:")
        ? currentImage
        : await new Promise<string>(async (resolve, reject) => {
            try {
              const response = await fetch(currentImage);
              const blob = await response.blob();
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            } catch (error) {
              reject(error);
            }
          });

      toast({ title: "Editing design...", description: "Applying your changes" });

      const { data, error } = await supabase.functions.invoke("edit-poster", {
        body: { imageBase64: base64, editInstruction: instruction, removalRegion },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Edit failed");

      const editedImage = data.editedImage;
      const isRemovalEdit = !!removalRegion;

      if (hasVideos) {
        const updatedVideos = [...videos];
        updatedVideos[selectedPoster] = {
          ...updatedVideos[selectedPoster],
          posterUrl: editedImage,
        };
        onVideosChange?.(updatedVideos);

        if (isRemovalEdit) {
          // For removal edits, just use the edited frame directly — no re-render
          toast({ title: "Object removed!", description: "The selected area has been cleaned up." });
        } else {
          toast({ title: "Re-rendering video...", description: `Updating ${sourceDisplayName} in the video` });

          const uploadedBase64 = primarySource ? await fileToVisualReference(primarySource) : null;

          let videoData: any = null;
          try {
            const { data, error } = await supabase.functions.invoke("generate-video", {
              body: {
                headline: brief?.headline || sourceDisplayName,
                subheadline: brief?.subheadline || "",
                callToAction: brief?.callToAction || "",
                style,
                contentType: "video",
                tone: brief?.tone || style,
                colorSuggestions: brief?.colorSuggestions || [],
                keyPoints: brief?.keyPoints || [],
                brand: brief?.brand || sourceDisplayName,
                imageBase64: uploadedBase64,
                editedFrameBase64: editedImage,
                variantIndex: selectedPoster,
                instructions: [instruction, brief?.instructions, `Source material name: ${sourceDisplayName}`]
                  .filter(Boolean)
                  .join("\n\n"),
                sourceMaterialName: sourceDisplayName,
                sourceMaterialType: primarySource?.type || null,
              },
            });

            if (await handleResponseError(toast, data, error, "Video re-render")) return;

            videoData = data;
          } catch (videoErr: any) {
            await handleEdgeFunctionError(toast, videoErr, "Video re-render");
            return;
          }

          const newVariant = videoData.videos?.[0];
          if (newVariant) {
            const finalVideos = [...updatedVideos];
            finalVideos[selectedPoster] = {
              posterUrl: newVariant.posterUrl || editedImage,
              headline: newVariant.headline || brief?.headline,
              subheadline: newVariant.subheadline || brief?.subheadline,
              callToAction: newVariant.callToAction || brief?.callToAction,
              colors: newVariant.colors || brief?.colorSuggestions,
            };
            onVideosChange?.(finalVideos);
          }

          toast({ title: "Video updated!", description: "Design changes applied to the video." });
        }
      } else {
        const newPosters = [...posters];
        newPosters[selectedPoster] = editedImage;
        onPostersChange?.(newPosters);
        toast({ title: "Edit applied!", description: "Your design has been updated." });
      }

      setEditPrompt("");
    } catch (err: any) {
      console.error("Edit error:", err);
      await handleEdgeFunctionError(toast, err, "Edit");
    } finally {
      setIsEditing(false);
    }
  };

  const processOverlayFile = async (file: File) => {
    const currentImage = hasVideos ? videos[selectedPoster]?.posterUrl : posters[selectedPoster];
    if (!currentImage) {
      toast({ title: "No image to edit", description: "Generate a poster or video first.", variant: "destructive" });
      return;
    }

    setIsEditing(true);
    try {
      const posterBase64 = currentImage.startsWith("data:")
        ? currentImage
        : await new Promise<string>(async (resolve, reject) => {
            try {
              const response = await fetch(currentImage);
              const blob = await response.blob();
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            } catch (err) { reject(err); }
          });

      const uploadedBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      toast({ title: "Adding to image...", description: `Compositing ${file.name} onto the design` });

      const { data, error } = await supabase.functions.invoke("edit-poster", {
        body: {
          imageBase64: posterBase64,
          editInstruction: `Add/overlay this uploaded image onto the design. Place it naturally and blend it into the composition while keeping the overall layout intact. The uploaded image is: ${uploadedBase64}`,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Upload overlay failed");

      if (hasVideos) {
        const updatedVideos = [...videos];
        updatedVideos[selectedPoster] = { ...updatedVideos[selectedPoster], posterUrl: data.editedImage };
        onVideosChange?.(updatedVideos);
      } else {
        const newPosters = [...posters];
        newPosters[selectedPoster] = data.editedImage;
        onPostersChange?.(newPosters);
      }

      toast({ title: "File added!", description: `${file.name} has been composited onto the design.` });
    } catch (err: any) {
      console.error("Overlay upload error:", err);
      await handleEdgeFunctionError(toast, err, "Upload overlay");
    } finally {
      setIsEditing(false);
    }
  };

  const handleOverlayUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await processOverlayFile(file);
  };

  const handlePreviewDragOver = (e: React.DragEvent) => {
    if (removalMode || isEditing) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsFileDragOver(true);
  };

  const handlePreviewDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the wrapper itself (not bubbling from children)
    if (e.currentTarget === e.target) setIsFileDragOver(false);
  };

  const handlePreviewDrop = async (e: React.DragEvent) => {
    if (removalMode || isEditing) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    e.preventDefault();
    setIsFileDragOver(false);
    if (!file.type.startsWith("image/")) {
      toast({ title: "Unsupported file", description: "Please drop an image file.", variant: "destructive" });
      return;
    }
    await processOverlayFile(file);
  };

  const CINEMATIC_PROMPTS: Record<string, string> = {
    Subtle: "Slow elegant camera push-in with soft cinematic lighting, gentle dolly movement revealing the product, shallow depth of field with creamy bokeh, warm natural light",
    Dramatic: "Dynamic camera orbit around the product with dramatic side-lighting, volumetric fog, teal-orange color grading, sweeping motion with cinematic flair",
    Blockbuster: "Epic explosive hero shot, rapid camera whip-pan around the product, intense volumetric god rays, particles and sparks flying, dramatic smoke effects, blockbuster movie trailer energy",
  };

  const submitAndPollCinematic = async (imageUrl: string, prompt: string, quality: "standard" | "master" = "standard"): Promise<string> => {
    cinematicCancelledRef.current = false;

    const { data: submitData, error: submitError } = await supabase.functions.invoke("generate-cinematic-video", {
      body: { imageUrl, prompt, duration: "5", aspectRatio, quality },
    });

    if (submitError) throw submitError;
    if (!submitData?.success) throw new Error(submitData?.error || "Submission failed");

    const { statusUrl, responseUrl, requestId, modelPath } = submitData;

    const maxPollTime = 420_000;
    const start = Date.now();
    let polls = 0;

    while (Date.now() - start < maxPollTime) {
      if (cinematicCancelledRef.current) throw new Error("Cancelled");

      // Adaptive polling: 5s for first 6 polls (~30s), then 10s
      const interval = polls < 6 ? 5_000 : 10_000;
      await new Promise((r) => setTimeout(r, interval));
      polls++;

      if (cinematicCancelledRef.current) throw new Error("Cancelled");

      const { data: statusData, error: statusError } = await supabase.functions.invoke("cinematic-video-status", {
        body: { statusUrl, responseUrl, requestId, modelPath },
      });

      if (statusError) {
        console.warn("Status poll error:", statusError.message);
        continue;
      }

      if (statusData?.status === "COMPLETED" && statusData?.videoUrl) {
        return statusData.videoUrl;
      }

      if (statusData?.status === "COMPLETED" && !statusData?.videoUrl) {
        throw new Error(statusData?.error || "Video completed but no URL was returned.");
      }

      if (statusData?.status === "LEGACY_UNSUPPORTED") {
        throw new Error(statusData?.error || "Please generate a new preview.");
      }

      if (statusData?.status === "FAILED") {
        throw new Error(statusData?.error || "Video generation failed");
      }

      const elapsed = Math.round((Date.now() - start) / 1000);
      setCinematicProgress(`Rendering... ${elapsed}s`);
    }

    throw new Error("Video generation timed out (7 min).");
  };

  const handleCancelCinematic = () => {
    cinematicCancelledRef.current = true;
    setIsRegeneratingCinematic(false);
    setIsExtending(false);
    setCinematicProgress("");
    toast({ title: "Cancelled", description: "Kling rendering cancelled. Note: FAL credits may still be charged." });
  };

  const handleCinematicPreset = async (presetLabel: string, presetValue: number) => {
    setCinematicIntensity(presetValue);
    setCinematicVideoUrl(null);
    setCinematicScenes([]);
    setCinematicPresetLabel(presetLabel);

    if (!hasVideos || !videos[selectedPoster]?.posterUrl) return;

    const currentImage = videos[selectedPoster].posterUrl;
    const cinematicPrompt = CINEMATIC_PROMPTS[presetLabel];
    if (!cinematicPrompt) return;

    setIsRegeneratingCinematic(true);
    setCinematicProgress(`Submitting to Kling 2.1 ${cinematicQuality === "master" ? "Master" : "Standard"}...`);
    try {
      const tierLabel = cinematicQuality === "master" ? "Master (best quality, ~3 min)" : "Standard (faster, ~1-2 min)";
      toast({ title: `Generating ${presetLabel} preview...`, description: `Kling 2.1 ${tierLabel}` });

      const videoUrl = await submitAndPollCinematic(currentImage, cinematicPrompt, cinematicQuality);

      setCinematicVideoUrl(videoUrl);
      setCinematicScenes([{ url: videoUrl, duration: "5" }]);
      toast({ title: `${presetLabel} preview ready!`, description: "5s preview playing. Click 'Extend' to add more scenes." });
    } catch (err: any) {
      if (err?.message === "Cancelled") return;
      const isLegacy = /legacy|unsupported/i.test(err?.message || "");
      if (isLegacy) {
        setCinematicVideoUrl(null);
        setCinematicScenes([]);
        toast({ title: "Stale preview cleared", description: "Click the preset again to generate a fresh preview." });
        return;
      }
      console.error("Cinematic video error:", err);
      await handleEdgeFunctionError(toast, err, "Cinematic video generation");
    } finally {
      setIsRegeneratingCinematic(false);
      setCinematicProgress("");
    }
  };

  const handleExtendScene = async () => {
    if (!cinematicVideoUrl || !cinematicPresetLabel) return;
    if (!hasVideos || !videos[selectedPoster]?.posterUrl) return;

    const currentImage = videos[selectedPoster].posterUrl;
    const sceneNumber = cinematicScenes.length + 1;
    const cinematicPrompt = CINEMATIC_PROMPTS[cinematicPresetLabel];
    if (!cinematicPrompt) return;

    const sceneVariations = [
      "",
      ", slow push-in revealing new angle",
      ", sweeping lateral dolly shot",
      ", dramatic top-down reveal transitioning to eye-level",
      ", elegant tracking shot with rack focus",
    ];
    const variation = sceneVariations[Math.min(sceneNumber - 1, sceneVariations.length - 1)];

    setIsExtending(true);
    setCinematicProgress(`Submitting scene ${sceneNumber}...`);
    try {
      toast({ title: `Adding scene ${sceneNumber}...`, description: "Kling 2.1 is rendering an additional 5s scene" });

      const videoUrl = await submitAndPollCinematic(currentImage, `${cinematicPrompt}${variation}`, cinematicQuality);

      const newScenes = [...cinematicScenes, { url: videoUrl, duration: "5" }];
      setCinematicScenes(newScenes);
      toast({ title: `Scene ${sceneNumber} added!`, description: `Total: ${newScenes.length} scenes (${newScenes.length * 5}s)` });
    } catch (err: any) {
      if (err?.message === "Cancelled") return;
      console.error("Extend scene error:", err);
      await handleEdgeFunctionError(toast, err, "Scene extension");
    } finally {
      setIsExtending(false);
      setCinematicProgress("");
    }
  };


  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Preview
        </h3>
        {(hasPosters || hasVideos) && (
          <div className="flex items-center gap-1">
            <input
              ref={overlayFileRef}
              type="file"
              accept="image/*,video/*,.pdf,.svg,.png,.jpg,.jpeg,.webp"
              onChange={handleOverlayUpload}
              className="hidden"
            />
            <button
              onClick={() => overlayFileRef.current?.click()}
              disabled={isEditing}
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Upload file to add to the image"
            >
              <Upload className="w-4 h-4" />
            </button>
            <button onClick={handleZoom} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={handleDownload} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Download">
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleSaveToLibrary}
              disabled={isSaving}
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title={savedKey === (hasVideos ? videos[selectedPoster]?.posterUrl : posters[selectedPoster]) ? "Saved to Library" : "Save to Library"}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : savedKey === (hasVideos ? videos[selectedPoster]?.posterUrl : posters[selectedPoster]) ? (
                <Check className="w-4 h-4 text-primary" />
              ) : (
                <BookmarkPlus className="w-4 h-4" />
              )}
            </button>
          </div>
        )}
      </div>

      <div className="studio-card flex-1 min-h-[400px] flex flex-col overflow-y-auto relative">
        <AnimatePresence mode="wait">
          {isGenerating && !hasPosters && !hasVideos ? (
            <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 items-center justify-center p-6">
              {/* Skeleton variant cards (2-up) with shimmer — gives users immediate
                  structural feedback instead of just a spinner. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="aspect-[4/5] rounded-xl bg-gradient-to-br from-white/[0.04] via-white/[0.08] to-white/[0.04] ring-1 ring-white/[0.06] relative overflow-hidden"
                  >
                    <motion.div
                      initial={{ x: "-100%" }}
                      animate={{ x: "100%" }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "linear", delay: i * 0.4 }}
                      className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-primary/15 to-transparent"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                      <Sparkles className="w-5 h-5 text-primary/80" />
                      <p className="text-xs text-muted-foreground">Variant {i + 1}</p>
                      <p className="text-[10px] text-muted-foreground/70">
                        {contentType === "video" ? "Rendering 10s clip…" : "Composing layout…"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : hasVideos ? (
            <motion.div key="videos" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col">
              <div
                className={`relative flex-1 flex items-center justify-center p-4 ${removalMode ? "cursor-crosshair" : ""}`}
                onDragOver={handlePreviewDragOver}
                onDragLeave={handlePreviewDragLeave}
                onDrop={handlePreviewDrop}
              >
                {isFileDragOver && (
                  <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
                    <Upload className="w-7 h-7 text-primary" />
                    <p className="text-sm font-medium text-foreground">Drop image to add to design</p>
                    <p className="text-xs text-muted-foreground">AI will composite it onto the current variant</p>
                  </div>
                )}
                {cinematicScenes.length > 0 ? (
                  <div className="w-full max-w-full flex flex-col items-center gap-2">
                    {cinematicScenes.map((scene, i) => (
                      <video
                        key={`cinematic-${scene.url}-${i}`}
                        data-cinematic
                        src={scene.url}
                        autoPlay
                        loop
                        muted
                        playsInline
                        controls
                        className="max-w-full max-h-[300px] rounded-lg object-contain shadow-lg"
                        onLoadedData={(e) => {
                          e.currentTarget.play().catch(() => {});
                        }}
                        onError={(e) => {
                          console.error("Video playback error for scene", i, scene.url);
                          const vid = e.currentTarget;
                          if (!vid.dataset.retried) {
                            vid.dataset.retried = "1";
                            setTimeout(() => {
                              vid.src = scene.url;
                              vid.load();
                            }, 1000);
                          }
                        }}
                      />
                    ))}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Film className="w-3 h-3 text-primary" />
                        {cinematicScenes.length} scene{cinematicScenes.length > 1 ? "s" : ""} · {cinematicScenes.length * 5}s total
                      </div>
                      <button
                        onClick={() => {
                          const videos = document.querySelectorAll<HTMLVideoElement>('video[data-cinematic]');
                          videos.forEach(v => { v.currentTime = 0; v.play(); });
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                        title="Replay all scenes"
                      >
                        <Play className="w-3 h-3" />
                        Replay
                      </button>
                      {cinematicScenes.map((scene, i) => (
                        <button
                          key={i}
                          onClick={async (e) => {
                            e.preventDefault();
                            try {
                              const res = await fetch(scene.url);
                              const blob = await res.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = blobUrl;
                              a.download = `cinematic-scene-${i + 1}.mp4`;
                              a.click();
                              URL.revokeObjectURL(blobUrl);
                            } catch {
                              await navigator.clipboard.writeText(scene.url);
                              toast({ title: "Download link copied", description: "Paste the link in a new tab to download the scene." });
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                          title={`Download scene ${i + 1}`}
                        >
                          <Download className="w-3 h-3" />
                          {cinematicScenes.length > 1 ? `Scene ${i + 1}` : "Download"}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center bg-card/40"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}>
                    <VideoRenderer
                      key={videos[selectedPoster]?.posterUrl}
                      posterUrl={videos[selectedPoster]?.posterUrl || ''}
                      headline={videos[selectedPoster]?.headline}
                      subheadline={videos[selectedPoster]?.subheadline}
                      callToAction={videos[selectedPoster]?.callToAction}
                      colors={videos[selectedPoster]?.colors}
                      cameraMode={selectedPoster}
                      showTextOverlay={showTextOverlay}
                      overlayConfig={overlayConfig}
                      disableInteraction={removalMode}
                      cinematicIntensity={cinematicIntensity}
                    />
                  </Suspense>
                )}
                {removalMode && (
                  <div
                    className="absolute inset-0 z-10"
                    onPointerDown={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const x = ((e.clientX - r.left) / r.width) * 100;
                      const y = ((e.clientY - r.top) / r.height) * 100;
                      setDragStart({ x, y });
                      setSelectionBox({ x, y, w: 0, h: 0 });
                      setShowRemovalConfirm(false);
                    }}
                    onPointerMove={(e) => {
                      if (!dragStart) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      const x = ((e.clientX - r.left) / r.width) * 100;
                      const y = ((e.clientY - r.top) / r.height) * 100;
                      setSelectionBox({
                        x: Math.min(dragStart.x, x),
                        y: Math.min(dragStart.y, y),
                        w: Math.abs(x - dragStart.x),
                        h: Math.abs(y - dragStart.y),
                      });
                    }}
                    onPointerUp={() => {
                      if (!dragStart) return;
                      setDragStart(null);
                      setSelectionBox((current) => {
                        if (current && current.w > 1 && current.h > 1) {
                          setShowRemovalConfirm(true);
                          setRemovalLabel("");
                          return current;
                        }
                        setShowRemovalConfirm(false);
                        return null;
                      });
                    }}
                  />
                )}
                {/* Selection box overlay */}
                {removalMode && selectionBox && selectionBox.w > 0 && (
                  <div
                    className="absolute border-2 border-destructive bg-destructive/15 rounded pointer-events-none z-10"
                    style={{
                      left: `${selectionBox.x}%`,
                      top: `${selectionBox.y}%`,
                      width: `${selectionBox.w}%`,
                      height: `${selectionBox.h}%`,
                    }}
                  />
                )}
                {/* Removal confirm popover */}
                {showRemovalConfirm && selectionBox && (
                  <div
                    className="absolute z-20 rounded-lg border border-border bg-card shadow-xl p-3 w-64"
                    style={{
                      left: `${Math.min(selectionBox.x + selectionBox.w / 2, 70)}%`,
                      top: `${Math.min(selectionBox.y + selectionBox.h, 75)}%`,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs font-medium text-foreground mb-2">What should be removed?</p>
                    <input
                      type="text"
                      value={removalLabel}
                      onChange={(e) => setRemovalLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && removalLabel.trim() && selectionBox) {
                          const region = selectionBox;
                          const regionDesc = `inside the selected region (${Math.round(region.x)}% from left, ${Math.round(region.y)}% from top, ${Math.round(region.w)}% width, ${Math.round(region.h)}% height)`;
                          const prompt = `Remove "${removalLabel}" ${regionDesc}. Only remove content inside that selected area and rebuild the background naturally.`;
                          setShowRemovalConfirm(false);
                          setSelectionBox(null);
                          setRemovalMode(false);
                          setRemovalLabel("");
                          void handleEdit(prompt, region);
                        }
                      }}
                      placeholder="e.g. text, logo, person, shadow..."
                      className="w-full rounded-md border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary mb-2"
                      autoFocus
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          if (!removalLabel.trim() || !selectionBox) return;
                          const region = selectionBox;
                          const regionDesc = `inside the selected region (${Math.round(region.x)}% from left, ${Math.round(region.y)}% from top, ${Math.round(region.w)}% width, ${Math.round(region.h)}% height)`;
                          const prompt = `Remove "${removalLabel}" ${regionDesc}. Only remove content inside that selected area and rebuild the background naturally.`;
                          setShowRemovalConfirm(false);
                          setSelectionBox(null);
                          setRemovalMode(false);
                          setRemovalLabel("");
                          void handleEdit(prompt, region);
                        }}
                        disabled={!removalLabel.trim()}
                        className="flex-1 rounded-md bg-destructive px-2 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                      >
                        <Eraser className="w-3 h-3 inline mr-1" />
                        Remove
                      </button>
                      <button
                        onClick={() => { setShowRemovalConfirm(false); setSelectionBox(null); }}
                        className="rounded-md bg-secondary px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {/* Removal mode indicator */}
                {removalMode && !selectionBox && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="rounded-full bg-destructive/90 text-destructive-foreground px-4 py-2 text-xs font-medium backdrop-blur-sm animate-pulse">
                      Draw a box around the object to remove
                    </div>
                  </div>
                )}
                <div className="absolute bottom-7 left-7 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs text-foreground backdrop-blur-sm">
                  <Film className="w-3 h-3 text-primary" />
                  10s Video · Variant {selectedPoster + 1}
                </div>
                {files[0] && (
                  <div className="absolute top-7 left-7 max-w-[70%] rounded-full bg-background/90 px-3 py-1 text-xs text-foreground backdrop-blur-sm border border-border">
                    Source product: {getSourceDisplayName(files[0], brief?.brand || "Source product")}
                  </div>
                )}
                {videos.length > 1 && (
                  <>
                    <button
                      onClick={() => setSelectedPoster((p) => (p - 1 + videos.length) % videos.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background text-foreground shadow-md"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setSelectedPoster((p) => (p + 1) % videos.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background text-foreground shadow-md"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center justify-center gap-2 pb-2">
                {videos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedPoster(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${i === selectedPoster ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-2">Variant {selectedPoster + 1} of {videos.length}</span>
                <span className="mx-1 text-muted-foreground/30">|</span>
                <button
                  onClick={() => {
                    const next = !showTextOverlay;
                    setShowTextOverlay(next);
                    if (next && overlayConfig.headline === "" && videos[selectedPoster]) {
                      setOverlayConfig({
                        ...overlayConfig,
                        headline: videos[selectedPoster]?.headline || "",
                        subheadline: videos[selectedPoster]?.subheadline || "",
                        callToAction: videos[selectedPoster]?.callToAction || "",
                      });
                    }
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs transition-colors ${showTextOverlay ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  <Type className="w-3 h-3" />
                  Text
                </button>
                <button
                  onClick={() => {
                    if (cinematicIntensity > 0) { setCinematicIntensity(0); return; }
                    if (!premiumGate("cinematicVideo")) return;
                    setCinematicIntensity(50);
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs transition-colors ${cinematicIntensity > 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  <Film className="w-3 h-3" />
                  Cinematic
                  {!isPremium && <Lock className="w-2.5 h-2.5 opacity-70" />}
                </button>
                <button
                  onClick={() => {
                    if (showVoiceover) { setShowVoiceover(false); return; }
                    if (!premiumGate("voiceover")) return;
                    setShowVoiceover(true);
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs transition-colors ${showVoiceover ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  <Mic className="w-3 h-3" />
                  Audio
                  {!isPremium && <Lock className="w-2.5 h-2.5 opacity-70" />}
                </button>

                {cinematicIntensity > 0 && (
                  <TooltipProvider delayDuration={200}>
                  <div className="flex items-center gap-2 ml-1 flex-wrap">
                    {(isRegeneratingCinematic || isExtending) && (
                      <AlertDialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertDialogTrigger asChild>
                              <button
                                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-destructive/10 hover:bg-destructive/25 border border-destructive/30 hover:border-destructive/50 text-destructive cursor-pointer transition-colors group"
                              >
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {cinematicProgress && (
                                  <span className="text-[10px] animate-pulse">{cinematicProgress}</span>
                                )}
                                <Square className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                              </button>
                            </AlertDialogTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            Click to cancel Kling rendering
                          </TooltipContent>
                        </Tooltip>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel Kling rendering?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will stop polling for the result. Note that FAL/Kling credits may still be charged for work already in progress.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep rendering</AlertDialogCancel>
                            <AlertDialogAction onClick={handleCancelCinematic} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Cancel rendering
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          disabled={isRegeneratingCinematic || isExtending}
                          onClick={() => setCinematicQuality((q) => q === "standard" ? "master" : "standard")}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors disabled:opacity-50 border ${
                            cinematicQuality === "master"
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                              : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                          }`}
                        >
                          {cinematicQuality === "master" ? "✦ Master" : "Standard"}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                        {cinematicQuality === "master"
                          ? "Master: Best quality. Click to switch to Standard."
                          : "Standard: Faster processing. Click to switch to Master for best quality."}
                      </TooltipContent>
                    </Tooltip>
                    {[
                      { label: "Subtle", value: 25, tip: "Slow elegant dolly push-in with soft lighting & bokeh" },
                      { label: "Dramatic", value: 50, tip: "Dynamic camera orbit with volumetric fog & teal-orange grading" },
                      { label: "Blockbuster", value: 100, tip: "Epic whip-pan with god rays, sparks & blockbuster energy" },
                    ].map((preset) => (
                      <Tooltip key={preset.value}>
                        <TooltipTrigger asChild>
                          <button
                            disabled={isRegeneratingCinematic || isExtending}
                            onClick={() => { if (!premiumGate("cinematicVideo")) return; handleCinematicPreset(preset.label, preset.value); }}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors disabled:opacity-50 ${
                              cinematicIntensity === preset.value
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {preset.label}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                          {preset.tip}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {cinematicScenes.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            disabled={isRegeneratingCinematic || isExtending}
                            onClick={handleExtendScene}
                            className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors disabled:opacity-50 bg-accent text-accent-foreground hover:bg-accent/80"
                          >
                            + Extend
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                          Add another 5s scene ({cinematicScenes.length * 5}s → {(cinematicScenes.length + 1) * 5}s)
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  </TooltipProvider>
                )}
                {showTextOverlay && (
                  <button
                    onClick={() => setShowTextEditor((v) => !v)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs transition-colors ${showTextEditor ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                  >
                    <Settings2 className="w-3 h-3" />
                    Edit
                  </button>
                )}
              </div>
              {/* Text Overlay Editor — lazy-loaded; only mounts when opened. */}
              {showTextOverlay && showTextEditor && (
                <div className="px-4 pb-2">
                  <Suspense fallback={<div className="h-12 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>}>
                    <TextOverlayEditor
                      config={overlayConfig}
                      onChange={setOverlayConfig}
                      onClose={() => setShowTextEditor(false)}
                    />
                  </Suspense>
                </div>
              )}
              {/* Voiceover & Jingle Panel — lazy-loaded; only mounts when toggled on. */}
              {showVoiceover && (
                <Suspense fallback={<div className="h-12 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>}>
                  <VoiceoverJinglePanel isVisible={showVoiceover} brief={brief} />
                </Suspense>
              )}
              {/* AI Edit Bar for videos */}
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 p-1.5">
                  <PenLine className="w-4 h-4 text-primary ml-1.5 shrink-0" />
                  <input
                    type="text"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !isEditing && handleEdit()}
                    placeholder="Edit: change colors, text, layout, graphics..."
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    disabled={isEditing}
                  />
                  <button
                    onClick={() => {
                      setRemovalMode((v) => {
                        if (!v) { setSelectionBox(null); setShowRemovalConfirm(false); }
                        return !v;
                      });
                    }}
                    className={`shrink-0 p-1.5 rounded-md transition-colors ${removalMode ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                    title="Select & remove object"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleEdit()}
                    disabled={isEditing || !editPrompt.trim()}
                    data-edit-trigger
                    className="shrink-0 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEditing ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Editing...</>
                    ) : (
                      <><PenLine className="w-3.5 h-3.5" /> Edit</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : hasPosters ? (
            <motion.div key="posters" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col">
              <div
                className="relative flex-1 flex items-center justify-center p-4"
                onDragOver={handlePreviewDragOver}
                onDragLeave={handlePreviewDragLeave}
                onDrop={handlePreviewDrop}
              >
                {isFileDragOver && (
                  <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
                    <Upload className="w-7 h-7 text-primary" />
                    <p className="text-sm font-medium text-foreground">Drop image to add to design</p>
                    <p className="text-xs text-muted-foreground">AI will composite it onto this poster</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleZoom}
                  className="relative max-w-full max-h-[500px] rounded-lg overflow-hidden shadow-lg cursor-zoom-in group focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="Enlarge poster"
                >
                  <img
                    src={posters[selectedPoster]}
                    alt={`Poster variant ${selectedPoster + 1}`}
                    className="max-w-full max-h-[500px] rounded-lg object-contain pointer-events-none"
                    draggable={false}
                  />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow">
                      <ZoomIn className="w-3.5 h-3.5" /> Click to enlarge
                    </span>
                  </span>
                </button>
                {/* Floating quick actions */}
                <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleZoom}
                    className="inline-flex items-center gap-1 rounded-full bg-background/90 hover:bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-md backdrop-blur-sm border border-white/10"
                    title="Enlarge"
                  >
                    <ZoomIn className="w-3.5 h-3.5" /> Enlarge
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("studio-edit-input") as HTMLInputElement | null;
                      el?.focus();
                      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/90 hover:bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-md backdrop-blur-sm"
                    title="Edit with AI"
                  >
                    <PenLine className="w-3.5 h-3.5" /> Edit
                  </button>
                  {onRegenerateVariant && !hasVideos && (
                    <button
                      onClick={() => onRegenerateVariant(selectedPoster + 1)}
                      disabled={regeneratingVariants.includes(selectedPoster + 1)}
                      className="inline-flex items-center gap-1 rounded-full bg-background/80 hover:bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-md backdrop-blur-sm border border-border disabled:opacity-50"
                      title="Re-roll this variant with the same brief"
                    >
                      {regeneratingVariants.includes(selectedPoster + 1) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Re-roll
                    </button>
                  )}
                </div>
                {posters.length > 1 && (
                  <>
                    <button
                      onClick={() => setSelectedPoster((p) => (p - 1 + posters.length) % posters.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background text-foreground shadow-md"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setSelectedPoster((p) => (p + 1) % posters.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background text-foreground shadow-md"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center justify-center gap-2 pb-2">
                {posters.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedPoster(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${i === selectedPoster ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-2">Variant {selectedPoster + 1} of {posters.length}</span>
              </div>
              {/* AI Edit Bar */}
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 p-1.5">
                  <PenLine className="w-4 h-4 text-primary ml-1.5 shrink-0" />
                  <input
                    id="studio-edit-input"
                    type="text"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !isEditing && handleEdit()}
                    placeholder="Edit: change colors, text, layout, graphics..."
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    disabled={isEditing}
                  />
                  <button
                    onClick={() => handleEdit()}
                    disabled={isEditing || !editPrompt.trim()}
                    className="shrink-0 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEditing ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Editing...</>
                    ) : (
                      <><PenLine className="w-3.5 h-3.5" /> Edit</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : hasAnyPreview ? (
            <motion.div key="preview" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col">
              {screenshotUrl ? (
                <div className="relative group">
                  <img src={screenshotUrl} alt="Scraped page screenshot" className="w-full rounded-lg object-cover max-h-[300px]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent rounded-lg" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ExternalLink className="w-3 h-3" />Source page screenshot
                  </div>
                </div>
              ) : hasUploadedMedia && primaryFile ? (
                <div className="relative p-4 pb-0">
                  <div className="relative overflow-hidden rounded-lg border border-border bg-secondary/40">
                    {primaryFile.type.startsWith("video/") ? (
                      <video src={uploadedPreviewUrl!} controls className="w-full max-h-[320px] object-cover" />
                    ) : (
                      <img src={uploadedPreviewUrl!} alt={primaryFile.name} className="w-full max-h-[320px] object-cover" />
                    )}
                  </div>
                  <div className="absolute left-7 bottom-3 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs text-foreground backdrop-blur-sm">
                    {primaryFile.type.startsWith("video/") ? <Film className="w-3 h-3 text-accent" /> : <ImageIcon className="w-3 h-3 text-primary" />}
                    {files.length > 1 ? `${files.length} uploads ready` : primaryFile.name}
                  </div>
                </div>
              ) : null}

              {brief && !hasGenerated && (
                <div className="p-5 space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Ready to generate</p>
                  <p className="font-display text-lg font-bold text-foreground">{brief.headline}</p>
                  <p className="text-sm text-secondary-foreground">{brief.subheadline}</p>
                  <p className="text-xs text-muted-foreground mt-2">Hit <span className="text-primary font-medium">Generate</span> to create your {contentType}</p>
                </div>
              )}

              {!brief && hasUploadedMedia && !hasGenerated && (
                <div className="p-5 space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Upload ready</p>
                  <p className="font-display text-lg font-bold text-foreground">Your source media is loaded</p>
                  <p className="text-sm text-secondary-foreground">Generate a {style} {contentType} using your uploaded content only — URL and custom text are optional.</p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center space-y-6 max-w-md px-6">
              <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                {/* Outer slow-pulsing aura */}
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full studio-gradient-bg opacity-30 blur-3xl"
                  animate={{ scale: [1, 1.18, 1], opacity: [0.25, 0.45, 0.25] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                />
                {/* Middle breathing ring */}
                <motion.span
                  aria-hidden
                  className="absolute inset-2 rounded-full bg-gradient-to-br from-accent/30 via-primary/25 to-primary-glow/30 blur-xl"
                  animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                />
                {/* Inner glass mark */}
                <motion.div
                  className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-accent/40 via-primary/30 to-primary-glow/40 ring-1 ring-white/20 flex items-center justify-center backdrop-blur-md shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.55)]"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="w-8 h-8 text-foreground drop-shadow-[0_0_10px_hsl(var(--primary)/0.6)]" />
                </motion.div>
              </div>
              <div className="space-y-2">
                <h3 className="font-display text-2xl font-bold text-foreground tracking-tight">Ready to create</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                  Upload content, paste a link, or describe your idea. Resonance Creative Studio will turn it into a polished creative asset.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                {["Product Poster", "Book Promo", "Social Media Ad", "Cinematic Reel"].map((chip) => (
                  <span
                    key={chip}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10 text-foreground/85"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>


      {/* Lightbox */}
      <AnimatePresence>
        {zoomOpen && (hasVideos ? videos[selectedPoster] : posters[selectedPoster]) && (
          <Lightbox
            isVideo={hasVideos}
            items={hasVideos ? videos.map(v => v.posterUrl) : posters}
            index={selectedPoster}
            onIndexChange={setSelectedPoster}
            onClose={() => setZoomOpen(false)}
            onDownload={handleDownload}
            renderVideo={(i) => (
              <Suspense fallback={<div className="aspect-video flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}>
                <VideoRenderer
                  posterUrl={videos[i]?.posterUrl || ''}
                  headline={videos[i]?.headline}
                  subheadline={videos[i]?.subheadline}
                  callToAction={videos[i]?.callToAction}
                  colors={videos[i]?.colors}
                  cinematicIntensity={cinematicIntensity}
                />
              </Suspense>
            )}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default PreviewPanel;
