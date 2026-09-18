/**
 * Assembly preflight gate.
 *
 * Probes each scene clip's intrinsic dimensions (via a hidden <video>
 * metadata load) and compares to the assembly target (1920×1080 @ 30fps,
 * 16:9). When mismatches exceed thresholds the gate blocks the merge and
 * returns actionable fix steps the UI can render.
 *
 * fps cannot be reliably probed in the browser, so the gate only enforces
 * resolution + aspect-ratio thresholds client-side. Server-side fps
 * conformance is handled by the auto-normalize pass and merge-integrity.
 */

import { MASTER_QUALITY_PROFILE } from "@/lib/master-quality";

export const TARGET_WIDTH = MASTER_QUALITY_PROFILE.assembly.width;
export const TARGET_HEIGHT = MASTER_QUALITY_PROFILE.assembly.height;
export const TARGET_FPS = MASTER_QUALITY_PROFILE.assembly.fps;
export const TARGET_ASPECT = TARGET_WIDTH / TARGET_HEIGHT; // 1.777…

/** Aspect ratios farther than this from 16:9 cannot be saved by letterbox. */
export const ASPECT_TOLERANCE = 0.05; // ±5%
/** Block when this share of clips are off-resolution (and we can't probe one). */
export const OFF_RESOLUTION_SHARE_BLOCK = 0.25;

export interface ClipProbe {
  index: number;          // 0-based clip index
  sceneNumber?: number;   // 1-based label for the UI
  url: string;
  width: number | null;
  height: number | null;
  aspect: number | null;
  probeError?: string;
}

export interface PreflightIssue {
  code:
    | "PROBE_FAILED"
    | "RESOLUTION_OFF_TARGET"
    | "ASPECT_OUT_OF_RANGE";
  sceneNumber: number;
  message: string;
}

export interface PreflightFix {
  /** Stable id so the UI can key list items. */
  id: string;
  /** Short human label. */
  title: string;
  /** One-line explanation. */
  detail: string;
}

export interface PreflightResult {
  blocked: boolean;
  probes: ClipProbe[];
  issues: PreflightIssue[];
  fixes: PreflightFix[];
  /** Concise summary suitable for a toast title. */
  summary: string;
}

/** Load video metadata in the browser and return intrinsic dimensions. */
function probeOne(url: string, index: number, sceneNumber: number): Promise<ClipProbe> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.crossOrigin = "anonymous";

    let done = false;
    const finish = (patch: Partial<ClipProbe>) => {
      if (done) return;
      done = true;
      video.src = "";
      video.removeAttribute("src");
      video.load();
      resolve({
        index,
        sceneNumber,
        url,
        width: null,
        height: null,
        aspect: null,
        ...patch,
      });
    };

    const timeout = window.setTimeout(
      () => finish({ probeError: "metadata load timed out" }),
      8000,
    );

    video.addEventListener("loadedmetadata", () => {
      window.clearTimeout(timeout);
      const w = video.videoWidth || null;
      const h = video.videoHeight || null;
      finish({
        width: w,
        height: h,
        aspect: w && h ? w / h : null,
      });
    });
    video.addEventListener("error", () => {
      window.clearTimeout(timeout);
      finish({ probeError: "video element error" });
    });

    video.src = url;
  });
}

export async function probeAssemblyClips(
  urls: string[],
  sceneNumbers?: number[],
): Promise<ClipProbe[]> {
  return Promise.all(
    urls.map((u, i) => probeOne(u, i, sceneNumbers?.[i] ?? i + 1)),
  );
}

/**
 * Evaluate probe results against thresholds and assemble a gate verdict.
 * Pure function — easy to unit-test, no DOM access.
 */
