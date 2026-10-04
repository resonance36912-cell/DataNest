/**
 * Shared audio utilities — WAV encoding, time conversion, audio slicing.
 */

/** Convert "M:SS" or "H:MM:SS" to seconds */
export function timeToSeconds(t: string): number {
  const parts = t.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

/** Convert seconds to "M:SS" */
export function secondsToTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Encode an AudioBuffer to a WAV Blob */
export function encodeWav(buffer: AudioBuffer): Blob {
  const bps = 2;
  const blockAlign = buffer.numberOfChannels * bps;
  const dataLen = buffer.length * blockAlign;
  const ab = new ArrayBuffer(44 + dataLen);
  const v = new DataView(ab);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  v.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, buffer.numberOfChannels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, dataLen, true);

  const chData = Array.from({ length: buffer.numberOfChannels }, (_, ch) => buffer.getChannelData(ch));
  let off = 44;
  for (let f = 0; f < buffer.length; f++) {
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const s = Math.min(Math.max(chData[ch][f], -1), 1);
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += bps;
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}

/** Slice an AudioBuffer between startSec and endSec */
export function sliceAudioBuffer(decoded: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const startFrame = Math.max(0, Math.floor(startSec * decoded.sampleRate));
  const endFrame = Math.min(decoded.length, Math.ceil(endSec * decoded.sampleRate));
  const frameCount = Math.max(1, endFrame - startFrame);

  const clipped = new AudioBuffer({
    length: frameCount,
    numberOfChannels: decoded.numberOfChannels,
    sampleRate: decoded.sampleRate,
  });
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    clipped.copyToChannel(decoded.getChannelData(ch).slice(startFrame, endFrame), ch, 0);
  }
  return clipped;
}

