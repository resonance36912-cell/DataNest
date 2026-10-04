/**
 * Client-side image compression and validation.
 *
 * Goals:
 * - Resize the longest edge down to MAX_EDGE_PX (default 2048).
 * - Re-encode JPEGs at quality 0.85, target ≤ TARGET_BYTES (1.5 MB).
 * - Skip work for tiny images (< MIN_BYTES) and for PNGs with possible alpha
 *   (we'd lose transparency converting to JPEG).
 * - Provide an instant validateImageFile() guard for type + size before any
 *   network call.
 */
export interface CompressOptions {
  maxEdgePx?: number;
  quality?: number;
  targetBytes?: number;
  minBytes?: number;
}

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
  skipped: boolean;
  reason?: string;
}

const DEFAULT_MAX_EDGE = 2048;
const DEFAULT_QUALITY = 0.85;
const DEFAULT_TARGET_BYTES = 1.5 * 1024 * 1024;
const DEFAULT_MIN_BYTES = 500 * 1024;

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20 MB hard ceiling

export interface ValidationError {
  ok: false;
  reason: string;
}
export interface ValidationOk {
  ok: true;
}
export type ValidationResult = ValidationOk | ValidationError;

export function validateImageFile(file: File | Blob, opts?: { maxBytes?: number }): ValidationResult {
  const maxBytes = opts?.maxBytes ?? MAX_INPUT_BYTES;
  const type = file.type || "";
  if (!type.startsWith("image/")) {
    return { ok: false, reason: "File is not an image." };
  }
  if (!ACCEPTED_IMAGE_TYPES.has(type)) {
    return { ok: false, reason: `Unsupported image type: ${type}. Use JPG, PNG, or WebP.` };
  }
  if (file.size > maxBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return { ok: false, reason: `Image is ${mb} MB; max ${maxMb} MB.` };
  }
  return { ok: true };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

export async function compressImage(
  input: File | Blob,
  opts: CompressOptions = {}
): Promise<CompressResult> {
  const maxEdge = opts.maxEdgePx ?? DEFAULT_MAX_EDGE;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const targetBytes = opts.targetBytes ?? DEFAULT_TARGET_BYTES;
  const minBytes = opts.minBytes ?? DEFAULT_MIN_BYTES;

  const originalBytes = input.size;
  const type = input.type || "";

  // Skip tiny images
  if (originalBytes <= minBytes) {
    return {
      blob: input,
      width: 0,
      height: 0,
      originalBytes,
      compressedBytes: originalBytes,
      skipped: true,
      reason: "below-min-size",
    };
  }

  // Preserve PNG transparency — don't transcode to JPEG.
  // We still resize PNGs if they're huge.
  const isPng = type === "image/png";

  const objectUrl = URL.createObjectURL(input);
  try {
    const img = await loadImage(objectUrl);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longest > maxEdge ? maxEdge / longest : 1;

    // Already small enough AND under target bytes → skip
    if (scale === 1 && originalBytes <= targetBytes) {
      return {
        blob: input,
        width: img.naturalWidth,
        height: img.naturalHeight,
        originalBytes,
        compressedBytes: originalBytes,
        skipped: true,
        reason: "within-budget",
      };
    }

    const targetW = Math.round(img.naturalWidth * scale);
    const targetH = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return {
        blob: input,
        width: img.naturalWidth,
        height: img.naturalHeight,
        originalBytes,
        compressedBytes: originalBytes,
        skipped: true,
        reason: "no-canvas-2d",
      };
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const outType = isPng ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outType, isPng ? undefined : quality);
    });

    if (!blob) {
      return {
        blob: input,
        width: targetW,
        height: targetH,
        originalBytes,
        compressedBytes: originalBytes,
        skipped: true,
        reason: "toblob-null",
      };
    }

    // If compression somehow produced a larger file, keep the original
    const finalBlob = blob.size < originalBytes ? blob : input;
    return {
      blob: finalBlob,
      width: targetW,
      height: targetH,
      originalBytes,
      compressedBytes: finalBlob.size,
      skipped: finalBlob === input,
      reason: finalBlob === input ? "compression-not-smaller" : undefined,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
