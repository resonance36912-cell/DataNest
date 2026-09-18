/**
 * useVideoHistory — Manages loading and restoring video history for a scene.
 */

import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { VideoHistoryItem } from "@/types/storyboard";
import type { Scene } from "@/contexts/ProjectContext";

interface UseVideoHistoryOptions {
  projectId: string | null;
  userId: string | undefined;
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  freshlyGeneratedVideos: React.MutableRefObject<Set<number>>;
}

export function useVideoHistory({
  projectId,
  userId,
  scenes,
  setScenes,
  freshlyGeneratedVideos,
}: UseVideoHistoryOptions) {
  const [videoHistoryOpen, setVideoHistoryOpen] = useState<number | null>(null);
  const [videoHistoryItems, setVideoHistoryItems] = useState<VideoHistoryItem[]>([]);
  const [videoHistoryLoading, setVideoHistoryLoading] = useState(false);

  const loadVideoHistory = async (sceneIndex: number) => {
    const scene = scenes[sceneIndex];
    if (!projectId || !userId) return;
    setVideoHistoryOpen(sceneIndex);
    setVideoHistoryLoading(true);
    setVideoHistoryItems([]);
    try {
      const [genResult, renderResult] = await Promise.all([
        supabase
          .from("generation_jobs")
          .select("id, output_asset_url, provider_name, provider_model, created_at")
          .eq("project_id", projectId)
          .eq("scene_number", scene.scene_number)
          .eq("status", "succeeded")
          .not("output_asset_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("render_jobs")
          .select("id, output, quality, provider, created_at, tracking_id")
          .eq("project_id", projectId)
          .eq("scene_number", scene.scene_number)
          .in("status", ["completed", "succeeded"])
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      const items: VideoHistoryItem[] = [];
      (genResult.data || []).forEach((j: any) => {
        if (j.output_asset_url)
          items.push({
            id: j.id,
            url: j.output_asset_url,
            provider: j.provider_model || j.provider_name || "unknown",
            quality: "hd",
            createdAt: j.created_at,
          });
      });
      (renderResult.data || []).forEach((j: any) => {
        const vUrl = j.output?.video_url || j.output?.video?.url;
        if (vUrl)
          items.push({
            id: j.id,
            url: vUrl,
            provider: j.provider || "fal",
            quality: j.quality || "hd",
            createdAt: j.created_at,
            trackingId: j.tracking_id,
          });
      });
      const seen = new Set<string>();
      setVideoHistoryItems(
        items.filter((item) => {
          if (seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        })
      );
    } catch (err) {
      console.error("Failed to load video history:", err);
      toast.error("Failed to load video history.");
    } finally {
      setVideoHistoryLoading(false);
    }
  };

  const restoreVideoFromHistory = async (sceneIndex: number, videoUrl: string, quality: string) => {
    const scene = scenes[sceneIndex];
    setScenes((prev) =>
      prev.map((s, idx) => (idx === sceneIndex ? { ...s, videoUrl, videoQuality: quality as any, recalled: true } : s))
    );
    freshlyGeneratedVideos.current.add(sceneIndex);
    if (projectId && userId) {
      await supabase
        .from("scenes")
        .update({ video_url: videoUrl, video_quality: quality } as any)
        .eq("project_id", projectId)
        .eq("scene_number", scene.scene_number)
        .eq("user_id", userId);
    }
    setVideoHistoryOpen(null);
    toast.success(`Scene ${sceneIndex + 1} video restored from history.`);
  };

  return {
    videoHistoryOpen,
    setVideoHistoryOpen,
    videoHistoryItems,
    videoHistoryLoading,
    loadVideoHistory,
    restoreVideoFromHistory,
  };
}
