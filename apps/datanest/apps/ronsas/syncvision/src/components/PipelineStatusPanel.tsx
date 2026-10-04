/**
 * PipelineStatusPanel — User-facing real-time view of the 4 production stages.
 *
 * Stages: Upload → Transcription → Scene generation → Render
 * Per-stage states: queued / processing / complete / failed / retry
 *
 * Subscribes to Supabase Realtime on projects, transcript_versions, scenes,
 * and render_jobs filtered by project_id. Each stage's state is derived
 * deterministically from row counts/statuses — no separate stage table.
 */

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload as UploadIcon,
  FileText,
  Clapperboard,
  Film,
  CheckCircle2,
  Loader2,
  Clock,
  AlertCircle,
  RotateCw,
  type LucideIcon,
} from "lucide-react";

type StageState = "idle" | "queued" | "processing" | "complete" | "failed" | "retry";

interface Stage {
  key: "upload" | "transcription" | "scenes" | "render";
  label: string;
  icon: LucideIcon;
  state: StageState;
  detail?: string;
  progress?: number; // 0-100
}

interface PipelineSnapshot {
  hasFile: boolean;
  transcriptStatus: "none" | "draft" | "active";
  lineCount: number;
  sceneTotal: number;
  sceneImagesReady: number;
  sceneVideosReady: number;
  renderTotal: number;
  renderComplete: number;
  renderFailed: number;
  renderProcessing: number;
  renderRetrying: number;
}

const EMPTY: PipelineSnapshot = {
  hasFile: false,
  transcriptStatus: "none",
  lineCount: 0,
  sceneTotal: 0,
  sceneImagesReady: 0,
  sceneVideosReady: 0,
  renderTotal: 0,
  renderComplete: 0,
  renderFailed: 0,
  renderProcessing: 0,
  renderRetrying: 0,
};

interface Props {
  projectId: string | null;
}

