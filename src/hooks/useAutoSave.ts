import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { backfillGalleryVideos } from "@/lib/gallery-backfill";

const AUTO_SAVE_INTERVAL = 2 * 60 * 1000; // 2 minutes

/**
 * Periodically auto-saves project progress every 2 minutes.
 * Shows a subtle toast on success; suppresses repeated error toasts.
 */
export function useAutoSave() {
  const {
    projectId, currentStep, verification, scenes,
    characterConcepts, selectedCharacterIndex, characterConfirmed,
  } = useProject();
  const { user } = useAuth();
  const lastErrorRef = useRef(false);

  const autoSave = useCallback(async () => {
    if (!projectId || !user) return;

    try {
      // 1. Project-level fields
      const projectUpdate: Record<string, unknown> = {
        current_step: currentStep,
        updated_at: new Date().toISOString(),
      };
      if (verification) {
        projectUpdate.lyrics = verification.verified_lyrics || null;
        projectUpdate.bpm = verification.bpm || null;
        projectUpdate.music_key = verification.music_key || null;
        projectUpdate.mood = verification.mood || null;
        projectUpdate.energy = verification.energy || null;
        projectUpdate.instruments = verification.instruments || null;
      }
      await supabase
        .from("projects")
        .update(projectUpdate as any)
        .eq("id", projectId)
        .eq("user_id", user.id);

      // 2. Persist scenes (only when we have scenes in state — never wipe DB when state is empty)
      if (scenes.length > 0) {
        // Auto-pull gallery videos into scenes that lack a video
        const scenesWithGallery = await backfillGalleryVideos(scenes, projectId, user.id);

        const rows = scenesWithGallery.map(s => ({
          project_id: projectId,
          user_id: user.id,
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
          scene_image_url: s.imageUrl || null,
          video_url: s.videoUrl || null,
          video_quality: s.videoQuality || null,
          lipsync_video_url: s.lipSyncVideoUrl || null,
          enhanced_video_url: s.enhancedVideoUrl || null,
          segment_audio_url: (s as any).segmentAudioUrl || (s as any).segment_audio_url || null,
          segment_audio_path: (s as any).segmentAudioPath || (s as any).segment_audio_path || null,
          segment_lyrics: (s as any).segment_lyrics || null,
        }));
        // Use upsert instead of delete+insert to avoid race conditions
        await supabase.from("scenes").upsert(rows as any, { onConflict: "project_id,user_id,scene_number" });
      }

      // 3. Characters confirmed state
      if (characterConcepts.length > 0 && selectedCharacterIndex !== null) {
        const { data: existingChars } = await supabase
          .from("characters")
          .select("id")
          .eq("project_id", projectId)
          .eq("user_id", user.id);

        if (existingChars?.length) {
          for (let i = 0; i < existingChars.length; i++) {
            await supabase
              .from("characters")
              .update({ confirmed: i === selectedCharacterIndex && characterConfirmed })
              .eq("id", existingChars[i].id);
          }
        }
      }

      lastErrorRef.current = false;
      // Subtle auto-save indicator (no intrusive toast)
      console.log("[AutoSave] Progress saved at", new Date().toLocaleTimeString());
    } catch (e: any) {
      if (!lastErrorRef.current) {
        toast.error("Auto-save failed — your work may not be saved");
        lastErrorRef.current = true;
      }
      console.error("[AutoSave] Error:", e);
    }
  }, [projectId, user, currentStep, verification, scenes, characterConcepts, selectedCharacterIndex, characterConfirmed]);

  useEffect(() => {
    if (!projectId || !user) return;
    const id = setInterval(autoSave, AUTO_SAVE_INTERVAL);
    return () => clearInterval(id);
  }, [autoSave, projectId, user]);
}
