import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isMasterReadyVideoQuality, MASTER_QUALITY_PROFILE } from "@/lib/master-quality";

export interface HdJobState {
  sceneIndex: number;
  jobId?: string;
  requestId?: string;
  statusUrl?: string;
  responseUrl?: string;
  progress: number;
  status: "queued" | "running" | "done" | "error";
  startedAt?: number;
}

const VIDEO_POLL_INTERVAL = 6000;
const VIDEO_POLL_TIMEOUT = 10 * 60 * 1000;

export function useHdRendering() {
  const { scenes, setScenes, projectId } = useProject();
  const { user } = useAuth();

  const [hdJobs, setHdJobs] = useState<Record<number, HdJobState>>({});
  const [renderingAll, setRenderingAll] = useState(false);
  const pollTimers = useRef<Record<number, NodeJS.Timeout>>({});
  const queuedScenesRef = useRef<number[]>([]);
  const launchingQueuedRef = useRef(false);

  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval);
    };
  }, []);

  const previewScenes = scenes.filter(s => s.videoUrl && !isMasterReadyVideoQuality(s.videoQuality));
  const hdReadyScenes = scenes.filter(s => s.videoUrl && isMasterReadyVideoQuality(s.videoQuality));
  const allHd = scenes.length > 0 && scenes.every(s => !s.videoUrl || isMasterReadyVideoQuality(s.videoQuality));
  const activeHdCount = Object.values(hdJobs).filter(j => j.status === "running" || j.status === "queued").length;

  const stopProgress = (idx: number, status: "done" | "error") => {
    setHdJobs(prev => ({ ...prev, [idx]: { ...prev[idx], progress: status === "done" ? 100 : prev[idx]?.progress || 0, status } }));
  };

  const pollHdJob = useCallback((idx: number, requestId: string, statusUrl: string, responseUrl: string, jobId?: string) => {
    if (pollTimers.current[idx]) clearInterval(pollTimers.current[idx]);
    const pollStart = Date.now();

    const timer = setInterval(async () => {
      if (Date.now() - pollStart > VIDEO_POLL_TIMEOUT) {
        clearInterval(pollTimers.current[idx]); delete pollTimers.current[idx];
        stopProgress(idx, "error");
        toast.error(`HD render timed out for scene ${idx + 1}.`);
        return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Authentication expired. Sign in again to continue.");
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-job-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ request_id: requestId, status_url: statusUrl, response_url: responseUrl, job_id: jobId }),
        });
        if (!resp.ok) { clearInterval(pollTimers.current[idx]); delete pollTimers.current[idx]; stopProgress(idx, "error"); toast.error(`HD render failed for scene ${idx + 1}.`); return; }
        const data = await resp.json();
        if (data.videoUrl) {
          clearInterval(pollTimers.current[idx]); delete pollTimers.current[idx]; stopProgress(idx, "done");
          setScenes(prev => { const updated = [...prev]; updated[idx] = { ...updated[idx], videoUrl: data.videoUrl, videoQuality: "hd" }; return updated; });
          toast.success(`Scene ${idx + 1} HD render complete!`);
        } else if (data.status === "FAILED" || data.error) {
          clearInterval(pollTimers.current[idx]); delete pollTimers.current[idx]; stopProgress(idx, "error");
          toast.error(data.error || `HD render failed for scene ${idx + 1}.`);
        } else {
          const realProgress = Number(data.progress);
          setHdJobs(prev => ({
            ...prev,
            [idx]: {
              ...prev[idx],
              status: "running",
              progress: Number.isFinite(realProgress) ? Math.max(0, Math.min(99, realProgress)) : prev[idx]?.progress || 0,
            },
          }));
        }
      } catch (error) {
        clearInterval(pollTimers.current[idx]);
        delete pollTimers.current[idx];
        stopProgress(idx, "error");
        toast.error(error instanceof Error ? error.message : `HD status check failed for scene ${idx + 1}.`);
      }
    }, VIDEO_POLL_INTERVAL);

    pollTimers.current[idx] = timer;
  }, [setScenes]);

  const submitHdJob = async (idx: number) => {
    const scene = scenes[idx];
    if (!scene?.imageUrl) return;
    setHdJobs(prev => ({ ...prev, [idx]: { sceneIndex: idx, progress: 0, status: "queued", startedAt: Date.now() } }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication expired. Sign in again to continue.");
      const startSec = scene.time_start ? scene.time_start.split(":").reduce((a: number, b: string) => a * 60 + Number(b), 0) : 0;
      const endSec = scene.time_end ? scene.time_end.split(":").reduce((a: number, b: string) => a * 60 + Number(b), 0) : startSec + 5;
      const duration = Math.max(2, endSec - startSec) <= 7 ? 5 : 10;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-video-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ image_url: scene.imageUrl, prompt: `Cinematic music video scene. ${scene.action_description}. The character performs expressively with ${scene.mood} mood. ${scene.camera_style}. Subtle natural motion, cinematic lighting.`, duration, aspect_ratio: MASTER_QUALITY_PROFILE.generation.aspectRatio, quality: MASTER_QUALITY_PROFILE.generation.quality, model: MASTER_QUALITY_PROFILE.generation.provider, scene_number: scene.scene_number, project_id: projectId, user_id: user?.id }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 429) { toast.warning(err.error || "Too many video jobs running. Please wait."); stopProgress(idx, "error"); return; }
        throw new Error(err.error || "HD submission failed");
      }
      const data = await resp.json();
      setHdJobs(prev => ({ ...prev, [idx]: { ...prev[idx], status: "running", jobId: data.job_id, requestId: data.request_id, statusUrl: data.status_url, responseUrl: data.response_url } }));
      pollHdJob(idx, data.request_id, data.status_url, data.response_url, data.job_id);
    } catch (err: any) { stopProgress(idx, "error"); toast.error(err.message || `Failed to start HD render for scene ${idx + 1}.`); }
  };

  const renderAllHd = async () => {
    const toRender = scenes.reduce<number[]>((acc, s, i) => { if (s.imageUrl && !isMasterReadyVideoQuality(s.videoQuality)) acc.push(i); return acc; }, []);
    if (!toRender.length) { toast.info("All scenes are already HD rendered."); return; }
    setHdJobs({});
    queuedScenesRef.current = toRender;
    setRenderingAll(true);
    toast.success(`Queued ${toRender.length} scenes for master-quality rendering (2 at a time).`);
  };

  // Launch a bounded two-job worker pool. This avoids flooding the provider's
  // five-job account limit while still keeping both quality render lanes busy.
  useEffect(() => {
    if (!renderingAll || launchingQueuedRef.current || activeHdCount >= 2 || queuedScenesRef.current.length === 0) return;
    launchingQueuedRef.current = true;
    const next = queuedScenesRef.current.splice(0, 2 - activeHdCount);
    Promise.all(next.map((idx) => submitHdJob(idx))).finally(() => {
      launchingQueuedRef.current = false;
    });
  }, [renderingAll, activeHdCount, hdJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const [allHdJustCompleted, setAllHdJustCompleted] = useState(false);

  // Track completion
  useEffect(() => {
    if (renderingAll && activeHdCount === 0 && queuedScenesRef.current.length === 0 && Object.keys(hdJobs).length > 0) {
      const allDone = Object.values(hdJobs).every(j => j.status === "done" || j.status === "error");
      if (allDone) {
        setRenderingAll(false);
        const succeeded = Object.values(hdJobs).filter(j => j.status === "done").length;
        if (succeeded === Object.keys(hdJobs).length) {
          toast.success("All HD renders complete! Starting final merge…");
          setAllHdJustCompleted(true);
        } else {
          toast.warning(`${succeeded}/${Object.keys(hdJobs).length} HD renders completed.`);
        }
      }
    }
  }, [hdJobs, renderingAll, activeHdCount]);

  const clearHdCompleted = useCallback(() => setAllHdJustCompleted(false), []);

  return { hdJobs, renderingAll, previewScenes, hdReadyScenes, allHd, activeHdCount, renderAllHd, allHdJustCompleted, clearHdCompleted };
}