export default function PipelineStatusPanel({ projectId }: Props) {
  const [snap, setSnap] = useState<PipelineSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);

  // Initial fetch + refetch helper
  useEffect(() => {
    if (!projectId) {
      setSnap(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const refetch = async () => {
      const [projectRes, txRes, scenesRes, jobsRes] = await Promise.all([
        supabase.from("projects").select("file_path").eq("id", projectId).maybeSingle(),
        supabase
          .from("transcript_versions")
          .select("id,status")
          .eq("project_id", projectId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("scenes")
          .select("id,scene_image_url,video_url,lipsync_video_url")
          .eq("project_id", projectId),
        supabase
          .from("render_jobs")
          .select("id,status,retry_count")
          .eq("project_id", projectId),
      ]);

      if (cancelled) return;

      let lineCount = 0;
      const activeTxId = txRes.data?.id;
      if (activeTxId) {
        const { count } = await supabase
          .from("lyric_lines")
          .select("id", { count: "exact", head: true })
          .eq("transcript_version_id", activeTxId);
        lineCount = count ?? 0;
      }

      const scenes = scenesRes.data ?? [];
      const jobs = jobsRes.data ?? [];

      const renderComplete = jobs.filter(
        (j) => j.status === "completed" || j.status === "succeeded"
      ).length;
      const renderFailed = jobs.filter((j) => j.status === "failed").length;
      const renderProcessing = jobs.filter((j) =>
        ["processing", "running", "in_progress", "submitted", "queued", "retrying"].includes(j.status as string)
      ).length;
      const renderRetrying = jobs.filter(
        (j) => j.status === "retrying" || (j.retry_count ?? 0) > 0
      ).length;

      setSnap({
        hasFile: !!projectRes.data?.file_path,
        transcriptStatus: (txRes.data?.status as "draft" | "active") ?? "none",
        lineCount,
        sceneTotal: scenes.length,
        sceneImagesReady: scenes.filter((s) => !!s.scene_image_url).length,
        sceneVideosReady: scenes.filter((s) => !!s.video_url || !!s.lipsync_video_url).length,
        renderTotal: jobs.length,
        renderComplete,
        renderFailed,
        renderProcessing,
        renderRetrying,
      });
      setLoading(false);
    };

    refetch();

    // Realtime: any change in scope re-fetches the snapshot.
    // Debounced via a simple timer to coalesce bursty webhook updates.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refetch, 350);
    };

    const channel = supabase
      .channel(`pipeline-status-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects", filter: `id=eq.${projectId}` },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transcript_versions", filter: `project_id=eq.${projectId}` },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scenes", filter: `project_id=eq.${projectId}` },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "render_jobs", filter: `project_id=eq.${projectId}` },
        schedule
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const stages: Stage[] = useMemo(() => {
    // 1. Upload
    const uploadStage: Stage = {
      key: "upload",
      label: "Upload",
      icon: UploadIcon,
      state: snap.hasFile ? "complete" : "idle",
      detail: snap.hasFile ? "Audio ready" : "Waiting for audio file",
    };

    // 2. Transcription
    let txState: StageState = "idle";
    let txDetail = "Awaiting upload";
    if (snap.hasFile) {
      if (snap.transcriptStatus === "active" && snap.lineCount > 0) {
        txState = "complete";
        txDetail = `${snap.lineCount} lyric line${snap.lineCount === 1 ? "" : "s"}`;
      } else if (snap.transcriptStatus === "draft") {
        txState = "processing";
        txDetail = "Transcribing…";
      } else if (snap.transcriptStatus === "active" && snap.lineCount === 0) {
        txState = "processing";
        txDetail = "Finalizing lyrics…";
      } else {
        txState = "queued";
        txDetail = "Queued for transcription";
      }
    }
    const txStage: Stage = {
      key: "transcription",
      label: "Transcription",
      icon: FileText,
      state: txState,
      detail: txDetail,
    };

    // 3. Scenes
    let sceneState: StageState = "idle";
    let sceneDetail = "Awaiting transcription";
    let sceneProgress: number | undefined;
    if (snap.sceneTotal > 0) {
      sceneProgress = Math.round((snap.sceneImagesReady / snap.sceneTotal) * 100);
      if (snap.sceneImagesReady === snap.sceneTotal) {
        sceneState = "complete";
        sceneDetail = `${snap.sceneTotal} scenes generated`;
      } else if (snap.sceneImagesReady > 0) {
        sceneState = "processing";
        sceneDetail = `${snap.sceneImagesReady}/${snap.sceneTotal} scenes`;
      } else {
        sceneState = "queued";
        sceneDetail = `0/${snap.sceneTotal} scenes`;
      }
    } else if (txState === "complete") {
      sceneState = "queued";
      sceneDetail = "Ready to generate scenes";
    }
    const sceneStage: Stage = {
      key: "scenes",
      label: "Scene generation",
      icon: Clapperboard,
      state: sceneState,
      detail: sceneDetail,
      progress: sceneProgress,
    };

    // 4. Render
    let renderState: StageState = "idle";
    let renderDetail = "No renders yet";
    let renderProgress: number | undefined;
    if (snap.renderTotal > 0) {
      renderProgress = Math.round((snap.renderComplete / snap.renderTotal) * 100);
      if (snap.renderFailed > 0 && snap.renderRetrying === 0 && snap.renderProcessing === 0) {
        renderState = "failed";
        renderDetail = `${snap.renderFailed} failed, ${snap.renderComplete}/${snap.renderTotal} done`;
      } else if (snap.renderRetrying > 0) {
        renderState = "retry";
        renderDetail = `Retrying ${snap.renderRetrying} of ${snap.renderTotal}`;
      } else if (snap.renderComplete === snap.renderTotal) {
        renderState = "complete";
        renderDetail = `All ${snap.renderTotal} renders complete`;
      } else if (snap.renderProcessing > 0) {
        renderState = "processing";
        renderDetail = `${snap.renderProcessing} running, ${snap.renderComplete}/${snap.renderTotal} done`;
      } else {
        renderState = "queued";
        renderDetail = `${snap.renderComplete}/${snap.renderTotal} done`;
      }
    } else if (snap.sceneImagesReady > 0) {
      renderState = "idle";
      renderDetail = "Ready when you are";
    }
    const renderStage: Stage = {
      key: "render",
      label: "Lip-sync render",
      icon: Film,
      state: renderState,
      detail: renderDetail,
      progress: renderProgress,
    };

    return [uploadStage, txStage, sceneStage, renderStage];
  }, [snap]);

  if (!projectId) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 backdrop-blur-sm p-3 md:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs md:text-sm font-medium text-foreground/90">
          Production pipeline
        </h3>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {stages.map((stage) => (
          <StageCard key={stage.key} stage={stage} />
        ))}
      </div>
    </div>
  );
}

function StageCard({ stage }: { stage: Stage }) {
  const Icon = stage.icon;
  const v = STATE_STYLES[stage.state];
  return (
    <div
      className={`relative rounded-md border ${v.border} ${v.bg} p-2.5 md:p-3 transition-colors`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${v.iconClass}`} />
          <span className="text-[10px] md:text-xs font-medium text-foreground/90 truncate">
            {stage.label}
          </span>
        </div>
        <StateBadge state={stage.state} />
      </div>
      <p className="text-[10px] md:text-[11px] text-muted-foreground line-clamp-2 leading-tight">
        {stage.detail}
      </p>
      {typeof stage.progress === "number" && stage.state !== "idle" && (
        <div className="mt-2 h-1 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={`h-full ${v.barClass} transition-all duration-500`}
            style={{ width: `${stage.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StateBadge({ state }: { state: StageState }) {
  const v = STATE_STYLES[state];
  const Icon = v.badgeIcon;
  const animate = state === "processing" || state === "retry";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] md:text-[10px] font-medium ${v.badgeClass}`}
    >
      <Icon className={`h-2.5 w-2.5 ${animate ? "animate-spin" : ""}`} />
      <span className="capitalize">{v.label}</span>
    </span>
  );
}

const STATE_STYLES: Record<
  StageState,
  {
    border: string;
    bg: string;
    iconClass: string;
    badgeClass: string;
    badgeIcon: LucideIcon;
    barClass: string;
    label: string;
  }
> = {
  idle: {
    border: "border-border/40",
    bg: "bg-muted/10",
    iconClass: "text-muted-foreground",
    badgeClass: "bg-muted/40 text-muted-foreground",
    badgeIcon: Clock,
    barClass: "bg-muted-foreground/40",
    label: "idle",
  },
  queued: {
    border: "border-border/40",
    bg: "bg-muted/20",
    iconClass: "text-muted-foreground",
    badgeClass: "bg-muted/50 text-foreground/70",
    badgeIcon: Clock,
    barClass: "bg-muted-foreground/50",
    label: "queued",
  },
  processing: {
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/5",
    iconClass: "text-cyan-400",
    badgeClass: "bg-cyan-500/15 text-cyan-300",
    badgeIcon: Loader2,
    barClass: "bg-cyan-400",
    label: "processing",
  },
  complete: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/5",
    iconClass: "text-emerald-400",
    badgeClass: "bg-emerald-500/15 text-emerald-300",
    badgeIcon: CheckCircle2,
    barClass: "bg-emerald-400",
    label: "complete",
  },
  failed: {
    border: "border-destructive/50",
    bg: "bg-destructive/5",
    iconClass: "text-destructive",
    badgeClass: "bg-destructive/15 text-destructive",
    badgeIcon: AlertCircle,
    barClass: "bg-destructive",
    label: "failed",
  },
  retry: {
    border: "border-amber-500/50",
    bg: "bg-amber-500/5",
    iconClass: "text-amber-400",
    badgeClass: "bg-amber-500/15 text-amber-300",
    badgeIcon: RotateCw,
    barClass: "bg-amber-400",
    label: "retrying",
  },
};
