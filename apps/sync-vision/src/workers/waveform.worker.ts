/**
 * Web Worker — extracts waveform RMS bars from an audio/video URL.
 * Runs off the main thread to avoid blocking UI during decode.
 */

interface WaveformRequest {
  url: string;
  barCount: number;
}

interface WaveformResponse {
  bars: number[];
}

self.onmessage = async (e: MessageEvent<WaveformRequest>) => {
  const { url, barCount } = e.data;

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    const buf = await resp.arrayBuffer();

    // OfflineAudioContext works in Workers
    const audioCtx = new OfflineAudioContext(1, 1, 44100);
    const decoded = await audioCtx.decodeAudioData(buf);

    const channelData = decoded.getChannelData(0);
    const blockSize = Math.floor(channelData.length / barCount);
    const rms: number[] = [];

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const start = i * blockSize;
      const end = Math.min(start + blockSize, channelData.length);
      for (let j = start; j < end; j++) {
        sum += channelData[j] * channelData[j];
      }
      rms.push(Math.sqrt(sum / blockSize));
    }

    const maxRms = Math.max(...rms, 0.0001);
    const normalized = rms.map((v) => v / maxRms);

    self.postMessage({ bars: normalized } satisfies WaveformResponse);
  } catch {
    // Send empty bars on failure — component handles gracefully
    self.postMessage({ bars: [] } satisfies WaveformResponse);
  }
};
