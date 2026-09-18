/**
 * Audio Features Worker — runs the full waveform analysis (energy profile,
 * peaks, silence gaps) off the main thread. Mirrors the algorithm in
 * src/lib/waveform-peaks.ts so the main thread never blocks on
 * decodeAudioData + the large RMS loop for multi-minute tracks.
 */

interface FeatureRequest {
  url: string;
  energyWindowSec: number;
  peakThreshold: number;
  silenceThreshold: number;
  minSilenceGap: number;
}

interface AudioPeak {
  time_sec: number;
  amplitude: number;
}

interface WaveformPeakData {
  duration_sec: number;
  sample_rate: number;
  energy_profile: number[];
  energy_interval_sec: number;
  peaks: AudioPeak[];
  silence_gaps: Array<{ start_sec: number; end_sec: number; duration_sec: number }>;
}

interface FeatureResponse {
  ok: true;
  data: WaveformPeakData;
}

interface FeatureError {
  ok: false;
  error: string;
}

self.onmessage = async (e: MessageEvent<FeatureRequest>) => {
  const { url, energyWindowSec, peakThreshold, silenceThreshold, minSilenceGap } = e.data;

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    const buf = await resp.arrayBuffer();

    // OfflineAudioContext works in workers
    const audioCtx = new OfflineAudioContext(1, 1, 44100);
    const decoded = await audioCtx.decodeAudioData(buf);

    const channelData = decoded.getChannelData(0);
    const sampleRate = decoded.sampleRate;
    const duration = decoded.duration;
    const samplesPerWindow = Math.floor(sampleRate * energyWindowSec);
    const windowCount = Math.floor(channelData.length / samplesPerWindow);

    // RMS energy per window
    const rawEnergy = new Float32Array(windowCount);
    let maxEnergy = 0.0001;
    for (let i = 0; i < windowCount; i++) {
      let sum = 0;
      const start = i * samplesPerWindow;
      const end = start + samplesPerWindow;
      for (let j = start; j < end; j++) {
        sum += channelData[j] * channelData[j];
      }
      const rms = Math.sqrt(sum / samplesPerWindow);
      rawEnergy[i] = rms;
      if (rms > maxEnergy) maxEnergy = rms;
    }

    // Normalize + detect peaks + silence gaps in a single pass
    const energyProfile = new Array<number>(windowCount);
    const peaks: AudioPeak[] = [];
    const silenceGaps: Array<{ start_sec: number; end_sec: number; duration_sec: number }> = [];
    let silenceStart: number | null = null;

    for (let i = 0; i < windowCount; i++) {
      const v = rawEnergy[i] / maxEnergy;
      energyProfile[i] = v;
      const t = i * energyWindowSec;

      if (v < silenceThreshold) {
        if (silenceStart === null) silenceStart = t;
      } else if (silenceStart !== null) {
        const dur = t - silenceStart;
        if (dur >= minSilenceGap) {
          silenceGaps.push({ start_sec: silenceStart, end_sec: t, duration_sec: dur });
        }
        silenceStart = null;
      }
    }

    // Peak detection — needs neighbour lookups, so a second pass
    for (let i = 1; i < windowCount - 1; i++) {
      const v = energyProfile[i];
      if (v > peakThreshold && v > energyProfile[i - 1] && v >= energyProfile[i + 1]) {
        peaks.push({ time_sec: i * energyWindowSec, amplitude: v });
      }
    }

    if (silenceStart !== null) {
      const endTime = windowCount * energyWindowSec;
      const dur = endTime - silenceStart;
      if (dur >= minSilenceGap) {
        silenceGaps.push({ start_sec: silenceStart, end_sec: endTime, duration_sec: dur });
      }
    }

    const data: WaveformPeakData = {
      duration_sec: duration,
      sample_rate: sampleRate,
      energy_profile: energyProfile,
      energy_interval_sec: energyWindowSec,
      peaks,
      silence_gaps: silenceGaps,
    };

    self.postMessage({ ok: true, data } satisfies FeatureResponse);
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown worker error",
    } satisfies FeatureError);
  }
};
