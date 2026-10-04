/**
 * Client helper for the normalize-scene-video edge function.
 *
 * Runs the post-render normalization pass on a rendered scene video and
 * returns the normalized URL. On any non-billing failure the edge function
 * responds with `{ fallback: true, video_url: <input> }` so callers can
 * always rely on a usable URL coming back — they should inspect `normalized`
 * to know whether the pass actually succeeded.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseTierRequired } from "@/lib/tierRequired";
import { reportTierRequired } from "@/lib/invokeGated";

export interface NormalizeSceneVideoInput {
  videoUrl: string;
  durationSec?: number;
  sceneNumber?: number;
  projectId?: string;
  skipLoudnorm?: boolean;
}

export interface NormalizeSceneVideoResult {
  videoUrl: string;
  normalized: boolean;
  fallback?: boolean;
  error?: string;
  spec?: {
    width: number;
    height: number;
    fps: number;
    audio_sample_rate: number;
    audio_bitrate: string;
    target_lufs: number | null;
  };
}

export async function normalizeSceneVideo(
  input: NormalizeSceneVideoInput,
): Promise<NormalizeSceneVideoResult> {
  const { data, error } = await supabase.functions.invoke("normalize-scene-video", {
    body: {
      video_url: input.videoUrl,
      duration_sec: input.durationSec,
      scene_number: input.sceneNumber,
      project_id: input.projectId,
      skip_loudnorm: input.skipLoudnorm,
    },
  });

  if (error) {
    const tier = await parseTierRequired(error, "normalize-scene-video");
    if (tier) await reportTierRequired(tier);
    return {
      videoUrl: input.videoUrl,
      normalized: false,
      fallback: true,
      error: tier ? tier.message : error.message,
    };
  }

  return {
    videoUrl: data?.video_url ?? input.videoUrl,
    normalized: Boolean(data?.normalized),
    fallback: Boolean(data?.fallback),
    error: data?.error,
    spec: data?.spec,
  };
}
