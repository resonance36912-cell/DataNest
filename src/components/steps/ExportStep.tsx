import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Download, FileText, Image, Film, Music, CheckCircle2, CircleDashed, FolderDown, Maximize, Minimize, ClipboardList, FileBadge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import SaveProgressButton from "@/components/SaveProgressButton";
import DiagnosticsPanel from "@/components/DiagnosticsPanel";
import { buildRunReport } from "@/lib/runReport";
import { generateRunReportPdf } from "@/lib/runReportPdf";
import { getMotionAudit } from "@/lib/scene-motion-audit-store";

import { useHdRendering } from "@/hooks/useHdRendering";
import { useAssemblyMerge } from "@/hooks/useAssemblyMerge";
import HdRenderSection from "@/components/export/HdRenderSection";
import MergeAssemblyPanel from "@/components/assembly/MergeAssemblyPanel";
import KaraokePreviewSection from "@/components/export/KaraokePreviewSection";
import ExportSettingsDialog from "@/components/export/ExportSettingsDialog";
import { FeatureGate } from "@/components/brand/FeatureGate";
import { PublishGate } from "@/components/export/PublishGate";
import SharePackagePanel from "@/components/export/SharePackagePanel";

import { usePublishGate } from "@/hooks/usePublishGate";
import { timeToSeconds } from "@/lib/audio-utils";
import { MASTER_QUALITY_PROFILE } from "@/lib/master-quality";

interface StepProps { onNext: () => void; onPrev: () => void; isFirst: boolean; isLast: boolean; }

