// Lightweight client-side ring buffer of autosave timings.
// Written by saveProjectAsync, read by the admin perf dashboard.
// Stored in localStorage so it survives page reloads on the same device.

const KEY = "cs_autosave_metrics_v1";
const MAX = 200;

export interface AutosaveSample {
  ts: number;     // epoch ms
  ms: number;     // round-trip duration
  ok: boolean;    // success or failure
  op: "insert" | "update";
}

type Listener = () => void;
const listeners = new Set<Listener>();

const safeRead = (): AutosaveSample[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AutosaveSample[]) : [];
  } catch {
    return [];
  }
};

const safeWrite = (list: AutosaveSample[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* quota — ignore */
  }
};

export const recordAutosave = (sample: AutosaveSample) => {
  const list = safeRead();
  list.push(sample);
  safeWrite(list);
  listeners.forEach((l) => l());
};

export const getAutosaveSamples = (): AutosaveSample[] => safeRead();

export const clearAutosaveSamples = () => {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
};

export const subscribeAutosave = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export interface AutosaveStats {
  count: number;
  failures: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
  lastTs: number | null;
}

export const summarize = (samples: AutosaveSample[]): AutosaveStats => {
  if (samples.length === 0) {
    return { count: 0, failures: 0, p50: 0, p95: 0, max: 0, mean: 0, lastTs: null };
  }
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: samples.length,
    failures: samples.filter((s) => !s.ok).length,
    p50: Math.round(pct(0.5)),
    p95: Math.round(pct(0.95)),
    max: Math.round(sorted[sorted.length - 1]),
    mean: Math.round(sum / sorted.length),
    lastTs: samples[samples.length - 1].ts,
  };
};
