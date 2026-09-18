/**
 * Run report — single source of truth for the "entire storyboard run" export.
 *
 * Shape is shared by:
 *   - JSON download (raw machine-readable)
 *   - PDF download (human-readable summary)
 *
 * Pulls live status from render_jobs / lipsync_jobs / generation_jobs so the
 * report reflects what the backend actually has, not just what's cached in
 * ProjectContext (which can lag if the user switched tabs mid-render).
 */

import { supabase } from "@/integrations/supabase/client";
import type { Scene } from "@/contexts/ProjectContext";

export interface RunReport {
  generated_at: string;
  project: {
    id: string;
    name?: string;
    status?: string;
    current_step?: number;
    bpm?: number | null;
    music_key?: string | null;
    mood?: string | null;
    energy?: string | null;
    instruments?: string[] | null;
    segment_count?: number;
    created_at?: string;
    updated_at?: string;
  };
  transcription: {
    full_text?: string | null;
    word_count?: number | null;
    version_id?: string | null;
    version_number?: number | null;
    status?: string | null;
  } | null;
  scenes: Array<{
    scene_number: number;
    lyric_segment?: string;
    time_start?: string;
    time_end?: string;
    mood?: string;
    location?: string;
    visual_prompt?: string;
    image_url?: string;
    video_url?: string;
    video_quality?: string;
    enhanced_video_url?: string;
    lipsync_video_url?: string;
    tracking_id?: string;
    render_job?: { status: string; provider: string; quality: string; progress: number; error?: string | null; output_url?: string | null; updated_at?: string };
    lipsync_job?: { status: string; provider: string; progress: number; output_url?: string | null; error?: string | null; updated_at?: string };
  }>;
  final_assets: {
    final_video_url?: string | null;
    merge_status?: string | null;
    merge_updated_at?: string | null;
  };
  totals: {
    scenes: number;
    scenes_with_image: number;
    scenes_with_video: number;
    scenes_with_lipsync: number;
    failed_renders: number;
  };
}

export async function buildRunReport(
  projectId: string,
  userId: string,
  localScenes: Scene[],
): Promise<RunReport> {
  // Pull live data in parallel — every query is owner-scoped via RLS.
  const [projectQ, transcriptQ, renderQ, lipsyncQ, mergeQ] = await Promise.all([
    supabase.from("projects").select("id,name,status,current_step,bpm,music_key,mood,energy,instruments,segment_count,created_at,updated_at").eq("id", projectId).single(),
    supabase.from("transcript_versions").select("id,version_number,status,full_text,raw_payload").eq("project_id", projectId).eq("user_id", userId).order("version_number", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("render_jobs").select("scene_number,status,provider,quality,progress,error,output,updated_at").eq("project_id", projectId).eq("user_id", userId),
    supabase.from("lipsync_jobs").select("scene_number,status,provider,progress,output_url,error_message,updated_at").eq("project_id", projectId).eq("user_id", userId),
    supabase.from("render_jobs").select("final_output_url,merge_status,updated_at").eq("project_id", projectId).eq("user_id", userId).eq("scene_number", -1).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const project = projectQ.data ?? { id: projectId };
  const transcript = transcriptQ.data;
  const renderRows = renderQ.data ?? [];
  const lipsyncRows = lipsyncQ.data ?? [];
  const merge = mergeQ.data;

  // Pick the most-recent render_job per scene_number (>=0; -1 is the final merge).
  const latestByScene = new Map<number, typeof renderRows[number]>();
  for (const r of renderRows) {
    if (r.scene_number == null || r.scene_number < 0) continue;
    const prev = latestByScene.get(r.scene_number);
    if (!prev || (r.updated_at && (!prev.updated_at || r.updated_at > prev.updated_at))) {
      latestByScene.set(r.scene_number, r);
    }
  }
  const latestLipsyncByScene = new Map<number, typeof lipsyncRows[number]>();
  for (const r of lipsyncRows) {
    if (r.scene_number == null) continue;
    const prev = latestLipsyncByScene.get(r.scene_number);
    if (!prev || (r.updated_at && (!prev.updated_at || r.updated_at > prev.updated_at))) {
      latestLipsyncByScene.set(r.scene_number, r);
    }
  }

  const wordCount =
    (transcript?.full_text?.trim().split(/\s+/).filter(Boolean).length) ??
    (transcript?.raw_payload as any)?.word_count ?? null;

  const scenes = localScenes.map((s) => {
    const sn = s.scene_number ?? 0;
    const r = latestByScene.get(sn);
    const l = latestLipsyncByScene.get(sn);
    return {
      scene_number: sn,
      lyric_segment: s.lyric_segment,
      time_start: s.time_start,
      time_end: s.time_end,
      mood: s.mood,
      location: s.location,
      visual_prompt: s.visual_prompt,
      image_url: s.imageUrl,
      video_url: s.videoUrl,
      video_quality: s.videoQuality,
      enhanced_video_url: (s as any).enhancedVideoUrl,
      lipsync_video_url: (s as any).lipsyncVideoUrl,
      tracking_id: (s as any).trackingId,
      render_job: r
        ? {
            status: r.status,
            provider: r.provider,
            quality: r.quality,
            progress: r.progress ?? 0,
            error: r.error,
            output_url: (r.output as any)?.videoUrl ?? null,
            updated_at: r.updated_at,
          }
        : undefined,
      lipsync_job: l
        ? {
            status: l.status,
            provider: l.provider,
            progress: l.progress ?? 0,
            output_url: l.output_url,
            error: l.error_message,
            updated_at: l.updated_at,
          }
        : undefined,
    };
  });

  const failed = scenes.filter((s) => s.render_job?.status === "failed").length;

  return {
    generated_at: new Date().toISOString(),
    project: {
      id: project.id,
      name: (project as any).name,
      status: (project as any).status,
      current_step: (project as any).current_step,
      bpm: (project as any).bpm ?? null,
      music_key: (project as any).music_key ?? null,
      mood: (project as any).mood ?? null,
      energy: (project as any).energy ?? null,
      instruments: (project as any).instruments ?? null,
      segment_count: (project as any).segment_count,
      created_at: (project as any).created_at,
      updated_at: (project as any).updated_at,
    },
    transcription: transcript
      ? {
          full_text: transcript.full_text,
          word_count: wordCount,
          version_id: transcript.id,
          version_number: transcript.version_number,
          status: transcript.status,
        }
      : null,
    scenes,
    final_assets: {
      final_video_url: merge?.final_output_url ?? null,
      merge_status: merge?.merge_status ?? null,
      merge_updated_at: merge?.updated_at ?? null,
    },
    totals: {
      scenes: scenes.length,
      scenes_with_image: scenes.filter((s) => s.image_url).length,
      scenes_with_video: scenes.filter((s) => s.video_url).length,
      scenes_with_lipsync: scenes.filter((s) => s.lipsync_video_url).length,
      failed_renders: failed,
    },
  };
}
