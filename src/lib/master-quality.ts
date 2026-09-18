/**
 * One quality policy for generation, browser rendering, assembly, and export.
 *
 * 1080p/30 is the default master because WAN scene renders are native 1080p.
 * Upscaling those inputs earlier would add cost and extra compression without
 * recovering detail. A 4K final master remains available as a delivery option.
 */

export const MASTER_OUTPUT_RESOLUTIONS = [
  { value: "1280x720", label: "720p (HD)", width: 1280, height: 720 },
  { value: "1920x1080", label: "1080p (Full HD · source native)", width: 1920, height: 1080 },
  { value: "2560x1440", label: "1440p (2K delivery)", width: 2560, height: 1440 },
  { value: "3840x2160", label: "2160p (4K delivery)", width: 3840, height: 2160 },
] as const;

export const MASTER_OUTPUT_FPS = [
  { value: "24", label: "24 fps (Cinema)" },
  { value: "25", label: "25 fps (PAL)" },
  { value: "30", label: "30 fps (Source native)" },
  { value: "60", label: "60 fps (Smooth delivery)" },
] as const;

export const MASTER_QUALITY_PROFILE = {
  generation: {
    provider: "wan-25",
    quality: "hd",
    aspectRatio: "16:9",
  },
  sync: {
    provider: "sync-v2",
    mode: "cut_off",
  },
  assembly: {
    resolution: "1920x1080",
    width: 1920,
    height: 1080,
    fps: 30,
    videoCrf: 16,
    audioSampleRate: 48_000,
    audioBitrate: 320_000,
    targetLufs: -14,
    truePeakDb: -1.5,
  },
} as const;

export type MasterReadyVideoQuality = "hd" | "upscaled";

export function isMasterReadyVideoQuality(
  quality: string | null | undefined,
): quality is MasterReadyVideoQuality {
  return quality === "hd" || quality === "upscaled";
}

/** MediaRecorder bitrate hint sized for high-detail music-video material. */
export function getMasterRecordingBitrates(width: number, height: number, fps: number) {
  const pixelsPerSecond = Math.max(1, width * height * fps);
  const baselinePixelsPerSecond = 1920 * 1080 * 30;
  const scaled = 16_000_000 * (pixelsPerSecond / baselinePixelsPerSecond);
  return {
    videoBitsPerSecond: Math.round(Math.min(48_000_000, Math.max(8_000_000, scaled))),
    audioBitsPerSecond: MASTER_QUALITY_PROFILE.assembly.audioBitrate,
  };
}

export function getResolutionDimensions(resolution: string) {
  const match = MASTER_OUTPUT_RESOLUTIONS.find((option) => option.value === resolution);
  return match
    ? { width: match.width, height: match.height }
    : {
        width: MASTER_QUALITY_PROFILE.assembly.width,
        height: MASTER_QUALITY_PROFILE.assembly.height,
      };
}
