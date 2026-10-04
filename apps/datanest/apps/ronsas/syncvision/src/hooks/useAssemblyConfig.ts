import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { timeToSeconds } from "@/lib/audio-utils";
import type { TransitionConfig } from "@/components/assembly/TransitionPicker";
import type { SubtitleConfig, TitleCard } from "@/components/assembly/TextOverlayPanel";
import type { FilterConfig } from "@/components/assembly/FilterPanel";
import type { AudioEnhancementConfig } from "@/components/assembly/AudioEnhancementPanel";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import type { SavedAssemblyItem } from "@/components/assembly/SavedAssemblyList";
import { PROVIDER_ESTIMATES } from "@/components/JobEstimateBadge";
import { renderAssembly, convertToMp4, type RenderResult } from "@/lib/assembly-renderer";
import { QUALITY_PRESETS, type RenderQuality } from "@/components/assembly/RenderControls";
import { MASTER_QUALITY_PROFILE } from "@/lib/master-quality";

interface UseAssemblyConfigOptions {
  projectId: string | null;
  userId: string | undefined;
  scenes: any[];
  setScenes?: (s: any[] | ((prev: any[]) => any[])) => void;
  savedSceneIndices: number[] | null;
  audioUrl: string | null;
  setAudioUrl: (url: string | null) => void;
}