export function evaluatePreflight(probes: ClipProbe[]): PreflightResult {
  const issues: PreflightIssue[] = [];
  const offResScenes: number[] = [];
  const offAspectScenes: number[] = [];
  const failedScenes: number[] = [];

  for (const p of probes) {
    if (p.probeError || p.width == null || p.height == null) {
      failedScenes.push(p.sceneNumber!);
      issues.push({
        code: "PROBE_FAILED",
        sceneNumber: p.sceneNumber!,
        message: `Scene ${p.sceneNumber}: could not read clip metadata (${p.probeError || "unknown"}).`,
      });
      continue;
    }
    if (p.width !== TARGET_WIDTH || p.height !== TARGET_HEIGHT) {
      offResScenes.push(p.sceneNumber!);
      issues.push({
        code: "RESOLUTION_OFF_TARGET",
        sceneNumber: p.sceneNumber!,
        message: `Scene ${p.sceneNumber}: ${p.width}×${p.height} (target ${TARGET_WIDTH}×${TARGET_HEIGHT}).`,
      });
    }
    if (p.aspect != null) {
      const drift = Math.abs(p.aspect - TARGET_ASPECT) / TARGET_ASPECT;
      if (drift > ASPECT_TOLERANCE) {
        offAspectScenes.push(p.sceneNumber!);
        issues.push({
          code: "ASPECT_OUT_OF_RANGE",
          sceneNumber: p.sceneNumber!,
          message: `Scene ${p.sceneNumber}: aspect ${p.aspect.toFixed(3)} (target 16:9 ≈ ${TARGET_ASPECT.toFixed(3)}, drift ${(drift * 100).toFixed(1)}%).`,
        });
      }
    }
  }

  const total = probes.length;
  const offResShare = total ? offResScenes.length / total : 0;

  // Block when:
  //  - any probe failed (can't trust the merge), OR
  //  - any clip's aspect is outside ±5% (letterbox can't fix bad framing), OR
  //  - more than OFF_RESOLUTION_SHARE_BLOCK of clips are off-resolution.
  const blocked =
    failedScenes.length > 0 ||
    offAspectScenes.length > 0 ||
    offResShare > OFF_RESOLUTION_SHARE_BLOCK;

  const fixes: PreflightFix[] = [];
  if (offResScenes.length > 0 || offAspectScenes.length > 0) {
    fixes.push({
      id: "normalize",
      title: "Run normalize on the affected scenes",
      detail:
        `Open Storyboard → scene ${[...new Set([...offResScenes, ...offAspectScenes])].join(", ")} → Normalize. ` +
        `This re-encodes to ${TARGET_WIDTH}×${TARGET_HEIGHT} @ ${TARGET_FPS}fps and re-balances loudness.`,
    });
  }
  if (offAspectScenes.length > 0) {
    fixes.push({
      id: "regen-aspect",
      title: "Re-render off-aspect scenes at 16:9",
      detail:
        `Scenes ${offAspectScenes.join(", ")} were rendered at a non-16:9 aspect. ` +
        `Letterbox padding can't recover the original framing — re-render them at ${TARGET_WIDTH}×${TARGET_HEIGHT}.`,
    });
  }
  if (failedScenes.length > 0) {
    fixes.push({
      id: "reupload",
      title: "Re-resolve clip URLs",
      detail:
        `Scenes ${failedScenes.join(", ")} could not be probed. ` +
        `Refresh the storyboard (URLs may have expired) or re-render the scene.`,
    });
  }
  if (blocked && offResScenes.length > 0 && offAspectScenes.length === 0 && failedScenes.length === 0) {
    fixes.push({
      id: "override",
      title: "Override and merge anyway",
      detail:
        `Only resolution differs and aspect is 16:9, so the auto-normalize pass can fix it. ` +
        `Use the Override button if you've already accepted the quality trade-off.`,
    });
  }

  let summary: string;
  if (!blocked) {
    summary = `All ${total} clips conform to ${TARGET_WIDTH}×${TARGET_HEIGHT} 16:9.`;
  } else if (failedScenes.length) {
    summary = `Cannot read metadata for ${failedScenes.length} clip(s) — merge blocked.`;
  } else if (offAspectScenes.length) {
    summary = `${offAspectScenes.length} clip(s) are not 16:9 — merge blocked.`;
  } else {
    summary = `${offResScenes.length}/${total} clips off-resolution — merge blocked.`;
  }

  return { blocked, probes, issues, fixes, summary };
}

/** Convenience: probe + evaluate in one call. */
export async function runAssemblyPreflight(
  urls: string[],
  sceneNumbers?: number[],
): Promise<PreflightResult> {
  const probes = await probeAssemblyClips(urls, sceneNumbers);
  return evaluatePreflight(probes);
}
