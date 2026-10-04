/**
 * Sample frames from a video File at evenly-spaced timestamps and return
 * jpeg data URLs. Used by the burned-in lyrics OCR flow.
 */
export interface SampledFrame {
  t: number;
  dataUrl: string;
}

export async function sampleVideoFrames(
  file: File,
  opts: { count?: number; maxWidth?: number; quality?: number } = {},
): Promise<SampledFrame[]> {
  const { count = 12, maxWidth = 720, quality = 0.78 } = opts;
  if (!file.type.startsWith("video/")) {
    throw new Error("Burned-in OCR requires the original video file (MP4).");
  }
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load video for frame sampling."));
  });

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(url);
    throw new Error("Video duration unavailable.");
  }

  // Sample inside [5%, 95%] to skip intros/end cards.
  const start = duration * 0.05;
  const end = duration * 0.95;
  const step = (end - start) / Math.max(count - 1, 1);
  const timestamps = Array.from({ length: count }, (_, i) => start + step * i);

  const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
  const w = Math.max(2, Math.round((video.videoWidth || maxWidth) * scale));
  const h = Math.max(2, Math.round((video.videoHeight || (maxWidth * 9) / 16) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("Canvas 2d context unavailable.");
  }

  const out: SampledFrame[] = [];
  for (const t of timestamps) {
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    out.push({ t, dataUrl });
  }
  URL.revokeObjectURL(url);
  return out;
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      // Tiny delay lets the frame paint reliably across browsers
      setTimeout(resolve, 30);
    };
    video.addEventListener("seeked", onSeeked);
    try {
      video.currentTime = Math.min(Math.max(t, 0), Math.max(video.duration - 0.05, 0));
    } catch {
      resolve();
    }
  });
}
