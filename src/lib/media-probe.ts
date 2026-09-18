/**
 * Browser-side "ffprobe" for the merge debug bundle.
 *
 * Runs entirely against Web APIs — no ffmpeg/ffprobe binary — so results are
 * best-effort. What's actually reliable per API:
 *
 *  - HTMLMediaElement: duration, videoWidth/videoHeight, resolved URL.
 *  - AudioContext.decodeAudioData: sample_rate, channels, decoded duration.
 *    (requires downloading the full audio — skipped when > MAX_AUDIO_DECODE_BYTES.)
 *  - HTMLVideoElement.requestVideoFrameCallback: sample ~1s to estimate FPS.
 *    Fallback: null when the browser doesn't expose rVFC.
 */
import type { SavedScene } from "@/components/assembly/SceneTimeline";

const MAX_AUDIO_DECODE_BYTES = 60 * 1024 * 1024; // 60 MB safety cap
const VIDEO_PROBE_TIMEOUT_MS = 10_000;
const FPS_SAMPLE_MS = 1000;

export interface AudioProbe {
  url: string | null;
  duration_sec: number | null;
  sample_rate_hz: number | null;
  channels: number | null;
  decoded_length_samples: number | null;
  content_length_bytes: number | null;
  content_type: string | null;
  error: string | null;
}

export interface VideoProbe {
  scene_number: number;
  tracking_id: string | null;
  url: string | null;
  duration_sec: number | null;
  width_px: number | null;
  height_px: number | null;
  frame_rate_fps_estimate: number | null;
  frame_rate_note: string | null;
  error: string | null;
}

export interface MediaProbeReport {
  probed_at: string;
  tool: string;
  notes: string[];
  audio: AudioProbe | null;
  videos: VideoProbe[];
}

async function headInfo(url: string): Promise<{ length: number | null; type: string | null }> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    if (!r.ok) return { length: null, type: null };
    const len = r.headers.get("content-length");
    return { length: len ? Number(len) : null, type: r.headers.get("content-type") };
  } catch {
    return { length: null, type: null };
  }
}

async function probeAudio(url: string | null): Promise<AudioProbe | null> {
  if (!url) return null;
  const out: AudioProbe = {
    url,
    duration_sec: null,
    sample_rate_hz: null,
    channels: null,
    decoded_length_samples: null,
    content_length_bytes: null,
    content_type: null,
    error: null,
  };
  const head = await headInfo(url);
  out.content_length_bytes = head.length;
  out.content_type = head.type;

  // Fast path: HTMLAudioElement metadata for duration only.
  try {
    out.duration_sec = await new Promise<number | null>((resolve) => {
      const el = document.createElement("audio");
      el.preload = "metadata";
      el.crossOrigin = "anonymous";
      const cleanup = () => {
        el.src = "";
        el.remove();
      };
      const to = setTimeout(() => { cleanup(); resolve(null); }, VIDEO_PROBE_TIMEOUT_MS);
      el.onloadedmetadata = () => {
        clearTimeout(to);
        const d = Number.isFinite(el.duration) ? el.duration : null;
        cleanup();
        resolve(d);
      };
      el.onerror = () => { clearTimeout(to); cleanup(); resolve(null); };
      el.src = url;
    });
  } catch {
    /* ignore */
  }

  // Full decode for sample_rate/channels — capped to avoid huge downloads.
  if (head.length !== null && head.length > MAX_AUDIO_DECODE_BYTES) {
    out.error = `Skipped decode: ${head.length} bytes exceeds ${MAX_AUDIO_DECODE_BYTES}.`;
    return out;
  }
  try {
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error("AudioContext unavailable");
    const ctx = new Ctx();
    try {
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      out.sample_rate_hz = decoded.sampleRate;
      out.channels = decoded.numberOfChannels;
      out.decoded_length_samples = decoded.length;
      if (out.duration_sec === null) out.duration_sec = decoded.duration;
    } finally {
      if (typeof ctx.close === "function") await ctx.close();
    }
  } catch (e) {
    out.error = `Audio decode failed: ${e instanceof Error ? e.message : "unknown"}`;
  }
  return out;
}

