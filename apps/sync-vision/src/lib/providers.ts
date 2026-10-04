/**
 * Provider abstraction layer — WAN 2.5 only.
 */

import { supabase } from "@/integrations/supabase/client";
import { parseTierRequired, type TierRequiredError } from "@/lib/tierRequired";
import { reportTierRequired } from "@/lib/invokeGated";

/** Thrown by submitFalJob when the caller lacks the required subscription tier. */
export class TierRequiredJobError extends Error {
  constructor(public readonly denial: TierRequiredError) {
    super(denial.message);
    this.name = "TierRequiredJobError";
  }
}

export type VideoProvider = "fal-kling" | "local-musetalk";
export type FalQuality = "preview" | "hd";

/** Unified list of video generation options for the UI dropdown */
export interface VideoProviderOption {
  value: string;
  provider: VideoProvider;
  label: string;
  description: string;
  quality?: FalQuality;
  icon: "video";
}

export const VIDEO_PROVIDER_OPTIONS: VideoProviderOption[] = [
  { value: "musetalk-local", provider: "local-musetalk", label: "MuseTalk 1.5 Local", description: "Sovereign lip sync on this PC through the R5B localhost bridge", quality: "hd", icon: "video" },
  { value: "wan-25", provider: "fal-kling", label: "WAN 2.5 (10s)", description: "WAN 2.5 — 10s video with audio support", quality: "hd", icon: "video" },
  { value: "sync-3", provider: "fal-kling", label: "Sync Lipsync 1.9", description: "Sync Lipsync 1.9 — lip-synced talking head video", quality: "hd", icon: "video" },
  { value: "sync-v2", provider: "fal-kling", label: "Sync Lipsync 2.0", description: "Sync Lipsync 2.0 — higher quality lip sync ($3/min)", quality: "hd", icon: "video" },
  { value: "sync-so", provider: "fal-kling", label: "SadTalker (Portrait)", description: "SadTalker — portrait animation with audio", quality: "hd", icon: "video" },
];

export interface ProviderJobResult {
  jobId?: string;
  taskId: string;
  statusUrl?: string;
  responseUrl?: string;
  provider: VideoProvider;
  model?: string;
  operation?: string;
}

export interface ProviderStatusResult {
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "IN_PROGRESS" | "COMPLETED";
  progress?: number;
  outputUrl?: string;
  output?: unknown;
  error?: string;
  failureCode?: string;
}

// --------------- WAN (FAL) Adapter ---------------

export async function submitFalJob(params: {
  imageUrl: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  quality: FalQuality;
  sceneNumber: number;
  projectId?: string;
  userId: string;
  model?: string;
}): Promise<ProviderJobResult> {
  const resp = await supabase.functions.invoke("submit-video-job", {
    body: {
      image_url: params.imageUrl,
      prompt: params.prompt,
      duration: params.duration,
      aspect_ratio: params.aspectRatio,
      quality: params.quality,
      scene_number: params.sceneNumber,
      project_id: params.projectId,
      user_id: params.userId,
      model: params.model || "wan-25",
    },
  });

  if (resp.error) {
    const tier = await parseTierRequired(resp.error, "submit-video-job");
    if (tier) { await reportTierRequired(tier); throw new TierRequiredJobError(tier); }
    throw new Error(resp.error.message || "WAN submission failed");
  }
  const data = resp.data as any;
  if (data?.error) throw new Error(data.error);

  return {
    jobId: data.job_id,
    taskId: data.request_id,
    statusUrl: data.status_url,
    responseUrl: data.response_url,
    provider: "fal-kling",
    model: "wan-25",
  };
}

export async function checkFalJob(params: {
  requestId: string;
  statusUrl: string;
  responseUrl?: string;
  jobId?: string;
  jobType?: string;
}): Promise<ProviderStatusResult> {
  const resp = await supabase.functions.invoke("check-job-status", {
    body: {
      provider: "fal",
      request_id: params.requestId,
      status_url: params.statusUrl,
      response_url: params.responseUrl,
      job_id: params.jobId,
      job_type: params.jobType,
    },
  });

  if (resp.error) throw new Error(resp.error.message || "Job status check failed");
  const data = resp.data as any;

  const status = data.status?.toUpperCase() || "PENDING";
  return {
    status: status === "COMPLETED" ? "SUCCEEDED" : status,
    progress: data.queue_position !== undefined ? 30 : undefined,
    outputUrl: data.videoUrl || data.result?.video?.url,
    output: data.result,
    error: data.error,
  };
}

// --------------- Unified helpers ---------------
