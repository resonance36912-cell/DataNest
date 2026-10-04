/**
 * PHASE 4 — Merge Integrity Validation
 *
 * Validates render segments before final concatenation.
 * Fail-closed: any missing metadata, drift, gaps, or incomplete segments block merge.
 */

export interface SegmentMedia {
  segment_index: number;
  scene_number: number;
  status: string;
  output_asset_url: string | null;
  media_metadata: {
    codec?: string | null;
    fps?: number | null;
    width?: number | null;
    height?: number | null;
    sample_rate?: number | null;
    duration_sec?: number | null;
  } | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface MergeValidationResult {
  valid: boolean;
  errors: MergeError[];
  warnings: MergeWarning[];
}

export interface MergeError {
  code: string;
  message: string;
  segment_index?: number;
}

export interface MergeWarning {
  code: string;
  message: string;
  segment_index?: number;
}

const BOUNDARY_DRIFT_TOLERANCE_SEC = 0.5;
const FINAL_DURATION_TOLERANCE_SEC = 2.0;
const TARGET_FPS = 30;
const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;


/**
 * Checks if media metadata is complete. Fail-closed: null fields = incomplete.
 */
function isMetadataComplete(meta: SegmentMedia["media_metadata"]): boolean {
  if (!meta) return false;
  return (
    meta.codec != null &&
    meta.fps != null &&
    meta.width != null &&
    meta.height != null &&
    meta.sample_rate != null &&
    meta.duration_sec != null
  );
}

/**
 * Validate merge integrity for a set of render segments.
 */
export function validateMergeIntegrity(
  segments: SegmentMedia[],
  masterAudioDurationSec: number
): MergeValidationResult {
  const errors: MergeError[] = [];
  const warnings: MergeWarning[] = [];

  // 1. Empty segment guard
  if (!segments || segments.length === 0) {
    errors.push({ code: "EMPTY_SEGMENTS", message: "No render segments provided" });
    return { valid: false, errors, warnings };
  }

  // 2. Sequence continuity check
  const sorted = [...segments].sort((a, b) => a.segment_index - b.segment_index);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].segment_index !== i) {
      errors.push({
        code: "SEQUENCE_GAP",
        message: `Expected segment_index ${i}, found ${sorted[i].segment_index}`,
        segment_index: sorted[i].segment_index,
      });
    }
  }

  // 3. Completed-state check
  for (const seg of sorted) {
    if (seg.status !== "completed") {
      errors.push({
        code: "INCOMPLETE_SEGMENT",
        message: `Segment ${seg.segment_index} has status "${seg.status}", expected "completed"`,
        segment_index: seg.segment_index,
      });
    }

    if (!seg.output_asset_url) {
      errors.push({
        code: "MISSING_OUTPUT",
        message: `Segment ${seg.segment_index} has no output asset URL`,
        segment_index: seg.segment_index,
      });
    }
  }

  // 4. Complete metadata check (fail-closed)
  for (const seg of sorted) {
    if (!isMetadataComplete(seg.media_metadata)) {
      errors.push({
        code: "INCOMPLETE_METADATA",
        message: `Segment ${seg.segment_index} has incomplete media metadata — merge blocked`,
        segment_index: seg.segment_index,
      });
    }
  }

  // If we already have errors, skip expensive checks
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // 5. 4-point media match: codec, fps, dimensions, sample_rate
  const reference = sorted[0].media_metadata!;
  for (let i = 1; i < sorted.length; i++) {
    const meta = sorted[i].media_metadata!;

    if (meta.codec !== reference.codec) {
      errors.push({
        code: "CODEC_MISMATCH",
        message: `Segment ${i} codec "${meta.codec}" differs from reference "${reference.codec}"`,
        segment_index: i,
      });
    }

    if (meta.fps !== reference.fps) {
      warnings.push({
        code: "FPS_MISMATCH",
        message: `Segment ${i} fps ${meta.fps} differs from reference ${reference.fps}`,
        segment_index: i,
      });
    }

    if (meta.width !== reference.width || meta.height !== reference.height) {
      errors.push({
        code: "DIMENSION_MISMATCH",
        message: `Segment ${i} dimensions ${meta.width}x${meta.height} differ from ${reference.width}x${reference.height}`,
        segment_index: i,
      });
    }

    if (meta.sample_rate !== reference.sample_rate) {
      warnings.push({
        code: "SAMPLE_RATE_MISMATCH",
        message: `Segment ${i} sample_rate ${meta.sample_rate} differs from reference ${reference.sample_rate}`,
        segment_index: i,
      });
    }
  }

  // 5b. Assembly-target conformance (fps / resolution) — warn so the UI can
  // offer a one-click normalize before the user spends a merge credit on a
  // clip that compose will silently scale or duplicate frames on.
  for (const seg of sorted) {
    const meta = seg.media_metadata!;
    if (meta.fps != null && meta.fps !== TARGET_FPS) {
      warnings.push({
        code: "FPS_OFF_TARGET",
        message: `Segment ${seg.segment_index} is ${meta.fps}fps — assembly targets ${TARGET_FPS}fps; normalize to avoid judder.`,
        segment_index: seg.segment_index,
      });
    }
    if (
      meta.width != null && meta.height != null &&
      (meta.width !== TARGET_WIDTH || meta.height !== TARGET_HEIGHT)
    ) {
      warnings.push({
        code: "RESOLUTION_OFF_TARGET",
        message: `Segment ${seg.segment_index} is ${meta.width}x${meta.height} — assembly targets ${TARGET_WIDTH}x${TARGET_HEIGHT}; will be scaled/padded.`,
        segment_index: seg.segment_index,
      });
    }
  }

  // 6. Boundary drift tolerance
  // Check that segment durations sum up reasonably (no large gaps)
  let totalSegDuration = 0;
  for (let i = 0; i < sorted.length; i++) {
    const dur = sorted[i].media_metadata!.duration_sec!;
    totalSegDuration += dur;

    // Check for zero-duration segments
    if (dur <= 0) {
      errors.push({
        code: "ZERO_DURATION",
        message: `Segment ${i} has duration ${dur}s`,
        segment_index: i,
      });
    }
  }


  // 7. Final duration vs master audio tolerance
  const durationDrift = Math.abs(totalSegDuration - masterAudioDurationSec);
  if (durationDrift > FINAL_DURATION_TOLERANCE_SEC) {
    errors.push({
      code: "DURATION_DRIFT",
      message: `Total segment duration (${totalSegDuration.toFixed(2)}s) differs from master audio (${masterAudioDurationSec.toFixed(2)}s) by ${durationDrift.toFixed(2)}s (tolerance: ${FINAL_DURATION_TOLERANCE_SEC}s)`,
    });
  } else if (durationDrift > BOUNDARY_DRIFT_TOLERANCE_SEC) {
    warnings.push({
      code: "DURATION_DRIFT_WARN",
      message: `Total segment duration drifts ${durationDrift.toFixed(2)}s from master audio`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Log structure for merge operations.
 */
export interface MergeLog {
  timestamp: string;
  event: "MERGE_BLOCKED" | "WORKER_INVOKED" | "WORKER_INVOCATION_FAILED" | "MERGE_COMPLETE";
  details: string;
  errors?: MergeError[];
  warnings?: MergeWarning[];
}

export function createMergeLog(
  event: MergeLog["event"],
  details: string,
  validation?: MergeValidationResult
): MergeLog {
  return {
    timestamp: new Date().toISOString(),
    event,
    details,
    errors: validation?.errors,
    warnings: validation?.warnings,
  };
}
