/**
 * Publish gate for the Export step.
 *
 * Pulls per-scene qa_status / qa_report from the DB and returns whether
 * publishing should be blocked. A scene with qa_status === "failed" is
 * treated as a critical defect; "warning" surfaces in the UI but does not
 * block; "pending" / "running", missing videos, and preview-quality videos
 * also hold final publishing until the master is actually verified.
 *
 * Companion to the `scene-qa` edge function.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { evaluatePublishQuality, type PublishQaStatus } from "@/lib/publish-quality";

export type SceneQaStatus = PublishQaStatus;

export interface SceneQaSummary {
  sceneId: string;
  sceneNumber: number;
  status: SceneQaStatus;
  summary?: string;
  defectCodes: string[];
  reportUrl?: string;
  checkedAt?: string;
  videoUrl?: string;
  videoQuality?: string;
}

export interface PublishGateState {
  loading: boolean;
  scenes: SceneQaSummary[];
  failedCount: number;
  warningCount: number;
  pendingCount: number;
  missingVideoCount: number;
  nonMasterCount: number;
  canPublish: boolean;
  blockingReason?: string;
  refresh: () => Promise<void>;
  runQaFor: (sceneId: string) => Promise<void>;
  runQaAll: () => Promise<void>;
  qaInFlight: boolean;
}

export function usePublishGate(projectId: string | null | undefined): PublishGateState {
  const [loading, setLoading] = useState(true);
  const [scenes, setScenes] = useState<SceneQaSummary[]>([]);
  const [qaInFlight, setQaInFlight] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setScenes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("scenes")
      .select("id, scene_number, qa_status, qa_report, qa_checked_at, video_url, video_quality")
      .eq("project_id", projectId)
      .order("scene_number", { ascending: true });

    if (error) {
      console.warn("[usePublishGate] failed to load qa state", error);
      setScenes([]);
    } else {
      setScenes(
        (data ?? []).map((row: any) => ({
          sceneId: row.id,
          sceneNumber: row.scene_number,
          status: (row.qa_status as SceneQaStatus) ?? "pending",
          summary: row.qa_report?.summary,
          defectCodes: Array.isArray(row.qa_report?.defects)
            ? row.qa_report.defects.map((d: any) => d.code)
            : [],
          checkedAt: row.qa_checked_at ?? undefined,
          videoUrl: row.video_url ?? undefined,
          videoQuality: row.video_quality ?? undefined,
        })),
      );
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runQaFor = useCallback(
    async (sceneId: string) => {
      if (!projectId) return;
      setQaInFlight(true);
      try {
        await supabase.functions.invoke("scene-qa", {
          body: { scene_id: sceneId, project_id: projectId },
        });
        await refresh();
      } finally {
        setQaInFlight(false);
      }
    },
    [projectId, refresh],
  );

  const runQaAll = useCallback(async () => {
    if (!projectId || scenes.length === 0) return;
    setQaInFlight(true);
    try {
      // Run sequentially to avoid hammering the gateway / fal extract-frames.
      for (const s of scenes) {
        await supabase.functions.invoke("scene-qa", {
          body: { scene_id: s.sceneId, project_id: projectId },
        });
      }
      await refresh();
    } finally {
      setQaInFlight(false);
    }
  }, [projectId, scenes, refresh]);

  const verdict = evaluatePublishQuality(scenes, loading);

  return {
    loading,
    scenes,
    failedCount: verdict.failedCount,
    warningCount: verdict.warningCount,
    pendingCount: verdict.pendingCount,
    missingVideoCount: verdict.missingVideoCount,
    nonMasterCount: verdict.nonMasterCount,
    canPublish: verdict.canPublish,
    blockingReason: verdict.blockingReason,
    refresh,
    runQaFor,
    runQaAll,
    qaInFlight,
  };
}
