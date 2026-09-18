// Tighter downscale to keep upload base64 payloads small (~80–150 KB) so the
// poster model isn't slowed by a multi-MB hero image attachment. 1024px on
// the long edge is still plenty of detail for gpt-image-2 to render faithfully.
const MAX_DIM = 1024;
const JPEG_QUALITY = 0.8;

const downscaleImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const videoFrameToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.remove();
    };

    const captureFrame = () => {
      try {
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        const scale = Math.min(1, MAX_DIM / Math.max(vw, vh));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vw * scale);
        canvas.height = Math.round(vh * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create canvas context");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error("Failed to capture video frame"));
      }
    };

    video.addEventListener("loadeddata", () => {
      const targetTime = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(Math.max(video.duration * 0.15, 0.1), Math.max(video.duration - 0.1, 0.1))
        : 0.1;

      if (video.currentTime === targetTime) {
        captureFrame();
      } else {
        video.currentTime = targetTime;
      }
    });

    video.addEventListener("seeked", captureFrame, { once: true });
    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("Failed to read video preview frame"));
    }, { once: true });

    video.src = objectUrl;
    video.load();
  });

// Cache encoded visual references so the same File never gets decoded twice
// (e.g. Studio.handleGenerate + PreviewPanel both need it).
const visualRefCache = new WeakMap<File, Promise<string | null>>();

export const fileToVisualReference = (file: File): Promise<string | null> => {
  const cached = visualRefCache.get(file);
  if (cached) return cached;
  const p = (async () => {
    if (file.type.startsWith("image/")) return downscaleImage(file);
    if (file.type.startsWith("video/")) return videoFrameToBase64(file);
    return null;
  })();
  visualRefCache.set(file, p);
  return p;
};

export const getSourceDisplayName = (file: File | null | undefined, fallback?: string) =>
  file?.name.replace(/\.[^.]+$/, "") || fallback || "Source product";
