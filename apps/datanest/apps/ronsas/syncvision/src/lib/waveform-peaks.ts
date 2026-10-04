/**
 * Audio Peak Extractor — extracts timed peak/energy data from an audio URL
 * for use in segment boundary refinement and assembly alignment.
 */

export interface AudioPeak {
  /** Time in seconds */
  time_sec: number;
  /** Normalized amplitude 0-1 */
  amplitude: number;
}

export interface WaveformPeakData {
  /** Duration of the full track in seconds */
  duration_sec: number;
  /** Sample rate used for analysis */
  sample_rate: number;
  /** RMS energy values at regular intervals (e.g. every 0.05s) */
  energy_profile: number[];
  /** Interval between energy samples in seconds */
  energy_interval_sec: number;
  /** Detected significant peaks (transients, beat onsets) */
  peaks: AudioPeak[];
  /** Detected silence gaps (amplitude < threshold for > 0.3s) */
  silence_gaps: Array<{ start_sec: number; end_sec: number; duration_sec: number }>;
}

const ENERGY_WINDOW_SEC = 0.05; // 50ms energy windows
const PEAK_THRESHOLD = 0.6;     // Normalized threshold for "significant" peak
const SILENCE_THRESHOLD = 0.05; // Below this = silence
const MIN_SILENCE_GAP = 0.3;    // Minimum silence gap duration in seconds

/**
 * Extract waveform peak data from an audio URL.
 * Runs the heavy decode + RMS scan in a Web Worker so the main thread
 * (and the React render loop) stays responsive on multi-minute tracks.
 * Falls back to an inline implementation if Web Workers are unavailable.
 */
export async function extractWaveformPeaks(audioUrl: string): Promise<WaveformPeakData> {
  // Prefer the off-thread worker path.
  if (typeof Worker !== "undefined") {
    try {
      return await extractViaWorker(audioUrl);
    } catch (err) {
      // Worker failed (e.g. blocked in some sandboxed envs) — fall through to inline.
      console.warn("[waveform-peaks] worker path failed, falling back to main thread:", err);
    }
  }
  return extractInline(audioUrl);
}

function extractViaWorker(audioUrl: string): Promise<WaveformPeakData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/audio-features.worker.ts", import.meta.url),
      { type: "module" }
    );
    const cleanup = () => worker.terminate();
    worker.onmessage = (e: MessageEvent<{ ok: true; data: WaveformPeakData } | { ok: false; error: string }>) => {
      cleanup();
      const msg = e.data;
      if (msg.ok === true) {
        resolve(msg.data);
      } else {
        reject(new Error(msg.error));
      }
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || "Worker error"));
    };
    worker.postMessage({
      url: audioUrl,
      energyWindowSec: ENERGY_WINDOW_SEC,
      peakThreshold: PEAK_THRESHOLD,
      silenceThreshold: SILENCE_THRESHOLD,
      minSilenceGap: MIN_SILENCE_GAP,
    });
  });
}

