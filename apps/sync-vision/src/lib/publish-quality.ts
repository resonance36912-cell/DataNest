import { isMasterReadyVideoQuality } from "@/lib/master-quality";

export type PublishQaStatus =
  | "pending"
  | "running"
  | "passed"
  | "warning"
  | "failed"
  | "skipped";

export interface PublishQualityScene {
  status: PublishQaStatus;
  videoUrl?: string | null;
  videoQuality?: string | null;
}

export interface PublishQualityVerdict {
  failedCount: number;
  warningCount: number;
  pendingCount: number;
  missingVideoCount: number;
  nonMasterCount: number;
  canPublish: boolean;
  blockingReason?: string;
}

/**
 * Strict final-output gate. A master can only be assembled when every scene
 * has a master-ready video and automated QA has reached a terminal verdict.
 */
export function evaluatePublishQuality(
  scenes: PublishQualityScene[],
  loading = false,
): PublishQualityVerdict {
  const failedCount = scenes.filter((scene) => scene.status === "failed").length;
  const warningCount = scenes.filter((scene) => scene.status === "warning").length;
  const pendingCount = scenes.filter(
    (scene) => scene.status === "pending" || scene.status === "running",
  ).length;
  const missingVideoCount = scenes.filter((scene) => !scene.videoUrl).length;
  const nonMasterCount = scenes.filter(
    (scene) => Boolean(scene.videoUrl) && !isMasterReadyVideoQuality(scene.videoQuality),
  ).length;

  const reasons: string[] = [];
  if (scenes.length === 0) reasons.push("No scenes are available for export.");
  if (failedCount > 0) reasons.push(`${failedCount} scene${failedCount === 1 ? "" : "s"} failed automated QA.`);
  if (pendingCount > 0) reasons.push(`${pendingCount} scene${pendingCount === 1 ? " is" : "s are"} still awaiting QA.`);
  if (missingVideoCount > 0) reasons.push(`${missingVideoCount} scene${missingVideoCount === 1 ? " has" : "s have"} no video.`);
  if (nonMasterCount > 0) reasons.push(`${nonMasterCount} scene${nonMasterCount === 1 ? " is" : "s are"} not HD/master quality.`);

  return {
    failedCount,
    warningCount,
    pendingCount,
    missingVideoCount,
    nonMasterCount,
    canPublish: !loading && reasons.length === 0,
    blockingReason: reasons.length > 0 ? reasons.join(" ") : undefined,
  };
}
