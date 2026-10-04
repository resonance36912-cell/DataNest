/**
 * Assembly Renderer — Canvas-based video stitcher
 *
 * Plays scene videos sequentially on a hidden canvas with transition effects,
 * overlays the master audio track (replacing scene audio), and captures
 * everything via MediaRecorder for the full audio duration.
 * Converts final output to MP4 via FFmpeg WASM.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import { getMasterRecordingBitrates, MASTER_QUALITY_PROFILE } from "@/lib/master-quality";
import { resolveLocalFfmpegCoreUrls } from "@/lib/local-media-runtime";

export interface TransitionConfig {
  type: "cut" | "crossfade" | "fade-black" | "wipe-left" | "wipe-right";
  durationSec: number;
}

export interface RenderOptions {
  scenes: SavedScene[];
  transitions: TransitionConfig[];
  masterAudioUrl: string | null;
  width?: number;
  height?: number;
  fps?: number;
  onProgress?: (phase: string, percent: number) => void;
  onSceneChange?: (sceneIdx: number, total: number) => void;
  abortSignal?: AbortSignal;
}

export interface RenderResult {
  blob: Blob;
  durationSec: number;
  width: number;
  height: number;
}

/**
 * Preload a video element. Uses crossOrigin for canvas drawing;
 * falls back to non-CORS if the initial load fails.
 */
function preloadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true; // scene audio is replaced by master track
    v.playsInline = true;
    v.preload = "auto";
    // Need crossOrigin for canvas.drawImage to work without tainting
    v.crossOrigin = "anonymous";
    v.src = url;

    const timeout = setTimeout(() => reject(new Error("Video preload timeout")), 30000);

    v.onloadeddata = () => {
      clearTimeout(timeout);
      resolve(v);
    };

    v.onerror = () => {
      // Retry without crossOrigin — may taint canvas but at least loads
      clearTimeout(timeout);
      const v2 = document.createElement("video");
      v2.muted = true;
      v2.playsInline = true;
      v2.preload = "auto";
      v2.src = url;
      const t2 = setTimeout(() => reject(new Error("Video preload timeout (no-cors)")), 30000);
      v2.onloadeddata = () => { clearTimeout(t2); resolve(v2); };
      v2.onerror = () => { clearTimeout(t2); reject(new Error(`Failed to load video: ${url.substring(0, 80)}`)); };
    };
  });
}

/** Fetch audio as ArrayBuffer — bypasses CORS restrictions on media elements */
async function fetchAudioBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
  return response.arrayBuffer();
}

/**
 * Draw a transition frame between two videos on the canvas.
 * `progress` is 0..1 where 0 = fully outgoing, 1 = fully incoming.
 */
