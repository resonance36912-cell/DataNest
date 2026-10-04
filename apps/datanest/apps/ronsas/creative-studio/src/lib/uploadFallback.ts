/**
 * Upload fallback: when Firecrawl returns empty images/logo/colors for a URL,
 * derive a usable hero image + product gallery + simple color palette from the
 * primary uploaded file (image only — videos are skipped here).
 *
 * Returns null if no fallback can be produced (e.g. non-image, decode failed).
 */

export type UploadFallback = {
  dataUrl: string;       // base64 data URL safe to use as <img src> and as a visual reference
  colors: string[];      // up to 6 hex colors sampled from the image
};

const MAX_DIM = 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = src;
  });
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/**
 * Sample the image into a small grid and quantize to a handful of dominant
 * colors. This is intentionally lightweight — no median-cut / k-means — so it
 * runs in a few ms on the main thread without dragging in a library.
 */
function samplePalette(img: HTMLImageElement, max = 6): string[] {
  const w = Math.min(MAX_DIM, img.naturalWidth || img.width);
  const h = Math.min(MAX_DIM, img.naturalHeight || img.height);
  if (!w || !h) return [];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return []; // tainted canvas — shouldn't happen for data URLs
  }

  // Bucket each pixel into a coarse 4-bit-per-channel grid → 4096 buckets max.
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  const step = 4 * Math.max(1, Math.floor((w * h) / 20_000)); // ~20k samples
  for (let i = 0; i < data.length; i += step) {
    const a = data[i + 3];
    if (a < 200) continue; // skip transparent
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Skip near-white and near-black so the palette reflects brand color.
    const lum = (r + g + b) / 3;
    if (lum > 245 || lum < 12) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key);
    if (cur) {
      cur.r += r; cur.g += g; cur.b += b; cur.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map(({ r, g, b, n }) => `#${toHex(r / n)}${toHex(g / n)}${toHex(b / n)}`.toUpperCase());
}

export async function buildUploadFallback(file: File | null): Promise<UploadFallback | null> {
  if (!file || !file.type.startsWith("image/")) return null;
  try {
    const dataUrl = await fileToDataUrl(file);
    const img = await loadImage(dataUrl);
    const colors = samplePalette(img);
    return { dataUrl, colors };
  } catch {
    return null;
  }
}
