import { useState, useEffect, useRef, useMemo } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

import { ArrowLeft, ArrowRight, Film, Trash2, RefreshCw, Loader2, AlertTriangle, Eye, CheckCircle2, XCircle, AlertCircle, Wand2 } from "lucide-react";
import { useVideoPreloader } from "@/hooks/useVideoPreloader";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useProject, Scene } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SaveProgressButton from "@/components/SaveProgressButton";
import RecallGalleryDialog from "@/components/assembly/RecallGalleryDialog";
import { useJobConfirmation } from "@/components/JobEstimateBadge";

// Extracted modules
import { type StepProps } from "@/types/storyboard";
import { useScenePersistence } from "@/hooks/useScenePersistence";
import { useSceneGeneration } from "@/hooks/useSceneGeneration";
import RealtimeStatusBadge from "@/components/storyboard/RealtimeStatusBadge";
import { useRetryPrefsPersistence } from "@/hooks/useRetryPrefsPersistence";
import { useCharacterImage } from "@/hooks/useCharacterImage";
import { useVideoHistory } from "@/hooks/useVideoHistory";

import { useStoryboardHandlers } from "@/hooks/useStoryboardHandlers";
import TrackSummaryStrip from "@/components/storyboard/TrackSummaryStrip";
import TrackDetailsSummary from "@/components/storyboard/TrackDetailsSummary";
import { validateTrackDetailInputs, hasTrackDetailIssues } from "@/lib/track-details";
import { useReanalyze } from "@/hooks/useReanalyze";
import { useAnalysisEngine } from "@/hooks/useAnalysisEngine";
import AllScenesPanel from "@/components/storyboard/AllScenesPanel";
import ApprovedScenesSummary from "@/components/storyboard/ApprovedScenesSummary";
import VideoHistoryDialog from "@/components/storyboard/VideoHistoryDialog";
import SceneCard from "@/components/storyboard/SceneCard";
import StoryboardToolbar from "@/components/storyboard/StoryboardToolbar";
import EmptyStatePanel from "@/components/storyboard/EmptyStatePanel";
import DiagnosticsPanel from "@/components/DiagnosticsPanel";
import SceneProgressBar from "@/components/storyboard/SceneProgressBar";
import VideoGenerateButton from "@/components/storyboard/VideoGenerateButton";
import ProviderTimeoutSettings from "@/components/storyboard/ProviderTimeoutSettings";
import DownloadStoryboardButton from "@/components/storyboard/DownloadStoryboardButton";
import ExportPayloadFlagsButton from "@/components/storyboard/ExportPayloadFlagsButton";
import PayloadFlagsFilterPanel from "@/components/storyboard/PayloadFlagsFilterPanel";
import ProjectAudioAuditBanner from "@/components/storyboard/ProjectAudioAuditBanner";
import EntitlementLocksPanel from "@/components/storyboard/EntitlementLocksPanel";
import LyricsValidationBanner from "@/components/storyboard/LyricsValidationBanner";
import { analyzeLyricsHealth, loadAutoResyncPreference } from "@/lib/lyrics-health";
import { timeToSeconds } from "@/lib/audio-utils";

const DEFAULT_STORYBOARD_PROVIDER = "wan-25";