function drawTransitionFrame(
  ctx: CanvasRenderingContext2D,
  outgoing: HTMLVideoElement,
  incoming: HTMLVideoElement,
  type: string,
  progress: number,
  w: number,
  h: number
) {
  switch (type) {
    case "crossfade":
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(outgoing, 0, 0, w, h);
      ctx.globalAlpha = progress;
      ctx.drawImage(incoming, 0, 0, w, h);
      ctx.globalAlpha = 1;
      break;

    case "fade-black":
      if (progress < 0.5) {
        ctx.globalAlpha = 1 - progress * 2;
        ctx.drawImage(outgoing, 0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "black";
        ctx.globalAlpha = progress * 2;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = (progress - 0.5) * 2;
        ctx.drawImage(incoming, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      break;

    case "wipe-left":
      ctx.drawImage(outgoing, 0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w * progress, h);
      ctx.clip();
      ctx.drawImage(incoming, 0, 0, w, h);
      ctx.restore();
      break;

    case "wipe-right":
      ctx.drawImage(outgoing, 0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(w * (1 - progress), 0, w * progress, h);
      ctx.clip();
      ctx.drawImage(incoming, 0, 0, w, h);
      ctx.restore();
      break;

    case "cut":
    default:
      ctx.drawImage(incoming, 0, 0, w, h);
      break;
  }
}

/**
 * Main render function — stitches scenes with transitions and master audio.
 * The render runs for the FULL duration of the master audio track.
 * If scenes run out before the audio ends, the last frame is held.
 * Returns a Blob of the final video.
 */
export async function renderAssembly(options: RenderOptions): Promise<RenderResult> {
  const {
    scenes,
    transitions,
    masterAudioUrl,
    width = MASTER_QUALITY_PROFILE.assembly.width,
    height = MASTER_QUALITY_PROFILE.assembly.height,
    fps = MASTER_QUALITY_PROFILE.assembly.fps,
    onProgress,
    onSceneChange,
    abortSignal,
  } = options;

  if (scenes.length === 0) throw new Error("No scenes to render");

  // Phase 1: Preload all videos
  onProgress?.("Preloading videos…", 0);
  const videos: HTMLVideoElement[] = [];
  for (let i = 0; i < scenes.length; i++) {
    if (abortSignal?.aborted) throw new Error("Render cancelled");
    onProgress?.(`Loading scene ${i + 1}/${scenes.length}…`, (i / scenes.length) * 15);
    const v = await preloadVideo(scenes[i].videoUrl);
    videos.push(v);
  }

  // Phase 2: Fetch master audio as buffer for reliable capture
  let audioContext: AudioContext | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let audioSource: AudioBufferSourceNode | null = null;
  let masterDurationSec = 0;

  // Calculate total scene duration as fallback
  const totalSceneDuration = scenes.reduce((sum, s) => sum + s.durationSec, 0);

  if (masterAudioUrl) {
    onProgress?.("Loading master audio track…", 16);
    try {
      const rawBuffer = await fetchAudioBuffer(masterAudioUrl);
      audioContext = new AudioContext();
      audioBuffer = await audioContext.decodeAudioData(rawBuffer);
      masterDurationSec = audioBuffer.duration;
      onProgress?.(`Master audio loaded: ${masterDurationSec.toFixed(1)}s`, 20);
    } catch (e) {
      console.warn("Master audio load failed, using scene duration:", e);
      audioContext = null;
      audioBuffer = null;
    }
  }

  // The render duration is the master audio length (or total scene duration if no audio)
  const renderDuration = masterDurationSec > 0 ? masterDurationSec : totalSceneDuration;

  // Phase 3: Set up canvas and recorder
  onProgress?.("Setting up renderer…", 22);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Fill initial frame black
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);

  // Create canvas stream
  const canvasStream = canvas.captureStream(fps);

  // Audio: decode buffer and route through AudioContext → MediaStream for recording
  if (audioContext && audioBuffer) {
    try {
      const destination = audioContext.createMediaStreamDestination();
      audioSource = audioContext.createBufferSource();
      audioSource.buffer = audioBuffer;
      audioSource.connect(destination);
      // Add audio tracks to canvas stream so MediaRecorder captures them
      for (const track of destination.stream.getAudioTracks()) {
        canvasStream.addTrack(track);
      }
    } catch (audioErr) {
      console.warn("AudioContext routing failed:", audioErr);
    }
  }

  // Determine codec support
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";

  const recordingBitrates = getMasterRecordingBitrates(width, height, fps);
  const recorder = new MediaRecorder(canvasStream, { mimeType, ...recordingBitrates });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Use the hardware-backed audio clock as the render timeline whenever a
  // master track is present. This prevents long exports drifting away from it.
  if (audioContext?.state === "suspended") await audioContext.resume();

  // Phase 4: Render loop — driven by audio duration
  return new Promise<RenderResult>((resolve, reject) => {
    let currentSceneIdx = 0;
    let inTransition = false;
    let transitionStartTime = 0;
    let transitionDuration = 0;
    let transitionType = "cut";
    let nextVideo: HTMLVideoElement | null = null;
    let renderStartTime = 0;
    let audioStartTime = 0;
    let allScenesFinished = false;
    let animFrameId: number;

    // Pre-compute cumulative scene start times from the audio scaffold
    // This ensures scenes are driven by the full track timing, not individual video durations
    const sceneStartTimes: number[] = [];
    let cumulative = 0;
    for (const s of scenes) {
      sceneStartTimes.push(cumulative);
      cumulative += s.durationSec;
    }

    const cleanup = () => {
      cancelAnimationFrame(animFrameId);
      videos.forEach((v) => { v.pause(); v.src = ""; });
      try { audioSource?.stop(); } catch {}
      try { audioContext?.close(); } catch {}
    };

    recorder.onstop = () => {
      const elapsed = (performance.now() - renderStartTime) / 1000;
      cleanup();
      const blob = new Blob(chunks, { type: mimeType });
      onProgress?.("Render complete!", 100);
      resolve({ blob, durationSec: elapsed, width, height });
    };

    recorder.onerror = (e) => {
      cleanup();
      reject(new Error("MediaRecorder error: " + ((e as any).error?.message || "Unknown")));
    };

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        cleanup();
        try { recorder.stop(); } catch {}
        reject(new Error("Render cancelled"));
      });
    }

    // Start recording
    recorder.start(1000);
    renderStartTime = performance.now();

    // Start master audio buffer playback
    if (audioSource) {
      audioStartTime = audioContext?.currentTime ?? 0;
      audioSource.start(0);
    }

    // Start first video (muted — master audio replaces scene audio)
    const firstVideo = videos[0];
    firstVideo.muted = true;
    firstVideo.currentTime = 0;
    firstVideo.play().catch(() => {});
    onSceneChange?.(0, scenes.length);

    const drawFrame = () => {
      if (abortSignal?.aborted) return;

      const now = performance.now();
      const elapsedSec = audioSource && audioContext
        ? Math.max(0, audioContext.currentTime - audioStartTime)
        : (now - renderStartTime) / 1000;
      const progress = Math.min(100, (elapsedSec / Math.max(renderDuration, 1)) * 100);
      onProgress?.(
        allScenesFinished
          ? `Holding last frame… ${elapsedSec.toFixed(0)}s / ${renderDuration.toFixed(0)}s`
          : `Rendering scene ${currentSceneIdx + 1}/${scenes.length}… ${elapsedSec.toFixed(0)}s / ${renderDuration.toFixed(0)}s`,
        25 + progress * 0.7
      );

      // Check if we've reached the full audio duration — stop rendering
      if (elapsedSec >= renderDuration) {
        setTimeout(() => {
          try { recorder.stop(); } catch {}
          try { audioSource?.stop(); } catch {}
        }, 300);
        return;
      }

      if (allScenesFinished) {
        // All scenes played — hold the last frame (already on canvas)
        animFrameId = requestAnimationFrame(drawFrame);
        return;
      }

      if (inTransition && nextVideo) {
        const transElapsed = (now - transitionStartTime) / 1000;
        const transProgress = Math.min(1, transElapsed / Math.max(transitionDuration, 0.05));

        try {
          drawTransitionFrame(ctx, videos[currentSceneIdx], nextVideo, transitionType, transProgress, width, height);
        } catch {
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, width, height);
        }

        if (transProgress >= 1) {
          videos[currentSceneIdx].pause();
          currentSceneIdx++;
          inTransition = false;
          nextVideo = null;
          onSceneChange?.(currentSceneIdx, scenes.length);
          // Seek the new current video to match elapsed time within its segment
          const v = videos[currentSceneIdx];
          if (v) {
            const sceneElapsed = elapsedSec - sceneStartTimes[currentSceneIdx];
            if (sceneElapsed > 0 && sceneElapsed < v.duration) {
              v.currentTime = sceneElapsed;
            }
          }
        }
      } else {
        const v = videos[currentSceneIdx];

        // Draw current video frame
        if (v && v.readyState >= 2) {
          try {
            ctx.drawImage(v, 0, 0, width, height);
          } catch {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, width, height);
          }
        }

        // Use scaffold timing to determine when to switch scenes (not video.ended)
        const sceneEndTime = sceneStartTimes[currentSceneIdx] + scenes[currentSceneIdx].durationSec;
        const timeLeftInScene = sceneEndTime - elapsedSec;
        const nextIdx = currentSceneIdx + 1;

        if (nextIdx < scenes.length && timeLeftInScene <= 0.05) {
          // Time to switch — start transition
          const trans = transitions[currentSceneIdx] || { type: "cut", durationSec: 0 };
          if (trans.type === "cut") {
            // Immediate cut
            videos[currentSceneIdx].pause();
            currentSceneIdx = nextIdx;
            const nv = videos[nextIdx];
            nv.muted = true;
            nv.currentTime = 0;
            nv.play().catch(() => {});
            onSceneChange?.(nextIdx, scenes.length);
          } else {
            inTransition = true;
            transitionStartTime = now;
            transitionDuration = trans.durationSec;
            transitionType = trans.type;
            nextVideo = videos[nextIdx];
            nextVideo.muted = true;
            nextVideo.currentTime = 0;
            nextVideo.play().catch(() => {});
          }
        } else if (nextIdx >= scenes.length && timeLeftInScene <= 0) {
          // All scenes finished — hold last frame until audio ends
          allScenesFinished = true;
          if (!audioBuffer || masterDurationSec <= 0) {
            setTimeout(() => {
              try { recorder.stop(); } catch {};
            }, 500);
            return;
          }
        }

        // If video ended early but scaffold says scene isn't over yet, loop/hold last frame
        if (v && v.ended && !allScenesFinished && timeLeftInScene > 0.1) {
          // Restart video to fill the scaffold duration (loop within the segment)
          v.currentTime = 0;
          v.play().catch(() => {});
        }
      }

      animFrameId = requestAnimationFrame(drawFrame);
    };

    animFrameId = requestAnimationFrame(drawFrame);
  });
}

