/**
 * Session-scoped cache of the latest post-generation motion analysis per scene
 * video URL. SceneIdleAnalysis writes on completion; ExportStep reads at
 * export time so audit JSON includes what the caption/idle detector flagged
 * without needing a new DB column or persistence round-trip.
 */
import type { SceneMotionReport } from "@/lib/scene-motion-analyzer";

export interface SceneMotionAuditRecord {
  analyzed_at: string;
  video_url: string;
  video_key?: string;
  scores: SceneMotionReport["scores"];
  is_idle: boolean;
  mouth_frozen: boolean;
  head_frozen: boolean;
  caption_score: number;
  has_burned_in_captions: boolean;
  caption_frames?: Array<{
    t: number;
    has_caption: boolean;
    band?: { y1: number; y2: number };
  }>;
  suggestions: string[];
}

const store = new Map<string, SceneMotionAuditRecord>();

export function keyFor(videoUrl: string): string {
  return videoUrl;
}

export function recordMotionAudit(
  videoUrl: string,
  videoKey: string | undefined,
  report: SceneMotionReport,
): SceneMotionAuditRecord {
  const rec: SceneMotionAuditRecord = {
    analyzed_at: new Date().toISOString(),
    video_url: videoUrl,
    video_key: videoKey,
    scores: report.scores,
    is_idle: report.isIdle,
    mouth_frozen: report.mouthFrozen,
    head_frozen: report.headFrozen,
    caption_score: report.captionScore,
    has_burned_in_captions: report.hasBurnedInCaptions,
    /* Omit dataUrls from audit — keep the export small; include only detector metadata. */
    caption_frames: report.captionFrames?.map((f) => ({
      t: f.t,
      has_caption: f.hasCaption,
      band: f.band,
    })),
    suggestions: report.suggestions,
  };
  store.set(keyFor(videoUrl), rec);
  return rec;
}

export function getMotionAudit(videoUrl?: string): SceneMotionAuditRecord | undefined {
  if (!videoUrl) return undefined;
  return store.get(keyFor(videoUrl));
}