/** Slice audio from a source (File or URL) and return a WAV Blob */
export async function sliceAudioToWav(
  source: File | string,
  startSec: number,
  endSec: number,
): Promise<Blob> {
  const audioContext = new AudioContext();
  try {
    let rawArrayBuffer: ArrayBuffer;
    if (source instanceof File) {
      rawArrayBuffer = await source.arrayBuffer();
    } else {
      const resp = await fetch(source);
      if (!resp.ok) throw new Error(`Failed to fetch audio: ${resp.status}`);
      rawArrayBuffer = await resp.arrayBuffer();
    }
    const decoded = await audioContext.decodeAudioData(rawArrayBuffer.slice(0));
    const clipped = sliceAudioBuffer(decoded, startSec, endSec);
    return encodeWav(clipped);
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

export interface AudioPeak {
  timeSec: number;
  amplitude: number; // 0..1 normalized
}

/**
 * Detect significant amplitude peaks in audio data.
 * Uses a simple onset-detection approach: compute RMS energy in windows,
 * then find local maxima above a threshold that are spaced apart.
 */
export function detectPeaks(
  channelData: Float32Array,
  sampleRate: number,
  options?: { windowSec?: number; minGapSec?: number; threshold?: number }
): AudioPeak[] {
  const windowSec = options?.windowSec ?? 0.05;
  const minGapSec = options?.minGapSec ?? 1.0;
  const threshold = options?.threshold ?? 0.35;

  const windowSize = Math.floor(sampleRate * windowSec);
  const hopSize = Math.floor(windowSize / 2);
  const energyCurve: { time: number; rms: number }[] = [];

  for (let i = 0; i + windowSize <= channelData.length; i += hopSize) {
    let sum = 0;
    for (let j = i; j < i + windowSize; j++) {
      sum += channelData[j] * channelData[j];
    }
    const rms = Math.sqrt(sum / windowSize);
    energyCurve.push({ time: i / sampleRate, rms });
  }

  if (energyCurve.length === 0) return [];

  // Normalize energy
  const maxRms = Math.max(...energyCurve.map(e => e.rms), 0.0001);
  const normalized = energyCurve.map(e => ({ ...e, rms: e.rms / maxRms }));

  // Find peaks: local maxima above threshold with minimum gap
  const peaks: AudioPeak[] = [];
  for (let i = 1; i < normalized.length - 1; i++) {
    const cur = normalized[i];
    if (
      cur.rms > threshold &&
      cur.rms >= normalized[i - 1].rms &&
      cur.rms >= normalized[i + 1].rms
    ) {
      if (peaks.length === 0 || cur.time - peaks[peaks.length - 1].timeSec >= minGapSec) {
        peaks.push({ timeSec: cur.time, amplitude: cur.rms });
      }
    }
  }

  return peaks;
}

/**
 * Convert linear amplitude to decibels (dBFS).
 * Returns values in range roughly -60..0 for typical audio.
 */
export function amplitudeToDb(amplitude: number): number {
  if (amplitude <= 0) return -60;
  return Math.max(-60, 20 * Math.log10(amplitude));
}

/**
 * Given detected peaks and a scene count, compute scene boundaries
 * that align to the most prominent peaks in the audio.
 * When persisted silence gaps are provided, boundaries prefer landing
 * in silence for cleaner transitions.
 */
export function alignScenesToPeaks(
  peaks: AudioPeak[],
  sceneCount: number,
  audioDuration: number,
  silenceGaps?: Array<{ start_sec: number; end_sec: number; duration_sec: number }>
): { startSec: number; endSec: number }[] {
  if (sceneCount <= 0) return [];
  if (sceneCount === 1) {
    return [{ startSec: 0, endSec: audioDuration }];
  }

  // Start with even divisions
  const evenDur = audioDuration / sceneCount;
  const rawBoundaries = Array.from({ length: sceneCount - 1 }, (_, i) => (i + 1) * evenDur);

  // Refine each boundary: prefer silence gaps, then low-peak areas
  const refinedSplits = rawBoundaries.map((boundary) => {
    const searchRadius = evenDur * 0.25; // ±25% of segment length
    const minBound = boundary - searchRadius;
    const maxBound = boundary + searchRadius;

    // 1. Check for silence gaps near this boundary
    if (silenceGaps && silenceGaps.length > 0) {
      let bestGap: { mid: number; score: number } | null = null;
      for (const gap of silenceGaps) {
        const gapMid = (gap.start_sec + gap.end_sec) / 2;
        if (gapMid >= minBound && gapMid <= maxBound) {
          const distance = Math.abs(gapMid - boundary);
          const score = distance - gap.duration_sec * 3; // strongly prefer longer gaps
          if (!bestGap || score < bestGap.score) {
            bestGap = { mid: gapMid, score };
          }
        }
      }
      if (bestGap) return bestGap.mid;
    }

    // 2. Fallback: find a low point between peaks (avoid cutting on a peak)
    const nearPeaks = peaks.filter(p => p.timeSec >= minBound && p.timeSec <= maxBound);
    if (nearPeaks.length >= 2) {
      // Find the largest gap between consecutive peaks
      const sorted = nearPeaks.sort((a, b) => a.timeSec - b.timeSec);
      let bestMid = boundary;
      let bestGapSize = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        const gapSize = sorted[i + 1].timeSec - sorted[i].timeSec;
        if (gapSize > bestGapSize) {
          bestGapSize = gapSize;
          bestMid = (sorted[i].timeSec + sorted[i + 1].timeSec) / 2;
        }
      }
      return bestMid;
    }

    // 3. Use strongest peak as boundary (original behavior)
    if (peaks.length > 0) {
      const closest = peaks
        .filter(p => p.timeSec >= minBound && p.timeSec <= maxBound)
        .sort((a, b) => b.amplitude - a.amplitude)[0];
      if (closest) return closest.timeSec;
    }

    return boundary;
  });

  // Ensure splits are monotonically increasing and within bounds
  const sortedSplits = refinedSplits.sort((a, b) => a - b);
  const boundaries = [0, ...sortedSplits, audioDuration];
  const segments: { startSec: number; endSec: number }[] = [];
  for (let i = 0; i < sceneCount; i++) {
    segments.push({
      startSec: boundaries[i],
      endSec: boundaries[i + 1],
    });
  }

  return segments;
}

/**
 * Calculate the ideal overlap/bleed duration for scene video generation.
 * Uses BPM to align to half-beat boundaries for musical coherence.
 * Falls back to a sensible default when BPM is unavailable.
 *
 * @returns overlapSec — the number of seconds to extend each segment on both sides
 */
export function calculateOverlapSec(bpm?: number | null): number {
  if (bpm && bpm > 0) {
    const beatDuration = 60 / bpm; // seconds per beat
    // Use half a beat as overlap — enough for smooth crossfade without wasting generation time
    const halfBeat = beatDuration / 2;
    // Clamp between 0.3s and 1.5s for practical limits
    return clamp(halfBeat, 0.3, 1.5);
  }
  // Default: 0.5s overlap when BPM unknown
  return 0.5;
}

/**
 * Compute extended segment boundaries with overlap bleed for video generation.
 * Each segment is extended by `overlapSec` on both ends (clamped to audio bounds).
 * During merge, the bleed is trimmed to produce seamless transitions.
 */
export function extendSegmentWithOverlap(
  startSec: number,
  endSec: number,
  audioDuration: number,
  overlapSec: number
): { extStartSec: number; extEndSec: number; leadBleedSec: number; tailBleedSec: number } {
  const extStartSec = Math.max(0, startSec - overlapSec);
  const extEndSec = Math.min(audioDuration, endSec + overlapSec);
  return {
    extStartSec,
    extEndSec,
    leadBleedSec: startSec - extStartSec,
    tailBleedSec: extEndSec - endSec,
  };
}