export default function ExportStep({ onPrev }: StepProps) {
  const { verification, characterConcepts, scenes, transcription, projectId, activeTranscriptVersionId, audioUrl } = useProject();
  const { user } = useAuth();
  const hd = useHdRendering();
  const { mergeState, displayedProgress: mergeDisplayedProgress, progressSource: mergeProgressSource, progressLastRealAt: mergeProgressLastRealAt, startMerge, resetMerge, cancelMerge, canceling: mergeCanceling, forceRefresh, isStuck, refreshing, cooldownRemainingMs, lastPollAt, lastPollSource, autoRefreshOnStuck, setAutoRefreshOnStuck, autoRefreshContinuous, setAutoRefreshContinuous, refreshAttempts, consecutiveFailures, retryAttempts, lastRetrySource, lastRetryAt, retryPending } = useAssemblyMerge();
  const publishGate = usePublishGate(projectId);
  const refreshPublishGate = publishGate.refresh;
  const autoMergeTriggered = useRef(false);
  const previousMergeState = useRef<typeof mergeState | null>(null);

  const mergeScenes = useMemo(() => scenes.filter((scene) => Boolean(scene.videoUrl)), [scenes]);
  const masterMergeOptions = useMemo(() => ({
    resolution: MASTER_QUALITY_PROFILE.assembly.resolution,
    fps: MASTER_QUALITY_PROFILE.assembly.fps,
    sceneDurations: mergeScenes.map((scene) => Math.max(0.5, timeToSeconds(scene.time_end) - timeToSeconds(scene.time_start))),
    sceneNumbers: mergeScenes.map((scene) => scene.scene_number),
  }), [mergeScenes]);
  const sceneQualityFingerprint = useMemo(
    () => scenes.map((scene) => `${scene.scene_number}:${scene.videoUrl || "none"}:${scene.videoQuality || "unknown"}`).join("|"),
    [scenes],
  );

  useEffect(() => {
    if (projectId) void refreshPublishGate();
  }, [projectId, sceneQualityFingerprint, refreshPublishGate]);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [exportingBundle, setExportingBundle] = useState(false);
  const [persistedFinalUrl, setPersistedFinalUrl] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState<"json" | "pdf" | null>(null);

  // Load latest completed merge from DB on mount
  useEffect(() => {
    if (!projectId || !user) return;
    const loadMerge = async () => {
      const { data } = await supabase
        .from("render_jobs")
        .select("final_output_url")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .eq("scene_number", -1)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (data?.final_output_url) {
        setPersistedFinalUrl(data.final_output_url);
      }
    };
    loadMerge();
  }, [projectId, user]);

  // Auto-trigger merge when all HD renders complete
  useEffect(() => {
    if (hd.allHdJustCompleted && !autoMergeTriggered.current && publishGate.canPublish && projectId && audioUrl && mergeState.phase === "idle") {
      const videoUrls = mergeScenes.map((scene) => scene.videoUrl!);
      if (videoUrls.length >= 2) {
        autoMergeTriggered.current = true;
        hd.clearHdCompleted();
        startMerge(projectId, videoUrls, audioUrl, masterMergeOptions);
      }
    }
  }, [hd.allHdJustCompleted, publishGate.canPublish, projectId, audioUrl, mergeScenes, masterMergeOptions, mergeState.phase, startMerge, hd.clearHdCompleted]);

  // Derive final video URL from live merge state or persisted DB result
  const finalVideoUrl = mergeState.finalUrl || persistedFinalUrl;

  // Update persisted URL when a new merge completes
  useEffect(() => {
    if (mergeState.finalUrl) setPersistedFinalUrl(mergeState.finalUrl);
  }, [mergeState.finalUrl]);

  // ─── Download helpers ───
  const downloadJSON = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const exportLyrics = useCallback(() => {
    if (!verification) { toast.error("No analysis data."); return; }
    downloadJSON({ lyrics: verification.verified_lyrics, bpm: verification.bpm, music_key: verification.music_key, mood: verification.mood, energy: verification.energy, tempo_feel: verification.tempo_feel, instruments: verification.instruments, confidence: { lyrics: verification.confidence_lyrics, bpm: verification.confidence_bpm, instruments: verification.confidence_instruments } }, "lyrics-analysis.json");
    toast.success("Lyrics & analysis exported!");
  }, [verification]);

  const exportCharacter = useCallback(() => {
    if (!characterConcepts.length) { toast.error("No character data."); return; }
    downloadJSON(characterConcepts.map(c => ({ name: c.name, description: c.description, outfit: c.outfit, vibe: c.vibe, visual_prompt: c.visual_prompt, imageUrl: c.imageUrl })), "character-specs.json");
    toast.success("Character specs exported!");
  }, [characterConcepts]);

  const exportStoryboard = useCallback(() => {
    if (!scenes.length) { toast.error("No scenes."); return; }
    downloadJSON(scenes.map(s => ({ scene_number: s.scene_number, lyric_segment: s.lyric_segment, time_start: s.time_start, time_end: s.time_end, mood: s.mood, location: s.location, camera_style: s.camera_style, action_description: s.action_description, visual_prompt: s.visual_prompt, imageUrl: s.imageUrl, videoUrl: s.videoUrl, videoQuality: s.videoQuality, motion_analysis: getMotionAudit(s.videoUrl) ?? null })), "storyboard-scenes.json");
    toast.success("Storyboard exported!");
  }, [scenes]);

  const exportFullBundle = useCallback(() => {
    if (!verification && !scenes.length) { toast.error("No project data to export."); return; }
    downloadJSON({
      exported_at: new Date().toISOString(),
      analysis: verification ? { lyrics: verification.verified_lyrics, bpm: verification.bpm, music_key: verification.music_key, mood: verification.mood, energy: verification.energy, instruments: verification.instruments } : null,
      transcription: transcription ? { text: transcription.text, word_count: transcription.quality.word_count } : null,
      characters: characterConcepts.map(c => ({ name: c.name, description: c.description, outfit: c.outfit, vibe: c.vibe, imageUrl: c.imageUrl })),
      scenes: scenes.map(s => ({ scene_number: s.scene_number, lyric_segment: s.lyric_segment, time_start: s.time_start, time_end: s.time_end, mood: s.mood, location: s.location, camera_style: s.camera_style, action_description: s.action_description, visual_prompt: s.visual_prompt, imageUrl: s.imageUrl, videoUrl: s.videoUrl, videoQuality: s.videoQuality, motion_analysis: getMotionAudit(s.videoUrl) ?? null })),
    }, "resonance-syncvision-project-bundle.json");
    toast.success("Full project bundle exported!");
  }, [verification, transcription, characterConcepts, scenes]);


  const exportSrtVttBundle = useCallback(async () => {
    if (!projectId || !activeTranscriptVersionId) { toast.error("No accepted transcript version available for export."); return; }
    setExportingBundle(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please sign in."); return; }
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-bundle`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ project_id: projectId, transcript_version_id: activeTranscriptVersionId }),
      });
      if (!resp.ok) { const err = await resp.json().catch(() => ({ error: "Export failed" })); throw new Error(err.error || `Export failed (${resp.status})`); }
      const data = await resp.json();
      for (const f of [
        { content: data.srt, name: "lyrics.srt", type: "text/plain" },
        { content: data.vtt, name: "lyrics.vtt", type: "text/plain" },
        { content: data.karaoke_vtt, name: "lyrics-karaoke.vtt", type: "text/plain" },
        { content: JSON.stringify(data.manifest, null, 2), name: "manifest.json", type: "application/json" },
      ]) {
        if (!f.content) continue;
        const blob = new Blob([f.content], { type: f.type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = f.name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      }
      toast.success("SRT, VTT, and Karaoke files exported!");
    } catch (err: any) { console.error("Export bundle error:", err); toast.error(err.message || "Failed to export subtitle bundle."); }
    finally { setExportingBundle(false); }
  }, [projectId, activeTranscriptVersionId]);

  // ─── Run report (JSON + PDF) ────────────────────────────────────────────
  // Bundles transcription, BPM/key detections, per-scene job statuses and
  // final asset URLs into a single downloadable artifact. Pulls live job
  // statuses from render_jobs / lipsync_jobs so the report reflects DB truth.
  const exportRunReportJson = useCallback(async () => {
    if (!projectId || !user) { toast.error("Sign in and open a project first."); return; }
    setGeneratingReport("json");
    try {
      const report = await buildRunReport(projectId, user.id, scenes);
      downloadJSON(report, `run-report-${projectId.slice(0, 8)}.json`);
      toast.success("Run report (JSON) exported!");
    } catch (e: any) {
      console.error("[runReport JSON]", e);
      toast.error(e?.message || "Failed to build run report.");
    } finally { setGeneratingReport(null); }
  }, [projectId, user, scenes]);

  const exportRunReportPdf = useCallback(async () => {
    if (!projectId || !user) { toast.error("Sign in and open a project first."); return; }
    setGeneratingReport("pdf");
    try {
      const report = await buildRunReport(projectId, user.id, scenes);
      const blob = generateRunReportPdf(report);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `run-report-${projectId.slice(0, 8)}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Run report (PDF) exported!");
    } catch (e: any) {
      console.error("[runReport PDF]", e);
      toast.error(e?.message || "Failed to render PDF report.");
    } finally { setGeneratingReport(null); }
  }, [projectId, user, scenes]);

  // ─── Export cards ───
  const exports = [
    { icon: FileText, label: "Lyrics & Analysis", desc: "Verified lyrics, BPM, instruments, mood data", format: "JSON", action: exportLyrics, disabled: !verification },
    { icon: Image, label: "Character Specs", desc: "Character details, reference images, style notes", format: "JSON", action: exportCharacter, disabled: !characterConcepts.length },
    { icon: Film, label: "Storyboard Scenes", desc: "All scene cards with prompts, timing, and descriptions", format: "JSON", action: exportStoryboard, disabled: !scenes.length },
    { icon: Music, label: "SRT / VTT / Karaoke", desc: "Subtitle files and karaoke VTT from accepted transcript", format: "SRT/VTT", action: exportSrtVttBundle, disabled: !activeTranscriptVersionId || exportingBundle },
    { icon: ClipboardList, label: "Run Report (JSON)", desc: "Transcription, BPM/key, per-scene job statuses, final URLs", format: "JSON", action: exportRunReportJson, disabled: !projectId || generatingReport !== null },
    { icon: FileBadge, label: "Run Report (PDF)", desc: "Human-readable summary of the entire generation run", format: "PDF", action: exportRunReportPdf, disabled: !projectId || generatingReport !== null },
    { icon: Download, label: "Full Project Bundle", desc: "Everything in one downloadable package", format: "JSON", action: exportFullBundle, disabled: !verification && !scenes.length },
  ];

  const completedSteps = [!!transcription, !!verification, characterConcepts.length > 0, scenes.length > 0, scenes.some(s => s.videoUrl)];
  const completionPercent = Math.round((completedSteps.filter(Boolean).length / completedSteps.length) * 100);
  const isComplete = completionPercent === 100;

  return (
    <div className="space-y-6">
      <DiagnosticsPanel />
      <SectionErrorBoundary name="HD Render">
        <FeatureGate feature="hd_render">
          <HdRenderSection
            previewScenes={hd.previewScenes} hdReadyScenes={hd.hdReadyScenes} allHd={hd.allHd}
            hasVideos={scenes.some(s => s.videoUrl)} hdJobs={hd.hdJobs} renderingAll={hd.renderingAll}
            activeHdCount={hd.activeHdCount} scenes={scenes} onRenderAll={hd.renderAllHd}
          />
        </FeatureGate>
      </SectionErrorBoundary>

      <SectionErrorBoundary name="Publish Gate">
        <PublishGate projectId={projectId} />
      </SectionErrorBoundary>

      <SectionErrorBoundary name="Share Package">
        <SharePackagePanel
          projectId={projectId}
          projectTitle={verification?.mood ? `syncvision-${verification.mood}` : null}
          userId={user?.id}
          scenes={scenes}
          characters={characterConcepts}
          verification={verification}
          transcription={transcription}
          audioUrl={audioUrl}
          finalVideoUrl={finalVideoUrl}
        />
      </SectionErrorBoundary>


      <SectionErrorBoundary name="Final Merge">
        <FeatureGate feature="assembly_merge">
          <MergeAssemblyPanel
            mergeState={mergeState}
            onMerge={(settings) => {
              if (!publishGate.canPublish) {
                toast.error(publishGate.blockingReason || "Resolve critical QA defects before publishing.");
                return;
              }
              if (projectId && audioUrl) {
                const videoUrls = mergeScenes.map((scene) => scene.videoUrl!);
                startMerge(projectId, videoUrls, audioUrl, { ...masterMergeOptions, ...settings });
              }
            }}
            onReset={() => {
              previousMergeState.current = { ...mergeState };
              autoMergeTriggered.current = false;
              resetMerge();
              toast.info("Merge reset", {
                action: {
                  label: "Undo",
                  onClick: () => {
                    if (previousMergeState.current?.finalUrl) {
                      setPersistedFinalUrl(previousMergeState.current.finalUrl);
                      toast.success("Merge state restored");
                    }
                  },
                },
                duration: 6000,
              });
            }}
            sceneCount={scenes.filter(s => s.videoUrl).length}
            hasAllVideos={scenes.length > 0 && scenes.every(s => !!s.videoUrl)}
            hasAudio={!!audioUrl}
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
          />
        </FeatureGate>
      </SectionErrorBoundary>

      {/* Inline final video player */}
      {(finalVideoUrl) && (
        <div className="glass-card p-6 space-y-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            Final Video Preview
          </h3>
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video group"
            ref={(el) => { if (el) (el as any).__containerRef = el; }}
            onDoubleClick={(e) => {
              const container = e.currentTarget;
              if (document.fullscreenElement) document.exitFullscreen();
              else container.requestFullscreen?.();
            }}
          >
            <video
              src={finalVideoUrl}
              controls
              preload="auto"
              className="w-full h-full object-contain"
            />
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-2 right-2 h-8 w-8 bg-background/60 backdrop-blur-sm text-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10"
              onClick={(e) => {
                const container = e.currentTarget.closest('.group');
                if (!container) return;
                if (document.fullscreenElement) document.exitFullscreen();
                else (container as HTMLElement).requestFullscreen?.();
              }}
            >
              {document.fullscreenElement ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {scenes.filter(s => s.videoUrl).length} scenes merged with master audio
            </p>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" asChild>
              <a href={finalVideoUrl} target="_blank" rel="noopener noreferrer" download="final-video.mp4">
                <Download className="h-3.5 w-3.5" /> Download MP4
              </a>
            </Button>
          </div>
        </div>
      )}

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isComplete ? "bg-green-500/10 text-green-500" : "bg-primary/10 text-primary"}`}>
            {isComplete ? <CheckCircle2 className="h-5 w-5" /> : <CircleDashed className="h-5 w-5" />}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{isComplete ? "Project Complete" : "Export workspace"}</h2>
            <p className="text-muted-foreground">
              {isComplete ? "Your storyboard is ready. Export your assets below." : "Export the assets that are ready. Complete the missing stages before final publish."}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{completionPercent}%</div>
            <div className="text-xs text-muted-foreground">{isComplete ? "Complete" : "Ready"}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {exports.map((exp) => (
          <div key={exp.label} className={`glass-card-hover p-6 flex flex-col ${exp.disabled ? "opacity-50" : ""}`}>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <exp.icon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">{exp.label}</h3>
            <p className="mt-1 text-sm text-muted-foreground flex-1">{exp.desc}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{exp.format}</span>
              <Button size="sm" variant="outline" className="gap-1.5 border-border text-foreground hover:bg-secondary" onClick={exp.action} disabled={exp.disabled}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </div>
          </div>
        ))}
      </div>

      <SectionErrorBoundary name="Karaoke Preview">
        <KaraokePreviewSection activeTranscriptVersionId={activeTranscriptVersionId} audioUrl={audioUrl} exportingBundle={exportingBundle} onExport={exportSrtVttBundle} />
      </SectionErrorBoundary>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onPrev} className="gap-2 border-border text-foreground hover:bg-secondary">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
          </Button>
          <SaveProgressButton stepIndex={5} />
        </div>
        <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto sm:text-base sm:px-6 sm:py-3" onClick={() => setShowSaveDialog(true)}>
          <FolderDown className="h-5 w-5" /> <span className="hidden sm:inline">Save & Export Project</span><span className="sm:hidden">Export Project</span>
        </Button>
      </div>

      <ExportSettingsDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}
        onExportLyrics={exportLyrics} onExportCharacter={exportCharacter}
        onExportStoryboard={exportStoryboard} onExportSrtVtt={exportSrtVttBundle}
        onExportBundle={exportFullBundle} finalVideoUrl={finalVideoUrl} />
    </div>
  );
}
