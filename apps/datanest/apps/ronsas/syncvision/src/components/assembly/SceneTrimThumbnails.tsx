import { useEffect, useRef, useState } from "react";
import { Loader2, ImageOff } from "lucide-react";
import { getCachedThumbs, setCachedThumbs, thumbCacheKey, type ThumbTriplet } from "@/lib/thumbnail-cache";

interface SceneTrimThumbnailsProps {
  videoUrl: string;
  /** Effective in-clip seconds — what the merge will actually keep. */
  startSec: number;
  /** Effective kept window in seconds (durationSec - tailCutSec). */
  keptSec: number;
  /** Probed source duration; used to flag end-frame as past EOF (tail bleed risk). */
  sourceDurationSec?: number | null;
}

type FrameState = { url: string | null; error: boolean };

/**
 * Captures three frames (start / middle / end) of the kept window so the user
 * can visually confirm a trim — particularly the END frame, which is where any
 * remaining tail bleed (frozen frame, audio cut, splice artifact) would appear.
 */
export default function SceneTrimThumbnails({
  videoUrl,
  startSec,
  keptSec,
  sourceDurationSec,
}: SceneTrimThumbnailsProps) {
  // Seed from cache synchronously so re-mounts / re-opens of the trim panel
  // don't flash a loading state for trims we've already computed.
  const initialKey = thumbCacheKey(videoUrl, startSec, keptSec, sourceDurationSec);
  const initialCached = getCachedThumbs(initialKey);
  const [frames, setFrames] = useState<ThumbTriplet>(
    initialCached ?? [
      { url: null, error: false },
      { url: null, error: false },
      { url: null, error: false },
    ]
  );
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // End frame after EOF means the merge will fall back to the last available
  // frame — surface that as a visual warning since it can cause a freeze.
  const endSec = startSec + keptSec;
  const endsPastSource =
    typeof sourceDurationSec === "number" && sourceDurationSec > 0
      ? endSec > sourceDurationSec + 0.05
      : false;

  useEffect(() => {
    let cancelled = false;
    if (!videoUrl || keptSec <= 0) return;

    const key = thumbCacheKey(videoUrl, startSec, keptSec, sourceDurationSec);
    const cached = getCachedThumbs(key);
    if (cached) {
      // Reuse — no decode, no seek, no JPEG encode.
      setFrames(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    const v = document.createElement("video");
    videoRef.current = v;
    v.preload = "auto";
    v.muted = true;
    v.crossOrigin = "anonymous";
    v.playsInline = true;
    v.src = videoUrl;

    const targets = [
      Math.max(0.01, startSec + 0.05),
      Math.max(0.01, startSec + keptSec / 2),
      // Clamp the end-frame query to just before the source EOF so the seek
      // resolves; the EOF warning is reported via `endsPastSource`.
      Math.max(0.01, Math.min(startSec + keptSec - 0.05, (sourceDurationSec ?? Infinity) - 0.05)),
    ];

    const captureAt = (t: number): Promise<FrameState> =>
      new Promise((resolve) => {
        const onSeeked = () => {
          v.removeEventListener("seeked", onSeeked);
          try {
            const w = Math.min(160, v.videoWidth || 160);
            const h = v.videoHeight && v.videoWidth ? Math.round((w * v.videoHeight) / v.videoWidth) : 90;
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve({ url: null, error: true });
            ctx.drawImage(v, 0, 0, w, h);
            resolve({ url: canvas.toDataURL("image/jpeg", 0.7), error: false });
          } catch {
            resolve({ url: null, error: true });
          }
        };
        v.addEventListener("seeked", onSeeked);
        try {
          v.currentTime = t;
        } catch {
          v.removeEventListener("seeked", onSeeked);
          resolve({ url: null, error: true });
        }
      });

    const run = async () => {
      await new Promise<void>((resolve) => {
        const onReady = () => {
          v.removeEventListener("loadeddata", onReady);
          resolve();
        };
        v.addEventListener("loadeddata", onReady);
        v.addEventListener("error", () => resolve(), { once: true });
      });
      if (cancelled) return;

      const out: FrameState[] = [];
      for (const t of targets) {
        if (cancelled) return;
        out.push(await captureAt(t));
      }
      if (cancelled) return;
      const triplet: ThumbTriplet = [out[0], out[1], out[2]];
      // Only cache when all three captured successfully — partial failures
      // would otherwise stick around and prevent retry on the next mount.
      if (triplet.every((f) => f.url && !f.error)) {
        setCachedThumbs(key, triplet);
      }
      setFrames(triplet);
      setLoading(false);
    };

    run().catch(() => setLoading(false));

    return () => {
      cancelled = true;
      try {
        v.removeAttribute("src");
        v.load();
      } catch { /* noop */ }
      videoRef.current = null;
    };
  }, [videoUrl, startSec, keptSec, sourceDurationSec]);

  const labels = [
    { text: "Start", sec: startSec },
    { text: "Middle", sec: startSec + keptSec / 2 },
    { text: "End", sec: endSec },
  ];

  return (
    <div className="grid grid-cols-3 gap-1.5 mt-2">
      {labels.map((lbl, i) => {
        const f = frames[i];
        const isEnd = i === 2;
        const warn = isEnd && endsPastSource;
        return (
          <div key={lbl.text} className="space-y-0.5">
            <div
              className={`relative aspect-video rounded overflow-hidden border ${
                warn ? "border-destructive ring-1 ring-destructive/40" : "border-border"
              } bg-muted/40 flex items-center justify-center`}
            >
              {loading && !f.url && !f.error && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              {!loading && !f.url && f.error && (
                <ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              {f.url && <img src={f.url} alt={`${lbl.text} frame`} className="w-full h-full object-cover" />}
              <span className="absolute top-0.5 left-0.5 px-1 text-[8px] font-medium bg-black/70 text-white rounded-sm leading-tight">
                {lbl.text}
              </span>
              <span className="absolute bottom-0.5 right-0.5 px-1 text-[8px] bg-black/70 text-white rounded-sm leading-tight">
                {lbl.sec.toFixed(2)}s
              </span>
            </div>
            {warn && (
              <p className="text-[9px] text-destructive font-medium leading-tight">
                Past source EOF — risk of tail bleed
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