async function extractInline(audioUrl: string): Promise<WaveformPeakData> {
  const resp = await fetch(audioUrl);
  if (!resp.ok) throw new Error(`Failed to fetch audio: ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();

  const audioCtx = new OfflineAudioContext(1, 1, 44100);
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  const channelData = decoded.getChannelData(0);
  const sampleRate = decoded.sampleRate;
  const duration = decoded.duration;
  const samplesPerWindow = Math.floor(sampleRate * ENERGY_WINDOW_SEC);
  const windowCount = Math.floor(channelData.length / samplesPerWindow);
  const rawEnergy: number[] = [];

  for (let i = 0; i < windowCount; i++) {
    let sum = 0;
    const start = i * samplesPerWindow;
    const end = Math.min(start + samplesPerWindow, channelData.length);
    for (let j = start; j < end; j++) sum += channelData[j] * channelData[j];
    rawEnergy.push(Math.sqrt(sum / (end - start)));
  }

  const maxEnergy = Math.max(...rawEnergy, 0.0001);
  const energyProfile = rawEnergy.map((v) => v / maxEnergy);

  const peaks: AudioPeak[] = [];
  for (let i = 1; i < energyProfile.length - 1; i++) {
    if (
      energyProfile[i] > PEAK_THRESHOLD &&
      energyProfile[i] > energyProfile[i - 1] &&
      energyProfile[i] >= energyProfile[i + 1]
    ) {
      peaks.push({ time_sec: i * ENERGY_WINDOW_SEC, amplitude: energyProfile[i] });
    }
  }

  const silenceGaps: Array<{ start_sec: number; end_sec: number; duration_sec: number }> = [];
  let silenceStart: number | null = null;
  for (let i = 0; i < energyProfile.length; i++) {
    const t = i * ENERGY_WINDOW_SEC;
    if (energyProfile[i] < SILENCE_THRESHOLD) {
      if (silenceStart === null) silenceStart = t;
    } else if (silenceStart !== null) {
      const dur = t - silenceStart;
      if (dur >= MIN_SILENCE_GAP) silenceGaps.push({ start_sec: silenceStart, end_sec: t, duration_sec: dur });
      silenceStart = null;
    }
  }
  if (silenceStart !== null) {
    const endTime = energyProfile.length * ENERGY_WINDOW_SEC;
    const dur = endTime - silenceStart;
    if (dur >= MIN_SILENCE_GAP) silenceGaps.push({ start_sec: silenceStart, end_sec: endTime, duration_sec: dur });
  }

  return {
    duration_sec: duration,
    sample_rate: sampleRate,
    energy_profile: energyProfile,
    energy_interval_sec: ENERGY_WINDOW_SEC,
    peaks,
    silence_gaps: silenceGaps,
  };
}

/**
 * Refine fixed-interval segment boundaries by shifting them ±2s
 * to land on silence gaps or low-energy points.
 */
export function refineSegmentBoundaries(
  segments: Array<{ index: number; start_sec: number; end_sec: number; duration_sec: number }>,
  peakData: WaveformPeakData,
  maxShiftSec = 2.0,
  minSegmentSec = 6.0,
  maxSegmentSec = 14.0,
): Array<{ index: number; start_sec: number; end_sec: number; duration_sec: number }> {
  if (segments.length <= 1 || !peakData.energy_profile.length) return segments;

  const refined = segments.map(s => ({ ...s }));

  // For each internal boundary (not first start or last end), find the best cut point
  for (let i = 0; i < refined.length - 1; i++) {
    const boundary = refined[i].end_sec;
    const searchStart = Math.max(boundary - maxShiftSec, refined[i].start_sec + minSegmentSec);
    const searchEnd = Math.min(boundary + maxShiftSec, refined[i + 1].end_sec - minSegmentSec);

    if (searchStart >= searchEnd) continue;

    // 1. Check for silence gaps near the boundary
    let bestPoint = boundary;
    let bestScore = Infinity;

    for (const gap of peakData.silence_gaps) {
      const gapMid = (gap.start_sec + gap.end_sec) / 2;
      if (gapMid >= searchStart && gapMid <= searchEnd) {
        const distance = Math.abs(gapMid - boundary);
        // Prefer silence gaps — score by distance (lower = better) with bonus for longer gaps
        const score = distance - gap.duration_sec * 2;
        if (score < bestScore) {
          bestScore = score;
          bestPoint = gapMid;
        }
      }
    }

    // 2. If no silence gap found, find lowest energy point in the search range
    if (bestScore === Infinity) {
      const startIdx = Math.floor(searchStart / peakData.energy_interval_sec);
      const endIdx = Math.min(
        Math.ceil(searchEnd / peakData.energy_interval_sec),
        peakData.energy_profile.length - 1
      );

      let lowestEnergy = Infinity;
      for (let j = startIdx; j <= endIdx; j++) {
        const energy = peakData.energy_profile[j];
        if (energy < lowestEnergy) {
          lowestEnergy = energy;
          bestPoint = j * peakData.energy_interval_sec;
        }
      }
    }

    // Validate the new boundary doesn't make segments too short or too long
    const newDurA = bestPoint - refined[i].start_sec;
    const newDurB = refined[i + 1].end_sec - bestPoint;

    if (newDurA >= minSegmentSec && newDurA <= maxSegmentSec &&
        newDurB >= minSegmentSec && newDurB <= maxSegmentSec) {
      refined[i].end_sec = bestPoint;
      refined[i].duration_sec = newDurA;
      refined[i + 1].start_sec = bestPoint;
      refined[i + 1].duration_sec = newDurB;
    }
  }

  // Enforce perfect contiguity — close any micro-gaps between segments
  for (let i = 0; i < refined.length - 1; i++) {
    if (refined[i + 1].start_sec !== refined[i].end_sec) {
      refined[i + 1].start_sec = refined[i].end_sec;
      refined[i + 1].duration_sec = refined[i + 1].end_sec - refined[i + 1].start_sec;
    }
  }

  return refined;
}