export function useAssemblyConfig({
  projectId,
  userId,
  scenes,
  setScenes,
  savedSceneIndices,
  audioUrl,
  setAudioUrl,
}: UseAssemblyConfigOptions) {
  const navigate = useNavigate();
  // ─── Saved scenes ───
  const savedScenes = useMemo<SavedScene[]>(() => {
    const result = (savedSceneIndices || [])
      .map((idx) => {
        const scene = scenes[idx];
        if (!scene || !scene.videoUrl) return null;
        const startSec = timeToSeconds(scene.time_start);
        const endSec = timeToSeconds(scene.time_end);
        return {
          sceneIndex: idx,
          sceneNumber: scene.scene_number,
          videoUrl: scene.videoUrl,
          imageUrl: scene.imageUrl,
          lyricSegment: scene.lyric_segment,
          timeStart: scene.time_start,
          timeEnd: scene.time_end,
          durationSec: Math.max(0.5, endSec - startSec),
        };
      })
      .filter(Boolean) as SavedScene[];
    result.sort((a, b) => a.sceneNumber - b.sceneNumber);
    return result;
  }, [scenes, savedSceneIndices]);

  const [orderedScenes, setOrderedScenes] = useState<SavedScene[]>(savedScenes);
  const dbFallbackDone = useRef(false);

  useEffect(() => {
    if (savedScenes.length !== orderedScenes.length) {
      setOrderedScenes(savedScenes);
    }
  }, [savedScenes.length]);

  // ─── DB fallback: load scenes directly when no saved indices provided ───
  useEffect(() => {
    if (dbFallbackDone.current || !projectId || !userId) return;
    if (savedScenes.length > 0 || orderedScenes.length > 0) return;
    dbFallbackDone.current = true;

    supabase
      .from("scenes")
      .select("scene_number, lyric_segment, time_start, time_end, video_url, scene_image_url")
      .eq("project_id", projectId)
      .not("video_url", "is", null)
      .order("scene_number")
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return;
        const built: SavedScene[] = data.map((sc, idx) => {
          const startSec = timeToSeconds(sc.time_start || "0:00");
          const endSec = timeToSeconds(sc.time_end || "0:00");
          return {
            sceneIndex: idx,
            sceneNumber: sc.scene_number,
            videoUrl: sc.video_url!,
            imageUrl: sc.scene_image_url || undefined,
            lyricSegment: sc.lyric_segment || "",
            timeStart: sc.time_start || "0:00",
            timeEnd: sc.time_end || "0:00",
            durationSec: Math.max(0.5, endSec - startSec),
          };
        });
        setOrderedScenes(built);
        setTransitions(Array.from({ length: Math.max(0, built.length - 1) }, () => ({ type: "crossfade" as const, durationSec: 0.5 })));
      });
  }, [projectId, userId, savedScenes.length, orderedScenes.length]);

  // ─── Pick up video sent from Gallery ───
  useEffect(() => {
    const raw = sessionStorage.getItem("gallery_to_timeline");
    if (!raw) return;
    sessionStorage.removeItem("gallery_to_timeline");
    try {
      const data = JSON.parse(raw) as { videoUrl: string; sceneNumber: number; lyricSegment: string; projectId?: string };
      if (!data.videoUrl) return;
      const scene: SavedScene = {
        sceneIndex: Date.now(),
        sceneNumber: data.sceneNumber,
        videoUrl: data.videoUrl,
        lyricSegment: data.lyricSegment || `Scene ${data.sceneNumber}`,
        timeStart: "0:00",
        timeEnd: "0:10",
        durationSec: 10,
      };

      // Also update the storyboard scene in-memory
      setScenes?.(prev => prev.map(s =>
        s.scene_number === data.sceneNumber
          ? { ...s, videoUrl: data.videoUrl, videoQuality: "hd" as const }
          : s
      ));

      // Persist to DB
      if (projectId && userId) {
        supabase
          .from("scenes")
          .update({ video_url: data.videoUrl, video_quality: "hd" })
          .eq("project_id", projectId)
          .eq("user_id", userId)
          .eq("scene_number", data.sceneNumber)
          .then(({ error }) => {
            if (error) console.warn("Failed to persist gallery video to scene:", error);
          });
      }

      setOrderedScenes(prev => {
        const idx = prev.findIndex(s => s.sceneNumber === scene.sceneNumber);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = scene;
          toast.success(`Scene ${scene.sceneNumber} replaced in timeline & storyboard from Gallery`);
          return updated;
        }
        toast.success(`Scene ${scene.sceneNumber} added to timeline & storyboard from Gallery`);
        setTransitions(t => [...t, { type: "crossfade" as const, durationSec: 0.5 }]);
        return [...prev, scene];
      });
    } catch { /* ignore malformed data */ }
  }, []);

  // ─── Assembly config state ───
  const [transitions, setTransitions] = useState<TransitionConfig[]>(
    Array.from({ length: Math.max(0, orderedScenes.length - 1) }, () => ({ type: "crossfade" as const, durationSec: 0.5 }))
  );
  const [subtitles, setSubtitles] = useState<SubtitleConfig>({
    enabled: true, fontFamily: "Inter", fontSize: 24, position: "bottom", color: "#ffffff", bgOpacity: 60,
  });
  const [titleCards, setTitleCards] = useState<TitleCard[]>([]);
  const [filter, setFilter] = useState<FilterConfig>({ type: "none", intensity: 70, scope: "global" });
  const [audioEnhancement, setAudioEnhancement] = useState<AudioEnhancementConfig>({
    normalization: true, targetLufs: -14, eqPreset: "flat", masterVolume: 100,
  });

  const totalDuration = useMemo(() => orderedScenes.reduce((sum, s) => sum + s.durationSec, 0), [orderedScenes]);

  // ─── Saved assemblies ───
  const [saving, setSaving] = useState(false);
  const [loadedFromDb, setLoadedFromDb] = useState(false);
  const [savedAssemblies, setSavedAssemblies] = useState<SavedAssemblyItem[]>([]);
  const [loadingSavedTimeline, setLoadingSavedTimeline] = useState(false);
  const [loadingSavedList, setLoadingSavedList] = useState(false);
  const [loadingAssemblyId, setLoadingAssemblyId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [userProjects, setUserProjects] = useState<{ id: string; name: string }[]>([]);

  const fetchSavedAssemblies = useCallback(async () => {
    if (!projectId || !userId) return;
    setLoadingSavedList(true);
    try {
      const { data, error } = await supabase
        .from("assembly_configs")
        .select("id, name, scene_order, updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
      if (error) { console.warn("Failed to fetch assembly configs:", error.message); return; }
      if (data) {
        const items: SavedAssemblyItem[] = data
          .map((d: any) => {
            const order = Array.isArray(d.scene_order) ? d.scene_order : [];
            if (order.length === 0) return null;
            return { id: d.id, name: d.name || "Untitled Assembly", sceneCount: order.length, updatedAt: d.updated_at };
          })
          .filter(Boolean) as SavedAssemblyItem[];
        setSavedAssemblies(items);
      }
    } catch (err) {
      console.warn("Assembly config check failed:", err);
    } finally {
      setLoadingSavedList(false);
    }
  }, [projectId, userId]);

  useEffect(() => { fetchSavedAssemblies(); }, [fetchSavedAssemblies]);

  // setActiveSceneIndex will be injected from playback
  const activeSceneIndexRef = useRef<((idx: number | null) => void) | null>(null);

  const loadSavedAssembly = useCallback(async (assemblyId?: string) => {
    if (!projectId || !userId) return;
    setLoadingSavedTimeline(true);
    if (assemblyId) setLoadingAssemblyId(assemblyId);
    try {
      let query = supabase.from("assembly_configs").select("*").eq("project_id", projectId);
      if (assemblyId) {
        query = query.eq("id", assemblyId);
      } else {
        query = query.order("updated_at", { ascending: false }).limit(1);
      }
      const { data: rows } = await query;
      const data = rows?.[0];
      if (!data) return;
      const d = data as any;
      if (Array.isArray(d.transitions) && d.transitions.length) setTransitions(d.transitions);
      if (d.subtitles && typeof d.subtitles === "object" && Object.keys(d.subtitles).length) setSubtitles(d.subtitles);
      if (Array.isArray(d.title_cards)) setTitleCards(d.title_cards);
      if (d.filter && typeof d.filter === "object" && Object.keys(d.filter).length) setFilter(d.filter);
      if (d.audio_enhancement && typeof d.audio_enhancement === "object" && Object.keys(d.audio_enhancement).length) setAudioEnhancement(d.audio_enhancement);

      const rawOrder = Array.isArray(d.scene_order) ? d.scene_order : [];
      if (rawOrder.length === 0) return;

      const isRichFormat = rawOrder.length > 0 && typeof rawOrder[0] === "object" && rawOrder[0] !== null;

      if (isRichFormat) {
        const built: SavedScene[] = rawOrder
          .map((entry: any, idx: number) => {
            if (!entry.videoUrl) return null;
            return {
              sceneIndex: idx, sceneNumber: entry.sceneNumber, videoUrl: entry.videoUrl,
              imageUrl: entry.imageUrl || undefined, lyricSegment: entry.lyricSegment || "",
              timeStart: entry.timeStart || "0:00", timeEnd: entry.timeEnd || "0:00",
              durationSec: entry.durationSec || 5,
            };
          })
          .filter(Boolean) as SavedScene[];
        if (built.length > 0) {
          setOrderedScenes(built);
          activeSceneIndexRef.current?.(0);
        }
      } else {
        const sceneOrder = rawOrder as number[];
        if (savedScenes.length > 0) {
          const reordered = sceneOrder.map((sn: number) => savedScenes.find(s => s.sceneNumber === sn)).filter(Boolean) as SavedScene[];
          const remaining = savedScenes.filter(s => !sceneOrder.includes(s.sceneNumber));
          setOrderedScenes([...reordered, ...remaining]);
        } else {
          const { data: dbScenes } = await supabase
            .from("scenes")
            .select("scene_number, lyric_segment, time_start, time_end, video_url, scene_image_url")
            .eq("project_id", projectId)
            .in("scene_number", sceneOrder);
          if (dbScenes && dbScenes.length > 0) {
            const built: SavedScene[] = sceneOrder
              .map((sn: number, idx: number) => {
                const sc = dbScenes.find(s => s.scene_number === sn);
                if (!sc || !sc.video_url) return null;
                const startSec = timeToSeconds(sc.time_start || "0:00");
                const endSec = timeToSeconds(sc.time_end || "0:00");
                return {
                  sceneIndex: idx, sceneNumber: sc.scene_number, videoUrl: sc.video_url,
                  imageUrl: sc.scene_image_url || undefined, lyricSegment: sc.lyric_segment || "",
                  timeStart: sc.time_start || "0:00", timeEnd: sc.time_end || "0:00",
                  durationSec: Math.max(0.5, endSec - startSec),
                };
              })
              .filter(Boolean) as SavedScene[];
            if (built.length > 0) {
              setOrderedScenes(built);
              activeSceneIndexRef.current?.(0);
            }
          }
        }
      }
      toast.success(`Loaded: ${d.name || "Assembly"}`);
      setLoadedFromDb(true);
    } finally {
      setLoadingSavedTimeline(false);
      setLoadingAssemblyId(null);
    }
  }, [projectId, userId, savedScenes]);

  useEffect(() => {
    if (!projectId || !userId || loadedFromDb) return;
    if (savedScenes.length === 0) return;
    loadSavedAssembly();
  }, [projectId, userId, loadedFromDb, savedScenes.length, loadSavedAssembly]);

  const buildAssemblyPayload = useCallback((targetProjectId: string, targetUserId: string, assemblyName: string) => ({
    name: assemblyName,
    project_id: targetProjectId,
    user_id: targetUserId,
    scene_order: orderedScenes.map(s => ({
      sceneNumber: s.sceneNumber, videoUrl: s.videoUrl, imageUrl: s.imageUrl || null,
      lyricSegment: s.lyricSegment || "", timeStart: s.timeStart, timeEnd: s.timeEnd, durationSec: s.durationSec,
    })),
    transitions, subtitles, title_cards: titleCards, filter, audio_enhancement: audioEnhancement,
  }), [orderedScenes, transitions, subtitles, titleCards, filter, audioEnhancement]);

  const handleSave = useCallback(async (name?: string, target?: "current" | "new" | string, newProjName?: string) => {
    if (!userId) { toast.error("Not authenticated"); return; }
    const assemblyName = name || `Assembly ${new Date().toLocaleString()}`;
    const targetType = target || "current";
    setSaving(true);
    try {
      let targetProjectId = projectId || "";
      if (targetType === "new") {
        const pName = newProjName?.trim() || `Assembly — ${new Date().toLocaleDateString()}`;
        const { data: newProj, error: projErr } = await supabase
          .from("projects").insert({ name: pName, user_id: userId, status: "draft" as const, current_step: 4, segment_count: orderedScenes.length })
          .select("id").single();
        if (projErr || !newProj) throw new Error(projErr?.message || "Failed to create project");
        targetProjectId = newProj.id;
        for (const s of orderedScenes) {
          await supabase.from("scenes").upsert({
            project_id: targetProjectId, user_id: userId, scene_number: s.sceneNumber,
            lyric_segment: s.lyricSegment || "", time_start: s.timeStart, time_end: s.timeEnd,
            video_url: s.videoUrl, scene_image_url: s.imageUrl || null,
          } as any, { onConflict: "project_id,scene_number" });
        }
      } else if (targetType !== "current") {
        targetProjectId = targetType;
      }
      if (!targetProjectId) { toast.error("No project selected"); return; }
      const payload = buildAssemblyPayload(targetProjectId, userId, assemblyName);
      const { error } = await supabase.from("assembly_configs").insert(payload as any);
      if (error) throw error;
      if (targetType === "new") {
        const originalId = projectId;
        navigate(`/project/${targetProjectId}`);
        toast.success(`Saved to new project!`, {
          action: originalId ? { label: "Back to original", onClick: () => navigate(`/project/${originalId}`) } : undefined,
          duration: 6000,
        });
      } else if (targetType !== "current") {
        const projName = userProjects.find(p => p.id === targetType)?.name || "project";
        toast.success(`Saved "${assemblyName}" to ${projName}`);
      } else {
        toast.success(`Saved: ${assemblyName}`);
        fetchSavedAssemblies();
      }
    } catch (e: any) {
      toast.error("Save failed: " + (e.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }, [projectId, userId, orderedScenes, buildAssemblyPayload, fetchSavedAssemblies, userProjects]);

  // ─── Render ───
  const [rendering, setRendering] = useState(false);
  const [renderPhase, setRenderPhase] = useState("");
  const [renderPercent, setRenderPercent] = useState(0);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const [renderQuality, setRenderQuality] = useState<RenderQuality>("1080p");

  const handleRenderVideo = useCallback(async () => {
    if (orderedScenes.length === 0) { toast.error("No scenes to render"); return; }
    await handleSave();
    setRendering(true); setRenderPhase("Initializing…"); setRenderPercent(0); setRenderResult(null);
    const abortController = new AbortController();
    renderAbortRef.current = abortController;
    try {
      const result = await renderAssembly({
        scenes: orderedScenes, transitions, masterAudioUrl: audioUrl,
        width: QUALITY_PRESETS[renderQuality].w, height: QUALITY_PRESETS[renderQuality].h,
        fps: MASTER_QUALITY_PROFILE.assembly.fps,
        onProgress: (phase, percent) => { setRenderPhase(phase); setRenderPercent(Math.round(percent)); },
        onSceneChange: (idx, total) => { setRenderPhase(`Rendering scene ${idx + 1} of ${total}…`); },
        abortSignal: abortController.signal,
      });
      setRenderPhase("Converting to MP4…"); setRenderPercent(96);
      let mp4Blob: Blob;
      try {
        mp4Blob = await convertToMp4(
          result.blob,
          (phase, pct) => { setRenderPhase(phase); setRenderPercent(95 + Math.round(pct * 0.04)); },
          { fps: MASTER_QUALITY_PROFILE.assembly.fps, normalizeAudio: Boolean(audioUrl) },
        );
      } catch { mp4Blob = result.blob; }
      const finalResult: RenderResult = { ...result, blob: mp4Blob };
      setRenderResult(finalResult);
      toast.success("MP4 video ready! Click Download to save.");
      if (projectId && userId) {
        try {
          setRenderPhase("Uploading to storage…");
          const isMp4 = mp4Blob.type === "video/mp4";
          const ext = isMp4 ? "mp4" : "webm";
          const fileName = `renders/${userId}/${projectId}/final-assembly-${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabase.storage.from("media-uploads")
            .upload(fileName, mp4Blob, { contentType: isMp4 ? "video/mp4" : "video/webm", upsert: true });
          if (!uploadErr) {
            const { data: signedData } = await supabase.storage.from("media-uploads").createSignedUrl(fileName, 3600 * 24 * 7);
            if (signedData?.signedUrl) {
              await supabase.from("assembly_configs").update({
                audio_enhancement: { ...(audioEnhancement as any), final_render_url: signedData.signedUrl, rendered_at: new Date().toISOString() },
              }).eq("project_id", projectId).eq("user_id", userId);
            }
            toast.success("Render uploaded to storage!");
          }
        } catch (uploadErr) { console.warn("Upload failed, but local download is available:", uploadErr); }
      }
    } catch (e: any) {
      if (e.message === "Render cancelled") toast.info("Render cancelled");
      else { toast.error("Render failed: " + (e.message || "Unknown error")); console.error("Render error:", e); }
    } finally {
      setRendering(false); renderAbortRef.current = null;
    }
  }, [orderedScenes, transitions, audioUrl, projectId, userId, audioEnhancement, handleSave, renderQuality]);

  const handleDownloadRender = useCallback(() => {
    if (!renderResult) return;
    const url = URL.createObjectURL(renderResult.blob);
    const a = document.createElement("a");
    a.href = url;
    const ext = renderResult.blob.type === "video/mp4" ? "mp4" : "webm";
    a.download = `assembly-render-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [renderResult]);

  const handleCancelRender = useCallback(() => { renderAbortRef.current?.abort(); }, []);

  // ─── Create new project ───
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);

  const handleCreateProject = useCallback(async (projectName: string) => {
    if (!userId || orderedScenes.length === 0) return;
    setCreatingProject(true);
    try {
      const { data: newProj, error: projErr } = await supabase
        .from("projects").insert({ name: projectName, user_id: userId, status: "draft" as const, current_step: 4, segment_count: orderedScenes.length })
        .select("id").single();
      if (projErr || !newProj) throw new Error(projErr?.message || "Failed to create project");
      for (const s of orderedScenes) {
        await supabase.from("scenes").upsert({
          project_id: newProj.id, user_id: userId, scene_number: s.sceneNumber,
          lyric_segment: s.lyricSegment || "", time_start: s.timeStart, time_end: s.timeEnd,
          video_url: s.videoUrl, scene_image_url: s.imageUrl || null,
        } as any, { onConflict: "project_id,scene_number" });
      }
      await supabase.from("assembly_configs").insert({
        name: projectName, project_id: newProj.id, user_id: userId,
        scene_order: orderedScenes.map(s => ({ sceneNumber: s.sceneNumber, videoUrl: s.videoUrl, imageUrl: s.imageUrl || null, lyricSegment: s.lyricSegment || "", timeStart: s.timeStart, timeEnd: s.timeEnd, durationSec: s.durationSec })),
        transitions, subtitles, title_cards: titleCards, filter, audio_enhancement: audioEnhancement,
      } as any);
      const originalId = projectId;
      navigate(`/project/${newProj.id}`);
      toast.success("New project created!", {
        action: originalId ? { label: "Back to original", onClick: () => navigate(`/project/${originalId}`) } : undefined,
        duration: 6000,
      });
    } catch (e: any) {
      toast.error("Failed to create project: " + (e.message || "Unknown error"));
    } finally {
      setCreatingProject(false);
    }
  }, [userId, orderedScenes, transitions, subtitles, titleCards, filter, audioEnhancement]);

  // ─── AI auto-generate ───
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);

  const handleAiGenerate = useCallback(async () => {
    if (orderedScenes.length === 0) return;
    setAiGenerating(true); setAiReasoning(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-assembly-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scenes: orderedScenes.map(s => ({ mood: scenes[s.sceneIndex]?.mood, location: scenes[s.sceneIndex]?.location, lyricSegment: s.lyricSegment, cameraStyle: scenes[s.sceneIndex]?.camera_style })),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 429) { toast.warning("Rate limited — try again shortly."); return; }
        if (resp.status === 402) { toast.error("AI credits exhausted."); return; }
        throw new Error(err.error || `Failed (${resp.status})`);
      }
      const config = await resp.json();
      if (config.transitions && Array.isArray(config.transitions)) setTransitions(config.transitions.slice(0, Math.max(0, orderedScenes.length - 1)));
      if (config.filter) setFilter(config.filter);
      if (config.subtitles) setSubtitles(config.subtitles);
      if (config.audioEnhancement) setAudioEnhancement(config.audioEnhancement);
      if (config.reasoning) setAiReasoning(config.reasoning);
      toast.success("AI assembly settings applied!");
    } catch (e: any) {
      toast.error("AI generation failed: " + (e.message || "Unknown error"));
    } finally {
      setAiGenerating(false);
    }
  }, [orderedScenes, scenes]);

  // ─── Audio upload ───
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const handleAudioUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const audioFileLocal = e.target.files?.[0];
    if (!audioFileLocal || !userId || !projectId) return;
    const validTypes = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/webm", "audio/aac"];
    if (!validTypes.some(t => audioFileLocal.type.startsWith(t.split("/")[0]))) { toast.error("Please select an audio file"); return; }
    setUploadingAudio(true);
    try {
      const ext = audioFileLocal.name.split(".").pop() || "mp3";
      const storagePath = `${userId}/${projectId}/assembly-audio-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("media-uploads").upload(storagePath, audioFileLocal, { contentType: audioFileLocal.type, upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: signedData } = await supabase.storage.from("media-uploads").createSignedUrl(storagePath, 3600);
      if (signedData?.signedUrl) { setAudioUrl(signedData.signedUrl); setAudioFile(audioFileLocal); toast.success("Audio track loaded"); }
    } catch (err: any) {
      toast.error("Audio upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  }, [userId, projectId, setAudioUrl]);

  // ─── Scene reorder ───
  const handleReorder = useCallback((newScenes: SavedScene[]) => {
    setOrderedScenes(newScenes);
    setTransitions((prev) => {
      const needed = Math.max(0, newScenes.length - 1);
      if (prev.length === needed) return prev;
      if (prev.length > needed) return prev.slice(0, needed);
      return [...prev, ...Array.from({ length: needed - prev.length }, () => ({ type: "crossfade" as const, durationSec: 0.5 }))];
    });
  }, []);

  // ─── Recall ───
  const existingVideoUrls = useMemo(() => new Set(orderedScenes.map(s => s.videoUrl)), [orderedScenes]);
  const nextSceneIndex = useMemo(() => Math.max(0, ...orderedScenes.map(s => s.sceneIndex)) + 1, [orderedScenes]);

  const handleAddRecalledScene = useCallback((scene: SavedScene) => {
    setOrderedScenes(prev => {
      const updated = [...prev, scene];
      setTransitions(t => [...t, { type: "crossfade" as const, durationSec: 0.5 }]);
      return updated;
    });
  }, []);

  // ─── Cost estimate ───
  const costEstimate = useMemo(() => {
    const est = PROVIDER_ESTIMATES["wan-25"];
    if (!est || orderedScenes.length === 0) return null;
    const costPer = est.costGbp;
    const totalMin = costPer * orderedScenes.length;
    const totalMax = totalMin * 1.25;
    return {
      gbpMin: totalMin, gbpMax: totalMax, zarMin: 0, zarMax: 0,
      label: `~${totalMin.toFixed(2)}–${totalMax.toFixed(2)} credits`,
      shortLabel: `~${totalMin.toFixed(2)}–${totalMax.toFixed(2)} credits`,
    };
  }, [orderedScenes.length]);

  // ─── Filter style ───
  const getFilterStyle = useCallback((): React.CSSProperties => {
    if (filter.type === "none") return {};
    const intensity = filter.intensity / 100;
    switch (filter.type) {
      case "warm": return { filter: `sepia(${0.3 * intensity}) saturate(${1 + 0.3 * intensity}) brightness(${1 + 0.05 * intensity})` };
      case "cool": return { filter: `saturate(${1 - 0.2 * intensity}) brightness(${1 + 0.05 * intensity}) hue-rotate(${10 * intensity}deg)` };
      case "vintage": return { filter: `sepia(${0.5 * intensity}) contrast(${1 + 0.1 * intensity}) brightness(${0.95})` };
      case "bw": return { filter: `grayscale(${intensity})` };
      case "cinematic": return { filter: `contrast(${1 + 0.15 * intensity}) saturate(${1 + 0.1 * intensity}) brightness(${0.95})` };
      case "dramatic": return { filter: `contrast(${1 + 0.3 * intensity}) brightness(${0.85}) saturate(${1 + 0.2 * intensity})` };
      case "pastel": return { filter: `saturate(${0.7 + 0.3 * (1 - intensity)}) brightness(${1 + 0.1 * intensity})` };
      default: return {};
    }
  }, [filter]);

  return {
    // Scenes
    savedScenes, orderedScenes, setOrderedScenes, totalDuration,
    // Config
    transitions, setTransitions, subtitles, setSubtitles, titleCards, setTitleCards,
    filter, setFilter, audioEnhancement, setAudioEnhancement,
    // Save/load
    saving, saveDialogOpen, setSaveDialogOpen, savedAssemblies, setSavedAssemblies,
    loadingSavedTimeline, loadingSavedList, loadingAssemblyId, handleSave, loadSavedAssembly,
    fetchSavedAssemblies, userProjects, setUserProjects, activeSceneIndexRef,
    // Render
    rendering, renderPhase, renderPercent, renderResult, renderQuality, setRenderQuality,
    handleRenderVideo, handleDownloadRender, handleCancelRender,
    // Create project
    creatingProject, newProjectDialogOpen, setNewProjectDialogOpen, handleCreateProject,
    // AI
    aiGenerating, aiReasoning, setAiReasoning, handleAiGenerate,
    // Audio
    audioInputRef, uploadingAudio, audioFile, handleAudioUpload,
    // Scenes ops
    handleReorder, existingVideoUrls, nextSceneIndex, handleAddRecalledScene,
    // Misc
    costEstimate, getFilterStyle, buildAssemblyPayload,
  };
}