async function estimateVideoFps(el: HTMLVideoElement): Promise<{ fps: number | null; note: string | null }> {
  type VideoWithRVFC = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
    cancelVideoFrameCallback?: (id: number) => void;
  };
  const v = el as VideoWithRVFC;
  if (typeof v.requestVideoFrameCallback !== "function") {
    return { fps: null, note: "requestVideoFrameCallback unsupported — FPS not measured." };
  }
  return new Promise((resolve) => {
    let frames = 0;
    let firstMediaTime: number | null = null;
    let lastMediaTime: number | null = null;
    const start = performance.now();
    const step = (_now: number, meta: { mediaTime: number }) => {
      frames++;
      if (firstMediaTime === null) firstMediaTime = meta.mediaTime;
      lastMediaTime = meta.mediaTime;
      if (performance.now() - start >= FPS_SAMPLE_MS) {
        v.pause();
        const span = lastMediaTime !== null && firstMediaTime !== null ? lastMediaTime - firstMediaTime : 0;
        if (frames < 2 || span <= 0) {
          resolve({ fps: null, note: "Not enough frames captured to estimate FPS." });
        } else {
          resolve({ fps: Math.round(((frames - 1) / span) * 100) / 100, note: null });
        }
        return;
      }
      v.requestVideoFrameCallback?.(step);
    };
    v.requestVideoFrameCallback?.(step);
    v.play().catch(() => resolve({ fps: null, note: "Video autoplay blocked — FPS not measured." }));
    setTimeout(() => resolve({ fps: null, note: "FPS sampling timed out." }), VIDEO_PROBE_TIMEOUT_MS);
  });
}

async function probeVideo(scene: SavedScene): Promise<VideoProbe> {
  const url = scene.videoUrl ?? null;
  const trackingId = (scene as unknown as { trackingId?: string | null }).trackingId ?? null;
  const out: VideoProbe = {
    scene_number: scene.sceneNumber,
    tracking_id: trackingId,
    url,
    duration_sec: null,
    width_px: null,
    height_px: null,
    frame_rate_fps_estimate: null,
    frame_rate_note: null,
    error: null,
  };
  if (!url) {
    out.error = "No video URL for scene.";
    return out;
  }
  const el = document.createElement("video");
  el.preload = "metadata";
  el.muted = true;
  el.playsInline = true;
  el.crossOrigin = "anonymous";
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.width = "1px";
  el.style.height = "1px";
  document.body.appendChild(el);

  try {
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("metadata timeout")), VIDEO_PROBE_TIMEOUT_MS);
      el.onloadedmetadata = () => { clearTimeout(to); resolve(); };
      el.onerror = () => { clearTimeout(to); reject(new Error("video load error")); };
      el.src = url;
    });
    out.duration_sec = Number.isFinite(el.duration) ? el.duration : null;
    out.width_px = el.videoWidth || null;
    out.height_px = el.videoHeight || null;
    const fps = await estimateVideoFps(el);
    out.frame_rate_fps_estimate = fps.fps;
    out.frame_rate_note = fps.note;
  } catch (e) {
    out.error = e instanceof Error ? e.message : "probe failed";
  } finally {
    el.pause();
    el.removeAttribute("src");
    el.load();
    el.remove();
  }
  return out;
}

export async function probeMergeMedia(args: {
  audioUrl: string | null;
  scenes: SavedScene[];
}): Promise<MediaProbeReport> {
  const notes: string[] = [
    "Browser-based probe: no ffmpeg/ffprobe binary is available.",
    "sample_rate_hz and channels come from Web Audio decoding of the full track (skipped over 60 MB).",
    "frame_rate_fps_estimate uses requestVideoFrameCallback sampling and is approximate.",
  ];
  const audio = await probeAudio(args.audioUrl);
  // Probe scene videos sequentially so we don't spawn N concurrent decoders.
  const videos: VideoProbe[] = [];
  for (const s of args.scenes) {
    videos.push(await probeVideo(s));
  }
  return {
    probed_at: new Date().toISOString(),
    tool: "browser-media-probe",
    notes,
    audio,
    videos,
  };
}