export default function StoryboardStep({ onNext, onPrev }: StepProps) {
  const { verification, setVerification, characterConcepts, selectedCharacterIndex, scenes, setScenes, characterStyle, file, audioUrl, setAudioUrl, transcription, projectId, audioSegments, savedSceneIndices, setSavedSceneIndices, pendingStoryboardGen, setPendingStoryboardGen, transcriptLockStatus, transcriptQualityStatus, trackDetails, trackDetailAdjustments, serverTrackDetailIssues } = useProject();
  const { user } = useAuth();

  const [globalProvider, setGlobalProvider] = useState<string>(DEFAULT_STORYBOARD_PROVIDER);
  const [sceneTheme, setSceneTheme] = useState("auto");
  const [sceneGenre, setSceneGenre] = useState("auto");
  const [customTheme, setCustomTheme] = useState("");
  const [sceneLocation, setSceneLocation] = useState("auto");
  const [customLocation, setCustomLocation] = useState("");
  const [lockSetting, setLockSetting] = useState(false);
  const [keepCharacterConsistent, setKeepCharacterConsistent] = useState(true);
  const [lockSettingLocation, setLockSettingLocation] = useState("");
  const [aiPenOpen, setAiPenOpen] = useState<number | null>(null);
  const [aiPenPrompt, setAiPenPrompt] = useState("");
  const [selectedForGeneration, setSelectedForGeneration] = useState<Set<number>>(new Set());
  const [referenceSceneIndex, setReferenceSceneIndex] = useState<number | null>(null);
  const [clearScenesOpen, setClearScenesOpen] = useState(false);
  const { confirmJob, confirmDialog: jobConfirmDialog } = useJobConfirmation();
  const { reanalyze, reanalyzing } = useReanalyze();
  const { segmentAudio } = useAnalysisEngine();
  const [resyncing, setResyncing] = useState(false);
  const resyncPendingRef = useRef(false);
  const resyncSelectedRef = useRef<Set<number> | null>(null);
  const [autoResyncEnabled, setAutoResyncEnabled] = useState<boolean>(() => loadAutoResyncPreference());
  // Per-project guard so a single mount auto-resyncs at most once even if
  // scenes/transcription references churn during hydration.
  const autoResyncAttemptedRef = useRef<string | null>(null);
  const resumedVideoJobsForRef = useRef<string | null>(null);

  // Per-segment generation progress: indices currently queued/generating,
  // and recently completed (for a brief visual flash).
  const [pendingSegments, setPendingSegments] = useState<Set<number>>(new Set());
  const [justCompletedSegments, setJustCompletedSegments] = useState<Set<number>>(new Set());
  const [segmentRunStartedAt, setSegmentRunStartedAt] = useState<number | null>(null);


  const selectedCharacter = selectedCharacterIndex !== null && selectedCharacterIndex < characterConcepts.length
    ? characterConcepts[selectedCharacterIndex] : null;
  const characterPayload = selectedCharacter
    ? { name: selectedCharacter.name, description: selectedCharacter.description, outfit: selectedCharacter.outfit, vibe: selectedCharacter.vibe } : null;

  const { getCharacterImageUrl, characterImageStorageUrl } = useCharacterImage({
    characterImageUrl: selectedCharacter?.imageUrl, userId: user?.id, projectId,
  });
  const { persistSceneImageUrl, persistSceneVideoUrl, persistScenesToDb } = useScenePersistence(projectId, user?.id);

  const gen = useSceneGeneration({
    scenes, setScenes, projectId, userId: user?.id,
    characterStyle, characterPayload, getCharacterImageUrl,
    persistSceneImageUrl, persistSceneVideoUrl,
    audioUrl, file, globalProvider, referenceSceneIndex, confirmJob,
    keepCharacterConsistent,
    trackDetails,
  });

  // Rehydrate per-scene retry preferences (provider/quality + last failure)
  // so a page refresh keeps the Retry option visible with the right details.
  useRetryPrefsPersistence(projectId, gen.videoJobs, gen.setVideoJobs);

  // Watch scenes — when a pending segment gets a matching scene, mark it complete
  // and briefly flash it as "Just added" before clearing.
  useEffect(() => {
    if (pendingSegments.size === 0) return;
    const completedNow: number[] = [];
    const stillPending = new Set<number>();
    pendingSegments.forEach((idx) => {
      const found = scenes.some((s) => (s.scene_number ?? 0) - 1 === idx);
      if (found) completedNow.push(idx);
      else stillPending.add(idx);
    });
    if (completedNow.length === 0) return;
    setPendingSegments(stillPending);
    setJustCompletedSegments((prev) => {
      const next = new Set(prev);
      completedNow.forEach((i) => next.add(i));
      return next;
    });
    const t = setTimeout(() => {
      setJustCompletedSegments((prev) => {
        const next = new Set(prev);
        completedNow.forEach((i) => next.delete(i));
        return next;
      });
    }, 2500);
    return () => clearTimeout(t);
  }, [scenes, pendingSegments]);

  // Safety net effect (defined below, after `handlers` exists).
  const wasGeneratingRef = useRef(false);

  const {
    videoHistoryOpen, setVideoHistoryOpen, videoHistoryItems,
    videoHistoryLoading, loadVideoHistory, restoreVideoFromHistory,
  } = useVideoHistory({ projectId, userId: user?.id, scenes, setScenes, freshlyGeneratedVideos: gen.freshlyGeneratedVideos });



  const handlers = useStoryboardHandlers({
    scenes, setScenes, projectId, userId: user?.id,
    verification, setVerification, characterPayload, sceneTheme, sceneGenre, sceneLocation,
    lockSetting, lockSettingLocation, audioSegments, transcription,
    savedSceneIndices, setSavedSceneIndices,
    gen, persistScenesToDb,
  });

  // Safety net: when the underlying generate run finishes, clear any leftover
  // pending markers (e.g. segments that failed to materialize as scenes).
  useEffect(() => {
    if (wasGeneratingRef.current && !handlers.generating && pendingSegments.size > 0) {
      const t = setTimeout(() => setPendingSegments(new Set()), 1500);
      return () => clearTimeout(t);
    }
    wasGeneratingRef.current = handlers.generating;
  }, [handlers.generating, pendingSegments.size]);

  // Prefetch videos for the active scene and 2 ahead
  const videoUrls = useMemo(() => scenes.map((s) => s.videoUrl || null), [scenes]);
  useVideoPreloader({
    urls: videoUrls,
    activeIndex: handlers.activeReviewIndex ?? 0,
    lookahead: 2,
  });

  // Create audio URL from file if not already set
  useEffect(() => {
    if (file && !audioUrl) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, audioUrl, setAudioUrl]);

  // Cleanup polling on unmount
  useEffect(() => { return () => { gen.cleanup(); }; }, []);

  // Warn user before closing/navigating away if jobs are active
  useEffect(() => {
    const hasActiveJobs = Object.values(gen.videoJobs).some(j => j?.status === "running") || gen.generatingAllImages;
    if (!hasActiveJobs) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have active video jobs. Are you sure you want to leave?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [gen.videoJobs, gen.generatingAllImages]);


  // Realtime subscription for render_jobs progress
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`render-jobs-progress:${user.id}`, { config: { private: true } })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'render_jobs', filter: `user_id=eq.${user.id}` }, gen.handleRealtimeUpdate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, gen.handleRealtimeUpdate]);

  // If the browser refreshes or the Storyboard step remounts while a render is
  // already running, reconnect the UI to the existing render_jobs row instead
  // of making the user start another provider job. Also re-runs on tab
  // focus/visibility so a backgrounded tab catches up to webhook-driven state.
  const rehydrateActiveJobs = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!projectId || !user?.id) {
      rehydrateActiveJobs.current = async () => {};
      return;
    }

    rehydrateActiveJobs.current = async () => {
      if (scenes.length === 0) return;
      const { data, error } = await supabase
        .from("render_jobs")
        .select("id, scene_number, provider_task_id, status_url, response_url, quality, provider, progress, created_at")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .in("status", ["queued", "submitted", "processing"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (error || !data?.length) return;

      const latestByScene = new Map<number, any>();
      for (const row of data) {
        if (row.scene_number == null || latestByScene.has(row.scene_number)) continue;
        if (!row.provider_task_id && !row.status_url) continue;
        latestByScene.set(row.scene_number, row);
      }
      if (latestByScene.size === 0) return;

      setScenes(prev => prev.map((scene) => {
        const row = latestByScene.get(scene.scene_number);
        if (!row || scene.videoUrl) return scene;
        // Skip if already wired up — avoid overwriting an in-flight attempt.
        if (scene.videoJobId === row.id && scene.generatingVideo) return scene;
        return {
          ...scene,
          generatingVideo: true,
          videoRequestId: row.provider_task_id || undefined,
          videoJobId: row.id,
          videoStatusUrl: row.status_url || undefined,
          videoResponseUrl: row.response_url || undefined,
          videoQuality: (row.quality as Scene["videoQuality"]) || scene.videoQuality,
        };
      }));

      scenes.forEach((scene, idx) => {
        const row = latestByScene.get(scene.scene_number);
        if (!row || scene.videoUrl) return;
        // Already polling this exact job → just kick it instead of restarting.
        const existing = gen.videoJobs[idx];
        if (existing?.status === "running" && scene.videoJobId === row.id) {
          gen.reconnectActiveJobs?.();
          return;
        }
        const provider = globalProvider || DEFAULT_STORYBOARD_PROVIDER;
        const quality = row.quality || "hd";
        // Capture any previously-seeded progress (from localStorage hydration
        // or a prior in-memory attempt) BEFORE startVideoProgress resets it
        // to 0, so the bar doesn't visibly snap backward on reconnect.
        const priorProgress = gen.videoJobs[idx]?.progress || 0;
        const priorRealProgress = gen.videoJobs[idx]?.realProgress ?? null;
        gen.startVideoProgress(idx, { quality, provider });
        gen.setVideoJobs(prev => ({
          ...prev,
          [idx]: {
            ...prev[idx],
            progress: Math.max(prev[idx]?.progress || 0, priorProgress, row.progress || 2),
            status: "running",
            startedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
            realProgress: typeof row.progress === "number" ? row.progress : priorRealProgress,
            phase: "processing",
            phaseUpdatedAt: row.created_at || null,
            lastProvider: provider,
            lastQuality: quality,
          },
        }));
        gen.startPolling(idx, row.provider_task_id || row.id, row.status_url || undefined, row.response_url || undefined, row.id, provider);
      });
    };

    // First-time rehydration per project mount.
    if (resumedVideoJobsForRef.current !== projectId && scenes.length > 0) {
      resumedVideoJobsForRef.current = projectId;
      void rehydrateActiveJobs.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user?.id, scenes.length]);

  // Reconnect fallback: when the user returns to the tab or refocuses the
  // window, kick the in-memory polling loops AND re-query the DB to adopt any
  // jobs that progressed (or completed) while the tab was backgrounded.
  useEffect(() => {
    if (!projectId || !user?.id) return;
    const onVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      gen.reconnectActiveJobs?.();
      void rehydrateActiveJobs.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [projectId, user?.id, gen.reconnectActiveJobs]);

  // Image generation is deliberately user-triggered. Navigating between scenes
  // must never consume credits or call a paid provider in the background.

  const pendingGenTriggered = useRef(false);
  useEffect(() => { if (pendingStoryboardGen) pendingGenTriggered.current = false; }, [pendingStoryboardGen]);
  useEffect(() => {
    if (pendingStoryboardGen && !pendingGenTriggered.current && !handlers.generating) {
      pendingGenTriggered.current = true; setPendingStoryboardGen(false);
      const timer = setTimeout(() => handlers.generateScenes(), 500);
      return () => clearTimeout(timer);
    }
  }, [pendingStoryboardGen, handlers.generating]);

  // Re-sync lyrics from active transcript: re-segment audio, then regenerate
  // only the selected scenes (or all scenes when no selection is supplied).
  // After segmentAudio resolves, audioSegments updates in context → handlers closure
  // refreshes → the effect below kicks off generateScenes with the fresh buckets.
  const handleResyncLyrics = async (selectedSceneNumbers?: Set<number>) => {
    if (resyncing || handlers.generating || gen.generatingAllImages) return;
    if (!transcription?.words?.length) {
      toast.error("No transcript words available — run Analyze Track first.");
      return;
    }
    setResyncing(true);
    resyncPendingRef.current = true;
    if (selectedSceneNumbers?.size) {
      resyncSelectedRef.current = new Set(
        Array.from(selectedSceneNumbers).map((n) => n - 1).filter((i) => i >= 0),
      );
    } else {
      resyncSelectedRef.current = null;
    }
    try {
      toast.info("Re-segmenting audio…");
      await segmentAudio();
      // generateScenes is dispatched from the effect below once audioSegments updates.
    } catch (err: any) {
      console.error("Re-sync lyrics failed:", err);
      toast.error(err?.message || "Failed to re-segment audio.");
      resyncPendingRef.current = false;
      resyncSelectedRef.current = null;
      setResyncing(false);
    }
  };

  // Realign each scene's lyric_segment and Character Performance text against
  // the master word-timed transcript using the scene's existing
  // time_start/time_end. No AI calls, no re-segmentation — pure local rewrite.
  // The flow is dry-run first: compute proposed changes, show a diff dialog,
  // and only persist after explicit user confirmation.
  type RealignRow = {
    scene_number: number;
    time_start: string;
    time_end: string;
    oldLyrics: string;
    newLyrics: string;
    oldAction: string;
    newAction: string;
    changed: boolean;
  };
  const [realigning, setRealigning] = useState(false);
  const [realignPreviewOpen, setRealignPreviewOpen] = useState(false);
  const [realignRows, setRealignRows] = useState<RealignRow[]>([]);
  const [realignSelected, setRealignSelected] = useState<Set<number>>(new Set());
  const [realignResults, setRealignResults] = useState<Map<number, "success" | "skipped" | "error">>(new Map());

  const computeRealignRows = (): RealignRow[] => {
    const words = (transcription?.words ?? []) as Array<{ text: string; start: number; end: number }>;
    const verb = sceneGenre === "Hip-Hop" ? "raps" : "sings";
    return scenes.map((s, i) => {
      const start = timeToSeconds(s.time_start || "0:00");
      const end = timeToSeconds(s.time_end || "0:00");
      const hits = end > start
        ? words
            .filter((w) => typeof w.start === "number" && w.start >= start - 0.05 && w.start < end + 0.05)
            .map((w) => String(w.text ?? "").trim())
            .filter(Boolean)
        : [];
      const newLyrics = hits.join(" ").replace(/\s+/g, " ").trim();
      const newAction = newLyrics
        ? `Character ${verb} the transcribed lyrics: "${newLyrics}". Passionate delivery with direct eye contact.`
        : `Character ${verb} to camera with passionate delivery.`;
      const oldLyrics = s.lyric_segment || "";
      const oldAction = s.action_description || "";
      const changed = oldLyrics !== newLyrics || oldAction !== newAction;
      return {
        scene_number: s.scene_number ?? i + 1,
        time_start: s.time_start || "",
        time_end: s.time_end || "",
        oldLyrics, newLyrics, oldAction, newAction, changed,
      };
    });
  };

  const handleRealignLyrics = () => {
    if (realigning || handlers.generating || gen.generatingAllImages) return;
    if (!transcription?.words?.length) {
      toast.error("No transcript words available — run Analyze Track first.");
      return;
    }
    if (!scenes.length) {
      toast.info("No scenes to realign.");
      return;
    }
    const rows = computeRealignRows();
    setRealignRows(rows);
    setRealignSelected(new Set(rows.filter((r) => r.changed).map((r) => r.scene_number)));
    setRealignResults(new Map());
    setRealignPreviewOpen(true);
  };

  const applyRealign = async () => {
    if (realignSelected.size === 0) {
      toast.info("No scenes selected.");
      return;
    }
    if (!projectId || !user?.id) {
      toast.error("Not signed in — cannot persist changes.");
      return;
    }
    setRealigning(true);
    setRealignResults(new Map());
    try {
      const byNumber = new Map(realignRows.map((r) => [r.scene_number, r]));

      // Backend validation: only scene_numbers that are BOTH selected AND have a
      // computed-changed row are eligible. This is the allow-list for DB writes.
      const allowedNumbers = Array.from(realignSelected).filter((num) => {
        const row = byNumber.get(num);
        return !!row && row.changed;
      });

      if (allowedNumbers.length === 0) {
        toast.info("No selected scenes have changes to apply.");
        setRealigning(false);
        return;
      }

      // Verify the targeted rows exist and belong to the current user/project
      // before writing. Prevents accidental updates to scenes that were deleted
      // or re-numbered while the preview dialog was open.
      const { data: existingRows, error: fetchErr } = await supabase
        .from("scenes")
        .select("scene_number")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .in("scene_number", allowedNumbers);
      if (fetchErr) throw fetchErr;
      const existingNumbers = new Set((existingRows ?? []).map((r: any) => r.scene_number));
      const writableNumbers = allowedNumbers.filter((n) => existingNumbers.has(n));
      const notFound = allowedNumbers.filter((n) => !existingNumbers.has(n));

      const results = new Map<number, "success" | "skipped" | "error">();
      for (const num of notFound) results.set(num, "skipped");
      setRealignResults(new Map(results));

      if (writableNumbers.length === 0) {
        toast.error("Selected scenes no longer exist in the database.");
        setRealigning(false);
        return;
      }

      // Targeted per-scene updates — only lyric_segment + action_description,
      // scoped by project_id + user_id + scene_number. No other rows touched.
      let successCount = 0;
      for (const num of writableNumbers) {
        const row = byNumber.get(num)!;
        try {
          const { error: updErr } = await supabase
            .from("scenes")
            .update({ lyric_segment: row.newLyrics, action_description: row.newAction })
            .eq("project_id", projectId)
            .eq("user_id", user.id)
            .eq("scene_number", num);
          if (updErr) {
            results.set(num, "error");
            console.error(`Realign update failed for scene ${num}:`, updErr);
          } else {
            results.set(num, "success");
            successCount++;
          }
        } catch (e) {
          results.set(num, "error");
          console.error(`Realign update failed for scene ${num}:`, e);
        }
        setRealignResults(new Map(results));
      }

      const successNumbers = new Set(
        Array.from(results.entries())
          .filter(([, status]) => status === "success")
          .map(([num]) => num),
      );
      const updated = scenes.map((s, i) => {
        const num = s.scene_number ?? i + 1;
        if (!successNumbers.has(num)) return s;
        const row = byNumber.get(num)!;
        return { ...s, lyric_segment: row.newLyrics, action_description: row.newAction };
      });
      setScenes(updated);

      if (verification && setVerification) {
        const masterLyrics = updated.map((s) => s.lyric_segment || "").filter((l) => l.trim()).join("\n");
        setVerification({ ...verification, verified_lyrics: masterLyrics });
        await supabase.from("projects").update({ lyrics: masterLyrics }).eq("id", projectId);
      }

      const errorCount = Array.from(results.values()).filter((s) => s === "error").length;
      const skippedCount = Array.from(results.values()).filter((s) => s === "skipped").length;

      if (successCount > 0) {
        toast.success(
          `Realigned ${successCount} scene${successCount === 1 ? "" : "s"} successfully${errorCount > 0 ? `, ${errorCount} error${errorCount === 1 ? "" : "s"}` : ""}${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}.`,
        );
      } else if (errorCount > 0) {
        toast.error(`${errorCount} scene${errorCount === 1 ? "" : "s"} failed to update.`);
      } else {
        toast.info("No scenes were updated.");
      }
    } catch (err: any) {
      console.error("Realign lyrics failed:", err);
      toast.error(err?.message || "Failed to realign lyrics.");
    } finally {
      setRealigning(false);
    }
  };

  const toggleRealignScene = (num: number) => {
    setRealignSelected((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  };

  const realignChangedCount = realignRows.filter((r) => r.changed).length;




  useEffect(() => {
    if (!resyncPendingRef.current) return;
    if (!audioSegments?.length) return;
    resyncPendingRef.current = false;
    const selectedIndices = resyncSelectedRef.current;
    resyncSelectedRef.current = null;
    (async () => {
      try {
        const targetCount = selectedIndices?.size ?? audioSegments.length;
        toast.info(`Regenerating ${targetCount} scene${targetCount === 1 ? "" : "s"} with fresh lyrics…`);
        await handlers.generateScenes(selectedIndices ?? undefined);
        toast.success(`Re-synced ${targetCount} scene${targetCount === 1 ? "" : "s"} from active transcript.`);
      } catch (err: any) {
        console.error("Re-sync scene regen failed:", err);
        toast.error(err?.message || "Failed to regenerate scenes.");
      } finally {
        setResyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSegments]);


  // Auto-resync: when the storyboard loads with empty/corrupt lyrics and the
  // user has not opted out, trigger handleResyncLyrics automatically — at most
  // once per project per mount. Requires a transcript with word timings;
  // otherwise the banner will instruct the user to run Analyze Track first.
  useEffect(() => {
    if (!autoResyncEnabled) return;
    if (!projectId) return;
    if (autoResyncAttemptedRef.current === projectId) return;
    if (resyncing || handlers.generating || gen.generatingAllImages) return;
    if (!scenes.length) return;
    if (!transcription?.words?.length) return;

    const health = analyzeLyricsHealth(scenes);
    if (!health.needsResync) return;

    autoResyncAttemptedRef.current = projectId;
    toast.info(
      health.garbage > 0
        ? `Auto re-syncing: ${health.garbage} scene${health.garbage === 1 ? "" : "s"} have corrupt lyrics.`
        : `Auto re-syncing: ${health.missing} of ${health.total} scenes are missing lyrics.`
    );
    handleResyncLyrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResyncEnabled, projectId, scenes, transcription?.words?.length, resyncing, handlers.generating, gen.generatingAllImages]);



  const toggleSceneSelection = (idx: number) => {
    setSelectedForGeneration(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  };
  const selectAllForGeneration = () => { const localLipSync = globalProvider === "musetalk-local"; setSelectedForGeneration(new Set(scenes.map((s, i) => !s.generatingVideo && (localLipSync ? !!s.videoUrl : !!s.imageUrl) ? i : -1).filter(i => i >= 0))); };
  const deselectAllForGeneration = () => { setSelectedForGeneration(new Set()); };

  // Indices of scenes whose last video job failed or timed out and aren't currently running.
  const failedSceneIndices = useMemo(() => {
    return scenes
      .map((s, i) => {
        if (s.generatingVideo) return -1;
        const job = gen.videoJobs[i];
        if (!job) return -1;
        const failed = job.status === "error" || job.timedOut;
        if (!failed) return -1;
        if (!s.imageUrl) return -1; // can't retry without source image
        return i;
      })
      .filter((i) => i >= 0);
  }, [scenes, gen.videoJobs]);

  const [retryingAll, setRetryingAll] = useState(false);
  const retryAllFailed = async () => {
    if (failedSceneIndices.length === 0 || retryingAll) return;
    // Group by provider so we can confirm cost in a single prompt per provider.
    const groups = new Map<string, { quality: string; indices: number[] }>();
    for (const i of failedSceneIndices) {
      const job = gen.videoJobs[i];
      const provider = job?.lastProvider || globalProvider;
      const quality = job?.lastQuality || "hd";
      const key = `${provider}::${quality}`;
      const g = groups.get(key) || { quality, indices: [] };
      g.indices.push(i);
      groups.set(key, g);
    }
    setRetryingAll(true);
    try {
      let started = 0;
      for (const [key, g] of groups) {
        const provider = key.split("::")[0];
        const ok = await confirmJob(provider, g.indices.length);
        if (!ok) continue;
        for (const i of g.indices) {
          gen.submitVideoJob(i, g.quality as "hd" | "preview", provider, referenceSceneIndex);
          started += 1;
        }
      }
      if (started > 0) {
        toast.success(`Retrying ${started} failed scene${started === 1 ? "" : "s"}`);
      }
    } finally {
      setRetryingAll(false);
    }
  };

  const renderVideoButton = (scene: Scene, i: number) => (
    <VideoGenerateButton
      scene={scene} sceneIndex={i} globalProvider={globalProvider}
      videoJob={gen.videoJobs[i]} referenceSceneIndex={referenceSceneIndex}
      gen={gen} confirmJob={confirmJob}
    />
  );

  const transcriptLocked = transcriptLockStatus !== "unlocked" || transcriptQualityStatus === "good";

  // Validate the Track Details that flow into every prompt string.
  // If aspect_ratio or visual_style fails sanitisation we surface an
  // inline message and disable the two primary Generate entry points
  // (StoryboardToolbar bulk generate + EmptyStatePanel first-run) so
  // the user can't spend credits on a prompt built from bad input.
  const trackIssues = useMemo(() => {
    // Client-side validation runs first so the UI stays reactive as the
    // user types. Server-reported rejections from the last edge-function
    // call are merged in on top so any strict-schema failure surfaces
    // inline until the next successful invoke clears it.
    const local = validateTrackDetailInputs({
      aspect_ratio: trackDetails?.aspect_ratio,
      visual_style: trackDetails?.visual_style,
    });
    return {
      aspect_ratio: local.aspect_ratio ?? serverTrackDetailIssues?.aspect_ratio,
      visual_style: local.visual_style ?? serverTrackDetailIssues?.visual_style,
    };
  }, [trackDetails?.aspect_ratio, trackDetails?.visual_style, serverTrackDetailIssues?.aspect_ratio, serverTrackDetailIssues?.visual_style]);
  const trackBlocked = hasTrackDetailIssues(trackIssues);
  const guardedGenerateScenes = useMemo(() => {
    const original = handlers.generateScenes;
    return (onlyIndices?: Set<number>) => {
      if (trackBlocked) {
        toast.error("Fix the Track Details errors above before generating.");
        return;
      }
      return original(onlyIndices);
    };
  }, [handlers.generateScenes, trackBlocked]);

  return (
    <div className="space-y-6">
      <TrackSummaryStrip
        title={verification?.verified_lyrics ? undefined : undefined /* project name comes from parent header */}
        bpm={verification?.bpm}
        musicKey={verification?.music_key}
        mood={verification?.mood}
        durationSec={transcription?.words?.length ? transcription.words[transcription.words.length - 1]?.end : undefined}
        sceneCount={scenes.length}
      />
      <TrackDetailsSummary details={trackDetails} fallbackMood={verification?.mood} issues={trackIssues} adjustments={trackDetailAdjustments} />
      <div className="flex justify-end">
        <RealtimeStatusBadge status={gen.realtimeStatus} onReconnect={gen.reconnectRealtime} onReset={gen.resetRealtime} attempt={gen.reconnectAttempt} nextRetryAt={gen.nextRetryAt} />
      </div>
      <DiagnosticsPanel />
      {!transcriptLocked && (
        <div className="glass-card border-warning/40 bg-warning/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-warning">Transcript is not verified yet</div>
            <div className="text-muted-foreground">
              Scene generation is blocked because the lyrics still come from an unverified ASR guess.
              Go to the <strong>Analysis</strong> step, paste your verified reference lyrics in the
              <em> Verified Lyrics Lock</em> panel, then click <strong>Mark verified</strong>.
            </div>
          </div>
        </div>
      )}
      <SectionErrorBoundary name="Entitlement Locks">
        <EntitlementLocksPanel />
      </SectionErrorBoundary>
      <SectionErrorBoundary name="Lyrics Validation">

        <LyricsValidationBanner
          scenes={scenes}
          hasTranscriptWords={!!transcription?.words?.length}
          transcriptWords={transcription?.words ?? []}
          resyncing={resyncing}
          busy={handlers.generating || gen.generatingAllImages}
          onResync={handleResyncLyrics}
          onAutoResyncChange={setAutoResyncEnabled}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRealignLyrics}
            disabled={realigning || handlers.generating || gen.generatingAllImages || !transcription?.words?.length}
            title="Rewrite each scene's lyrics & Character Performance from the master transcript using its time window"
          >
            {realigning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
            Preview realign from transcript
          </Button>
        </div>
      </SectionErrorBoundary>

      <SectionErrorBoundary name="Storyboard Toolbar">
        <StoryboardToolbar
          scenes={scenes} setScenes={setScenes} projectId={projectId} userId={user?.id}
          activeReviewIndex={handlers.activeReviewIndex} setActiveReviewIndex={handlers.setActiveReviewIndex}
          sceneApproved={handlers.sceneApproved} generating={handlers.generating}
          setGenerating={handlers.setGenerating} setRegeneratingScene={handlers.setRegeneratingScene}
          lockSetting={lockSetting} setLockSetting={setLockSetting}
          sceneTheme={sceneTheme} setSceneTheme={setSceneTheme}
          customTheme={customTheme} setCustomTheme={setCustomTheme}
          sceneLocation={sceneLocation} setSceneLocation={setSceneLocation}
          customLocation={customLocation} setCustomLocation={setCustomLocation}
          sceneGenre={sceneGenre} setSceneGenre={setSceneGenre}
          selectedForGeneration={selectedForGeneration}
          selectAllForGeneration={selectAllForGeneration} deselectAllForGeneration={deselectAllForGeneration}
          globalProvider={globalProvider} setGlobalProvider={setGlobalProvider}
          referenceSceneIndex={referenceSceneIndex} setReferenceSceneIndex={setReferenceSceneIndex}
          keepCharacterConsistent={keepCharacterConsistent} setKeepCharacterConsistent={setKeepCharacterConsistent}
          gen={gen} characterImageStorageUrl={characterImageStorageUrl}
          setSceneRatings={handlers.setSceneRatings} setSceneComments={handlers.setSceneComments}
          generateScenes={guardedGenerateScenes}
          onResyncLyrics={handleResyncLyrics}
          resyncing={resyncing}
          hasTranscriptWords={!!transcription?.words?.length}
          disableGenerate={trackBlocked}
          disableGenerateReason={trackBlocked ? "Fix Track Details errors above to enable generation." : undefined}
          visualStyle={trackDetails?.visual_style}

          onBulkLyricsSave={(updates) => {
            setScenes(prev => {
              const next = [...prev];
              updates.forEach(({ sceneIndex, lyric_segment }) => {
                if (next[sceneIndex]) next[sceneIndex] = { ...next[sceneIndex], lyric_segment };
              });
              return next;
            });
          }}
        />
      </SectionErrorBoundary>

      {scenes.length === 0 || (handlers.generating && scenes.length === 0) ? (
        <EmptyStatePanel
          generating={handlers.generating} verification={verification}
          lockSetting={lockSetting} setLockSetting={setLockSetting}
          lockSettingLocation={lockSettingLocation} setLockSettingLocation={setLockSettingLocation}
          onGenerate={guardedGenerateScenes}
          disableGenerate={trackBlocked}
          disableGenerateReason={trackBlocked ? "Fix Track Details errors above to enable generation." : undefined}
          onReanalyze={reanalyze} reanalyzing={reanalyzing}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <SceneProgressBar
              scenes={scenes} activeReviewIndex={handlers.activeReviewIndex}
              sceneApproved={handlers.sceneApproved} onSelectScene={handlers.setActiveReviewIndex}
              segmentStatus={handlers.segmentStatus}
              videoJobErrors={Object.fromEntries(
                Object.entries(gen.videoJobs)
                  .filter(([, j]: [string, any]) => j && (j.status === "error" || j.timedOut) && j.error)
                  .map(([k, j]: [string, any]) => [Number(k), String(j.error)])
              )}
              onRetrySegment={handlers.retrySegment}
              onRetryAllFailed={handlers.retryFailedSegments}
              generating={handlers.generating}
            />

            <Button
              size="sm"
              variant="outline"
              disabled={handlers.generating || resyncing}
              onClick={async () => {
                if (!confirm(`Regenerate all ${scenes.length} scenes using the latest lyric-to-scene prompt? Existing scene prompts will be overwritten (media is preserved).`)) return;
                try {
                  toast.info(`Regenerating ${scenes.length} scene${scenes.length === 1 ? "" : "s"} with latest prompt…`);
                  await handlers.generateScenes();
                  toast.success("Storyboard regenerated from latest prompt.");
                } catch (err: any) {
                  toast.error(err?.message || "Failed to regenerate storyboard.");
                }
              }}
              className="h-8 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10"
              title="Re-run scene generation using the latest lyric-to-scene prompt settings"
            >
              {handlers.generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate storyboard
            </Button>
          </div>


          {(() => {
            const segCount = audioSegments?.length ?? 0;
            if (segCount === 0) return null;
            const covered = new Set<number>(scenes.map(s => (s.scene_number ?? 0) - 1).filter(i => i >= 0));
            const missing: number[] = [];
            for (let i = 0; i < segCount; i++) if (!covered.has(i)) missing.push(i);
            const extra = scenes.filter(s => (s.scene_number ?? 0) > segCount).map(s => s.scene_number);
            if (missing.length === 0 && extra.length === 0 && scenes.length === segCount) return null;
            return (
              <div className="glass-card border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-wrap items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 text-xs space-y-1">
                  <div className="font-semibold text-amber-200">
                    Scene coverage mismatch — {scenes.length} scene{scenes.length === 1 ? "" : "s"} for {segCount} segment{segCount === 1 ? "" : "s"}
                  </div>
                  {missing.length > 0 && (
                    <div className="text-amber-100/90">
                      Missing scene{missing.length === 1 ? "" : "s"} for segment{missing.length === 1 ? "" : "s"}: {missing.slice(0, 20).map(i => `#${i + 1}`).join(", ")}{missing.length > 20 ? `, +${missing.length - 20} more` : ""}
                    </div>
                  )}
                  {extra.length > 0 && (
                    <div className="text-amber-100/90">
                      Extra scene{extra.length === 1 ? "" : "s"} beyond segment count: {extra.slice(0, 10).map(n => `#${n}`).join(", ")}
                    </div>
                  )}
                </div>
                {missing.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={handlers.generating}
                    onClick={() => handlers.generateScenes(new Set(missing))}
                    className="h-7 gap-1.5 text-[11px] border-amber-400/60 text-amber-100 hover:bg-amber-500/20"
                  >
                    {handlers.generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Generate {missing.length} missing
                  </Button>
                )}
              </div>
            );
          })()}

          {(audioSegments?.length ?? 0) > 0 && (
            <details className="glass-card px-4 py-3 group">
              <summary className="flex items-center justify-between cursor-pointer text-xs font-semibold text-foreground list-none">
                <span className="flex items-center gap-2">
                  Segment ↔ Scene Coverage
                  <span className="text-[10px] font-normal text-muted-foreground">
                    ({scenes.length}/{audioSegments.length} matched)
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground group-open:hidden">Show table</span>
                <span className="text-[10px] text-muted-foreground hidden group-open:inline">Hide</span>
              </summary>
              {(() => {
                const missing = audioSegments.map((_, i) => i).filter(i => !scenes.find(s => (s.scene_number ?? 0) - 1 === i));
                const pendingCount = pendingSegments.size;
                const totalRun = pendingCount + justCompletedSegments.size;
                const showProgress = totalRun > 0 || (segmentRunStartedAt !== null && pendingCount === 0 && justCompletedSegments.size > 0);
                const completedInRun = showProgress ? justCompletedSegments.size : 0;
                const runTotal = showProgress ? totalRun : 0;
                return (
                  <div className="flex flex-col gap-2 mb-2">
                    {missing.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-[11px] border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                          disabled={handlers.generating || pendingCount > 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingSegments(new Set(missing));
                            setJustCompletedSegments(new Set());
                            setSegmentRunStartedAt(Date.now());
                            handlers.generateScenes(new Set(missing));
                          }}
                        >
                          {(handlers.generating || pendingCount > 0) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                          Generate all missing ({missing.length})
                        </Button>
                        {pendingCount > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {completedInRun}/{runTotal} done · {pendingCount} in progress
                          </span>
                        )}
                      </div>
                    )}
                    {showProgress && runTotal > 0 && (
                      <div className="h-1.5 w-full rounded-full bg-secondary/60 overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-500 ease-out"
                          style={{ width: `${Math.round((completedInRun / runTotal) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="mt-3 max-h-[320px] overflow-y-auto scrollbar-thin rounded border border-border/40">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-secondary/80 backdrop-blur text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <th className="text-left px-2 py-1.5 font-medium">Segment</th>
                      <th className="text-left px-2 py-1.5 font-medium">Time</th>
                      <th className="text-left px-2 py-1.5 font-medium">Scene ID</th>
                      <th className="text-left px-2 py-1.5 font-medium">Lyric</th>
                      <th className="text-left px-2 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audioSegments.map((seg, i) => {
                      const scene = scenes.find(s => (s.scene_number ?? 0) - 1 === i);
                      const hasVideo = !!scene?.videoUrl;
                      const hasImage = !!scene?.imageUrl;
                      const isPending = pendingSegments.has(i);
                      const isJustDone = justCompletedSegments.has(i);
                      const fmt = (t: number) => {
                        const m = Math.floor(t / 60); const s = Math.floor(t % 60);
                        return `${m}:${s.toString().padStart(2, "0")}`;
                      };
                      let statusLabel = "Missing", statusCls = "bg-destructive/15 text-destructive border-destructive/30";
                      let statusIcon: React.ReactNode = null;
                      if (isPending && !scene) {
                        statusLabel = "Generating…";
                        statusCls = "bg-primary/15 text-primary border-primary/30";
                        statusIcon = <Loader2 className="h-2.5 w-2.5 animate-spin" />;
                      } else if (scene) {
                        if (hasVideo) { statusLabel = "Video"; statusCls = "bg-green-500/15 text-green-400 border-green-500/30"; }
                        else if (hasImage) { statusLabel = "Image"; statusCls = "bg-amber-500/15 text-amber-300 border-amber-500/30"; }
                        else if (scene.generatingVideo) { statusLabel = "Generating"; statusCls = "bg-primary/15 text-primary border-primary/30"; statusIcon = <Loader2 className="h-2.5 w-2.5 animate-spin" />; }
                        else { statusLabel = "Pending"; statusCls = "bg-muted text-muted-foreground border-border"; }
                        if (isJustDone) {
                          statusLabel = "Just added";
                          statusCls = "bg-green-500/20 text-green-300 border-green-500/40";
                          statusIcon = <CheckCircle2 className="h-2.5 w-2.5" />;
                        }
                      }
                      const rowBg = isJustDone
                        ? "bg-green-500/10 hover:bg-green-500/15 cursor-pointer animate-in fade-in"
                        : isPending && !scene
                          ? "bg-primary/5 hover:bg-primary/10"
                          : scene
                            ? "hover:bg-secondary/40 cursor-pointer"
                            : "bg-destructive/5";
                      return (
                        <tr
                          key={i}
                          onClick={() => scene && handlers.setActiveReviewIndex(scenes.indexOf(scene))}
                          className={`border-b border-border/30 ${rowBg}`}
                        >
                          <td className="px-2 py-1.5 font-mono">#{i + 1}</td>
                          <td className="px-2 py-1.5 text-muted-foreground font-mono">{fmt(seg.start_sec)}–{fmt(seg.end_sec)}</td>
                          <td className="px-2 py-1.5 font-mono">{scene ? `S${scene.scene_number}` : "—"}</td>
                          <td className="px-2 py-1.5 max-w-[260px] truncate text-muted-foreground">{seg.lyrics || scene?.lyric_segment || "Instrumental"}</td>
                          <td className="px-2 py-1.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCls}`}>
                              {statusIcon}
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {scenes.filter(s => (s.scene_number ?? 0) > audioSegments.length).map(s => (
                      <tr key={`extra-${s.scene_number}`} className="border-b border-border/30 bg-amber-500/5">
                        <td className="px-2 py-1.5 font-mono text-muted-foreground">—</td>
                        <td className="px-2 py-1.5 text-muted-foreground font-mono">{s.time_start}–{s.time_end}</td>
                        <td className="px-2 py-1.5 font-mono">S{s.scene_number}</td>
                        <td className="px-2 py-1.5 max-w-[260px] truncate text-muted-foreground">{s.lyric_segment || "Instrumental"}</td>
                        <td className="px-2 py-1.5">
                          <span className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-300 border-amber-500/30">
                            Extra
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}


          {scenes.length > 0 && (
            <div className="glass-card px-4 py-3 space-y-3">
              <ProjectAudioAuditBanner projectId={projectId} totalScenes={scenes.length} />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-xs font-semibold text-foreground">All Scenes</h4>
                <div className="flex items-center gap-2">
                  {failedSceneIndices.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={retryAllFailed}
                      disabled={retryingAll}
                      className="h-7 gap-1.5 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      title={`Retry ${failedSceneIndices.length} failed/timed-out scene${failedSceneIndices.length === 1 ? "" : "s"}`}
                    >
                      {retryingAll
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <RefreshCw className="h-3 w-3" />}
                      Retry failed ({failedSceneIndices.length})
                    </Button>
                  )}
                  <DownloadStoryboardButton scenes={scenes} projectName={projectId} />
                  <ExportPayloadFlagsButton projectId={projectId} />
                  <span className="text-[10px] text-muted-foreground">
                    {scenes.filter(s => s.videoUrl).length}/{scenes.length} videos
                  </span>
                </div>
              </div>
              <AllScenesPanel
                scenes={scenes} activeReviewIndex={handlers.activeReviewIndex}
                selectedForGeneration={selectedForGeneration}

                onSelectScene={handlers.setActiveReviewIndex} onToggleSelection={toggleSceneSelection}
              />
              <PayloadFlagsFilterPanel
                projectId={projectId}
                scenes={scenes}
                onSelectScene={handlers.setActiveReviewIndex}
              />
            </div>
          )}

          {scenes.filter((_, i) => i === handlers.activeReviewIndex).map((scene) => {
            const i = handlers.activeReviewIndex;
            return (
              <SectionErrorBoundary key={`${scene.scene_number}-${i}`} name={`Scene ${i + 1}`}>
                <SceneCard
                  projectId={projectId || undefined}
                  scene={scene} sceneIndex={i} totalScenes={scenes.length}
                  activeReviewIndex={handlers.activeReviewIndex}
                  isSelected={selectedForGeneration.has(i)}
                  onToggleSelection={toggleSceneSelection}
                  isApproved={!!handlers.sceneApproved[i]}
                  onApprove={handlers.handleApprove}
                  onUnapprove={handlers.handleUnapprove}
                  isSavedForAssembly={savedSceneIndices.includes(i)}
                  onToggleAssembly={handlers.handleToggleAssembly}
                  onPrev={() => handlers.setActiveReviewIndex(Math.max(0, handlers.activeReviewIndex - 1))}
                  onNext={() => handlers.setActiveReviewIndex(Math.min(scenes.length - 1, handlers.activeReviewIndex + 1))}
                  onRegenerateImage={gen.regenerateSceneImage}
                  onGenerateImage={gen.generateSingleSceneImage}
                  onRegenerateScene={handlers.regenerateScene}
                  onDeleteScene={handlers.deleteScene}
                  onDeleteVideo={handlers.handleDeleteVideo}
                  onDeleteVideoFal={handlers.requestDeleteVideoFal}
                  onDownloadVideo={handlers.downloadSceneVideo}
                  isDownloading={handlers.downloadingSceneIdx === i}
                  onRegenerateWithCharacter={gen.regenerateWithCharacterImage}
                  onSubmitUpscale={gen.submitUpscaleJob}
                  onLoadVideoHistory={loadVideoHistory}
                  onUpdateScene={handlers.handleUpdateScene}
                  editingTime={handlers.editingTime}
                  onSetEditingTime={handlers.setEditingTime}
                  onCommitTimeEdit={handlers.commitTimeEdit}
                  aiPenOpen={aiPenOpen} aiPenPrompt={aiPenPrompt}
                  aiPenLoading={gen.aiPenLoading}
                  onSetAiPenOpen={setAiPenOpen} onSetAiPenPrompt={setAiPenPrompt}
                   onAiEditImage={gen.aiEditSceneImage}
                   previousImageUrl={gen.previousImageUrls.current[i] || null}
                   onUndoAiEdit={gen.undoAiEdit}
                   onSaveAiEdit={gen.saveAiEdit}
                   onPullFromGallery={(idx, videoUrl) => {
                     setScenes(prev => prev.map((s, si) =>
                       si === idx ? { ...s, videoUrl: videoUrl, videoQuality: "hd" as const } : s
                     ));
                     if (projectId && user) {
                       supabase.from("scenes")
                         .update({ video_url: videoUrl, video_quality: "hd" })
                         .eq("project_id", projectId)
                         .eq("scene_number", scene.scene_number ?? idx + 1)
                         .eq("user_id", user.id)
                         .then(() => {});
                     }
                   }}
                   renderVideoButton={renderVideoButton}
                  rating={handlers.sceneRatings[i] || 0}
                  comment={handlers.sceneComments[i] || ""}
                  autoOptimizing={!!gen.autoOptimizing[i]}
                  onRatingChange={handlers.handleRatingChange}
                  onCommentChange={handlers.handleCommentSubmit}
                  upscaleJob={gen.upscaleJobs[i]}
                  regeneratingScene={handlers.regeneratingScene}
                  onCancelRegenerate={() => handlers.setRegeneratingScene(null)}
                  transcription={transcription}
                />
              </SectionErrorBoundary>
            );
          })}
        </div>
      )}

      <ApprovedScenesSummary
        scenes={scenes} sceneApproved={handlers.sceneApproved}
        savedSceneIndices={savedSceneIndices} onSelectScene={handlers.setActiveReviewIndex}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={onPrev} className="gap-2 border-border text-foreground hover:bg-secondary">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
          </Button>
          <SaveProgressButton stepIndex={3} onBeforeSave={async () => { await persistScenesToDb(scenes); }} />
          <RecallGalleryDialog
            currentSceneCount={scenes.length}
            onRecallToScene={(asset, targetIdx) => {
              setScenes(prev => {
                const next = [...prev];
                if (next[targetIdx]) {
                  const updates: Partial<Scene> = {};
                  if (asset.type === "video" && asset.video_url) {
                    updates.videoUrl = asset.video_url;
                    updates.videoQuality = "hd";
                  }
                  if (asset.image_url) {
                    updates.imageUrl = asset.image_url;
                  }
                  next[targetIdx] = { ...next[targetIdx], ...updates };
                }
                return next;
              });
              // Persist to DB
              if (projectId && user?.id) {
                const scene = scenes[targetIdx];
                if (scene) {
                  const dbUpdate: Record<string, unknown> = {};
                  if (asset.type === "video" && asset.video_url) {
                    dbUpdate.video_url = asset.video_url;
                    dbUpdate.video_quality = "hd";
                  }
                  if (asset.image_url) {
                    dbUpdate.scene_image_url = asset.image_url;
                  }
                  supabase.from("scenes").update(dbUpdate as never)
                    .eq("project_id", projectId)
                    .eq("scene_number", scene.scene_number)
                    .eq("user_id", user.id)
                    .then();
                }
              }
              handlers.setActiveReviewIndex(targetIdx);
            }}
          />
          <Button
            variant="outline" size="sm"
            onClick={reanalyze} disabled={reanalyzing}
            className="gap-1.5 text-xs"
            title="Re-run verification from saved transcription"
          >
            {reanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Re-analyze</span>
          </Button>
          <ProviderTimeoutSettings />
          {scenes.length > 0 && (
            <Button variant="outline" size="sm"
              onClick={() => setClearScenesOpen(true)}
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Clear Scenes</span>
            </Button>
          )}
        </div>
        <Button onClick={onNext} disabled={savedSceneIndices.length === 0} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold w-full sm:w-auto sm:px-6">
          <Film className="h-4 w-4" /> <span className="hidden sm:inline">Go to Assembly</span><span className="sm:hidden">Assembly</span> ({savedSceneIndices.length}) <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <VideoHistoryDialog
        sceneIndex={videoHistoryOpen} items={videoHistoryItems}
        loading={videoHistoryLoading} onClose={() => setVideoHistoryOpen(null)}
        onRestore={restoreVideoFromHistory}
      />

      {jobConfirmDialog}

      <AlertDialog open={handlers.pendingFalDelete !== null} onOpenChange={(open) => { if (!open) handlers.setPendingFalDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete from storage?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the video file(s) from FAL storage. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlers.confirmDeleteVideoFal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearScenesOpen} onOpenChange={setClearScenesOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all {scenes.length} scenes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all scene descriptions, images, and video references. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setScenes([]); setSavedSceneIndices([]); setClearScenesOpen(false);
                // Also delete from DB
                if (projectId && user?.id) {
                  await supabase.from("scenes").delete().eq("project_id", projectId).eq("user_id", user.id);
                }
                toast.success("All scenes cleared");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear All Scenes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={realignPreviewOpen} onOpenChange={(o) => { if (!realigning) setRealignPreviewOpen(o); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview realign from transcript</DialogTitle>
            <DialogDescription>
              {realignChangedCount === 0
                ? "No changes detected — every scene already matches the master transcript for its time window."
                : `${realignChangedCount} of ${realignRows.length} scene${realignRows.length === 1 ? "" : "s"} would change. Select which scenes to apply, then confirm.`}
              {" "}This is a dry-run preview — nothing is saved until you confirm.
            </DialogDescription>
          </DialogHeader>

          {realignRows.length > 0 && (
            <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
              <div className="flex items-center gap-2">
                <Button
                  type="button" variant="ghost" size="sm" className="h-6 text-[10px]"
                  onClick={() => setRealignSelected(new Set(realignRows.filter((r) => r.changed).map((r) => r.scene_number)))}
                >
                  Select all changed
                </Button>
                <Button
                  type="button" variant="ghost" size="sm" className="h-6 text-[10px]"
                  onClick={() => setRealignSelected(new Set())}
                >
                  Clear selection
                </Button>
              </div>
              <span>{realignSelected.size} selected</span>
            </div>
          )}

          <ScrollArea className="max-h-[55vh] rounded-md border">
            <ul className="divide-y divide-border/60">
              {realignRows.map((row) => (
                <li key={row.scene_number} className="px-3 py-3 text-xs">
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={realignSelected.has(row.scene_number)}
                        disabled={!row.changed || realigning || realignResults.size > 0}
                        onCheckedChange={() => toggleRealignScene(row.scene_number)}
                        aria-label={`Select scene ${row.scene_number}`}
                      />
                      <span className="font-mono text-muted-foreground">#{row.scene_number}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{row.time_start} – {row.time_end}</span>
                      {row.changed
                        ? <Badge variant="outline" className="bg-amber-500/15 text-amber-200 border-amber-500/30">Will change</Badge>
                        : <Badge variant="outline" className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30">Unchanged</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {realignResults.get(row.scene_number) === "success" && (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Updated
                        </Badge>
                      )}
                      {realignResults.get(row.scene_number) === "skipped" && (
                        <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1">
                          <AlertCircle className="h-3 w-3" /> Skipped
                        </Badge>
                      )}
                      {realignResults.get(row.scene_number) === "error" && (
                        <Badge variant="outline" className="bg-destructive/15 text-destructive-foreground border-destructive/30 gap-1">
                          <XCircle className="h-3 w-3" /> Error
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded border border-border/60 bg-background/40 p-2">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Current lyrics</div>
                      <div className="break-words">{row.oldLyrics || <span className="italic text-muted-foreground">(empty)</span>}</div>
                      <div className="mt-2 mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Current performance</div>
                      <div className="break-words text-muted-foreground">{row.oldAction || <span className="italic">(empty)</span>}</div>
                    </div>
                    <div className="rounded border border-border/60 bg-background/40 p-2">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Proposed lyrics</div>
                      <div className={`break-words ${row.changed ? "bg-emerald-500/10 text-emerald-100 px-1 rounded" : ""}`}>
                        {row.newLyrics || <span className="italic text-muted-foreground">(empty)</span>}
                      </div>
                      <div className="mt-2 mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Proposed performance</div>
                      <div className={`break-words ${row.changed ? "bg-emerald-500/10 text-emerald-100 px-1 rounded" : "text-muted-foreground"}`}>
                        {row.newAction}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>

          <DialogFooter className="gap-2 sm:gap-2">
            {realignResults.size > 0 ? (
              <Button variant="ghost" onClick={() => { setRealignPreviewOpen(false); setRealignResults(new Map()); }}>
                Close
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setRealignPreviewOpen(false)} disabled={realigning}>
                Cancel (dry-run)
              </Button>
            )}
            <Button
              onClick={applyRealign}
              disabled={realigning || realignSelected.size === 0 || realignResults.size > 0}
              className="gap-2"
            >
              {realigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Confirm & apply ({realignSelected.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
