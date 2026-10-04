/**
 * useBatchGeneration — Manages batch video generation (selected + all).
 */

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { Scene } from "@/contexts/ProjectContext";

interface UseBatchGenerationParams {
  scenes: Scene[];
  submitVideoJob: (index: number, quality: "preview" | "hd", modelOverride?: string, refSceneIdx?: number | null) => Promise<void>;
  globalProvider: string;
  referenceSceneIndex: number | null;
  confirmJob: (provider: string, count: number) => Promise<boolean>;
}

export function useBatchGeneration({
  scenes, submitVideoJob, globalProvider, referenceSceneIndex, confirmJob,
}: UseBatchGenerationParams) {
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; startedAt: number } | null>(null);
  const batchAbort = useRef(false);

  // Concurrency cap honours the server-side 5-active-jobs limit while
  // submitting in parallel waves instead of strictly serial with 800ms gaps.
  // Also drops the O(n^2) indexOf() lookup in the prior loop.
  const SUBMIT_CONCURRENCY = 3;

  const runBatch = useCallback(async (indices: number[], successLabel: string) => {
    setBatchGenerating(true);
    setBatchProgress({ done: 0, total: indices.length, startedAt: Date.now() });
    batchAbort.current = false;

    let cursor = 0;
    const total = indices.length;
    const worker = async () => {
      while (!batchAbort.current) {
        const myIdx = cursor++;
        if (myIdx >= total) return;
        const sceneIdx = indices[myIdx];
        try { await submitVideoJob(sceneIdx, "hd", globalProvider, referenceSceneIndex); }
        catch (e) { console.error(`Failed to start video for scene ${sceneIdx + 1}:`, e); }
        setBatchProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null);
      }
    };
    await Promise.all(Array.from({ length: Math.min(SUBMIT_CONCURRENCY, total) }, worker));

    setBatchGenerating(false);
    if (!batchAbort.current) toast.success(successLabel);
    setBatchProgress(null);
  }, [submitVideoJob, referenceSceneIndex, globalProvider]);

  const generateSelectedVideos = useCallback(async (selectedForGeneration: Set<number>) => {
    const localLipSync = globalProvider === "musetalk-local";
    const indices = Array.from(selectedForGeneration).filter(idx => {
      const scene = scenes[idx];
      return !!scene && !scene.generatingVideo && (localLipSync ? !!scene.videoUrl : !!scene.imageUrl && !scene.videoUrl);
    });
    if (indices.length === 0) {
      toast.info(localLipSync
        ? "Select scenes that already have videos to apply MuseTalk Local lip sync."
        : "Select scenes with images that do not yet have videos.");
      return;
    }
    const ok = await confirmJob(globalProvider, indices.length);
    if (!ok) return;
    await runBatch(
      indices,
      `Started ${indices.length} video generation jobs${referenceSceneIndex != null ? ` using Scene ${scenes[referenceSceneIndex]?.scene_number} as reference` : ""}!`,
    );
  }, [scenes, runBatch, referenceSceneIndex, confirmJob, globalProvider]);

  const generateAllVideos = useCallback(async () => {
    const localLipSync = globalProvider === "musetalk-local";
    const allIndices = scenes.map((s, i) => (!s.generatingVideo && (localLipSync ? !!s.videoUrl : !!s.imageUrl && !s.videoUrl) ? i : -1)).filter(i => i >= 0);
    if (allIndices.length === 0) { toast.info(localLipSync ? "No existing scene videos are ready for MuseTalk Local lip sync." : "No scenes with images are ready to generate."); return; }
    const ok = await confirmJob(globalProvider, allIndices.length);
    if (!ok) return;
    await runBatch(allIndices, `Started ${allIndices.length} video generation jobs!`);
  }, [scenes, runBatch, confirmJob, globalProvider]);

  const abortBatch = useCallback(() => { batchAbort.current = true; }, []);

  return {
    batchGenerating, batchProgress, batchAbort,
    generateSelectedVideos, generateAllVideos, abortBatch,
  };
}
