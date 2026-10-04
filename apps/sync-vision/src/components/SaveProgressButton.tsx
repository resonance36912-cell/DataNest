import { useState, useCallback } from "react";
import { Save, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { backfillGalleryVideos } from "@/lib/gallery-backfill";

interface SaveProgressButtonProps {
  stepIndex: number;
  /** Optional extra save logic (e.g. persist scenes) */
  onBeforeSave?: () => Promise<void>;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export default function SaveProgressButton({ stepIndex, onBeforeSave, className, size = "sm" }: SaveProgressButtonProps) {
  const {
    projectId, verification, scenes, characterConcepts,
    selectedCharacterIndex, characterConfirmed,
  } = useProject();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    if (!projectId || !user) {
      toast.error("No project to save. Upload a file first.");
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      // Run any step-specific save logic first (e.g. scene persistence)
      if (onBeforeSave) await onBeforeSave();

      // 1. Save project-level fields (step, lyrics, analysis data)
      const projectUpdate: Record<string, unknown> = {
        current_step: stepIndex,
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

      // 2. Persist all scenes with their current assets + gallery backfill
      if (scenes.length > 0) {
        const enriched = await backfillGalleryVideos(scenes, projectId, user.id);

        const rows = enriched.map(s => ({
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
        await supabase.from("scenes").upsert(rows as any, { onConflict: "project_id,user_id,scene_number" });
      }

      // 3. Persist character state (confirmed flag)
      if (characterConcepts.length > 0 && selectedCharacterIndex !== null) {
        const { data: existingChars } = await supabase
          .from("characters")
          .select("id, name")
          .eq("project_id", projectId)
          .eq("user_id", user.id);

        if (existingChars?.length) {
          // Update confirmed status for all characters
          for (let i = 0; i < existingChars.length; i++) {
            await supabase
              .from("characters")
              .update({ confirmed: i === selectedCharacterIndex && characterConfirmed })
              .eq("id", existingChars[i].id);
          }
        }
      }

      setSaved(true);
      toast.success("All progress saved — you can safely close and resume later!");
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      toast.error("Save failed: " + (e.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }, [projectId, user, stepIndex, onBeforeSave, verification, scenes, characterConcepts, selectedCharacterIndex, characterConfirmed]);

  if (!projectId) return null;

  return (
    <Button
      variant="outline"
      size={size}
      onClick={handleSave}
      disabled={saving}
      className={`gap-2 border-primary/30 text-primary hover:bg-primary/10 ${className || ""}`}
    >
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : saved ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      {saving ? "Saving…" : saved ? "Saved!" : "Save Progress"}
    </Button>
  );
}
