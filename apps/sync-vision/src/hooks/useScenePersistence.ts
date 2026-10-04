import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scene } from "@/contexts/ProjectContext";

export interface PersistScenesOptions {
  /**
   * Treat scenesList as the complete project snapshot and remove database rows
   * that are not present. Partial retries must set this to false.
   */
  deleteMissing?: boolean;
}

type ExistingSceneAssets = {
  scene_number: number;
  scene_image_url: string | null;
  video_url: string | null;
  video_quality: string | null;
  lipsync_video_url: string | null;
  enhanced_video_url: string | null;
  segment_audio_url: string | null;
  segment_audio_path: string | null;
  tracking_id: string | null;
};

/**
 * Database persistence helpers for scene data.
 * Centralises all Supabase writes related to scene assets.
 */
export function useScenePersistence(projectId: string | null, userId: string | undefined) {
  /** Persist arbitrary fields for a single scene row */
  const persistSceneField = useCallback(async (sceneNumber: number, fields: Record<string, unknown>) => {
    if (!projectId || !userId) return;
    await supabase
      .from("scenes")
      .update(fields as any)
      .eq("project_id", projectId)
      .eq("scene_number", sceneNumber)
      .eq("user_id", userId);
  }, [projectId, userId]);

  /** Persist a generated scene image URL */
  const persistSceneImageUrl = useCallback(async (sceneNumber: number, imageUrl: string) => {
    persistSceneField(sceneNumber, { scene_image_url: imageUrl });
  }, [persistSceneField]);

  /** Persist video URL */
  const persistSceneVideoUrl = useCallback(async (sceneNumber: number, videoUrl: string, quality?: string) => {
    persistSceneField(sceneNumber, { video_url: videoUrl, video_quality: quality || null });
  }, [persistSceneField]);

  /** Persist lip-sync video URL */
  const persistSceneLipSyncUrl = useCallback(async (sceneNumber: number, lipSyncUrl: string) => {
    persistSceneField(sceneNumber, { lipsync_video_url: lipSyncUrl });
  }, [persistSceneField]);

  /**
   * Persist a full scene snapshot or a partial retry result.
   *
   * Existing generated media is retained when a storyline refresh only
   * supplies prompt fields. This prevents a prompt regeneration from silently
   * discarding already-paid image and video outputs.
   */
  const persistScenesToDb = useCallback(async (
    scenesList: Scene[],
    options: PersistScenesOptions = {},
  ) => {
    if (!projectId || !userId) return;

    const { data: existingData, error: existingError } = await supabase
      .from("scenes")
      .select("scene_number,scene_image_url,video_url,video_quality,lipsync_video_url,enhanced_video_url,segment_audio_url,segment_audio_path,tracking_id")
      .eq("project_id", projectId)
      .eq("user_id", userId);
    if (existingError) throw existingError;

    const existingByNumber = new Map<number, ExistingSceneAssets>(
      ((existingData || []) as ExistingSceneAssets[]).map((row) => [row.scene_number, row]),
    );

    // Only a complete snapshot may remove rows. Passing a partial retry result
    // here used to delete every successful scene outside that retry batch.
    const sceneNumbers = scenesList.map(s => s.scene_number);
    if (options.deleteMissing !== false) {
      let deleteQuery = supabase
        .from("scenes")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (sceneNumbers.length > 0) {
        deleteQuery = deleteQuery.not("scene_number", "in", `(${sceneNumbers.join(",")})`);
      }
      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;
    }

    const rows = scenesList.map(s => {
      const existing = existingByNumber.get(s.scene_number);
      return {
        project_id: projectId,
        user_id: userId,
        scene_number: s.scene_number,
        section_type: s.section_type || null,
        section_index: s.section_index || 1,
        lyric_segment: s.lyric_segment,
        time_start: s.time_start,
        time_end: s.time_end,
        mood: s.mood,
        location: s.location,
        camera_style: s.camera_style,
        action_description: s.action_description,
        visual_prompt: s.visual_prompt,
        scene_image_url: s.imageUrl ?? existing?.scene_image_url ?? null,
        video_url: s.videoUrl ?? existing?.video_url ?? null,
        video_quality: s.videoQuality ?? existing?.video_quality ?? null,
        lipsync_video_url: s.lipSyncVideoUrl ?? existing?.lipsync_video_url ?? null,
        enhanced_video_url: s.enhancedVideoUrl ?? existing?.enhanced_video_url ?? null,
        segment_audio_url: s.segmentAudioUrl ?? (s as any).segment_audio_url ?? existing?.segment_audio_url ?? null,
        segment_audio_path: s.segmentAudioPath ?? (s as any).segment_audio_path ?? existing?.segment_audio_path ?? null,
        segment_lyrics: (s as any).segment_lyrics || null,
        tracking_id: s.trackingId ?? existing?.tracking_id ?? null,
        is_broll: s.is_broll === true,
      };
    });
    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("scenes")
        .upsert(rows as any, { onConflict: "project_id,user_id,scene_number" });
      if (upsertError) throw upsertError;
    }
  }, [projectId, userId]);

  return {
    persistSceneField,
    persistSceneImageUrl,
    persistSceneVideoUrl,
    persistSceneLipSyncUrl,
    persistScenesToDb,
  };
}