/**
 * Convert a WebM blob to MP4 using FFmpeg WASM.
 */
export async function convertToMp4(
  webmBlob: Blob,
  onProgress?: (phase: string, percent: number) => void,
  options?: { fps?: number; normalizeAudio?: boolean },
): Promise<Blob> {
  onProgress?.("Loading MP4 converter…", 0);

  const ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.("Converting to MP4…", Math.round(progress * 100));
  });

  // Sovereign-local v0.1: remote FFmpeg core is intentionally not loaded.
  if (import.meta.env.VITE_SOVEREIGN_LOCAL === "1") { throw new Error("Local FFmpeg core is not vendored in Sync Vision sovereign-local v0.1. Export/assembly rendering remains disabled until the local media engine phase."); }

  // FFmpeg is bundled with the sovereign-local build.
  await ffmpeg.load(resolveLocalFfmpegCoreUrls());

  onProgress?.("Converting to MP4…", 5);

  // Write input file
  const webmData = await fetchFile(webmBlob);
  await ffmpeg.writeFile("input.webm", webmData);

  // Convert: WebM → MP4 (H.264 + AAC)
  const audioArgs = options?.normalizeAudio
    ? ["-af", `loudnorm=I=${MASTER_QUALITY_PROFILE.assembly.targetLufs}:TP=${MASTER_QUALITY_PROFILE.assembly.truePeakDb}:LRA=11,aresample=${MASTER_QUALITY_PROFILE.assembly.audioSampleRate}`]
    : ["-ar", String(MASTER_QUALITY_PROFILE.assembly.audioSampleRate)];
  await ffmpeg.exec([
    "-i", "input.webm",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", String(MASTER_QUALITY_PROFILE.assembly.videoCrf),
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-r", String(options?.fps ?? MASTER_QUALITY_PROFILE.assembly.fps),
    "-c:a", "aac",
    "-b:a", "320k",
    ...audioArgs,
    "-movflags", "+faststart",
    "output.mp4",
  ]);

  // Read output
  const mp4Data = await ffmpeg.readFile("output.mp4") as unknown as ArrayBuffer;
  const mp4Blob = new Blob([mp4Data], { type: "video/mp4" });

  // Cleanup
  await ffmpeg.deleteFile("input.webm");
  await ffmpeg.deleteFile("output.mp4");
  ffmpeg.terminate();

  onProgress?.("MP4 conversion complete!", 100);
  return mp4Blob;
}
