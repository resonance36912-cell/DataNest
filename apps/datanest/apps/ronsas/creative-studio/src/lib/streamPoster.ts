// Sovereign-local poster renderer. The hosted image-generation SSE endpoint is
// deliberately not used in this build. A deterministic SVG poster is composed
// entirely in the browser from the approved brief and returned as a data URL.
import { flushSync } from "react-dom";

export type HeartbeatInfo = { seq: number; t: number; ageMs: number; sinceUpstreamMs: number; variantIndex?: number };
export type StreamPosterEvent =
  | { type: "frame"; dataUrl: string; isFinal: boolean }
  | { type: "heartbeat"; info: HeartbeatInfo }
  | { type: "error"; message: string; status?: number };
export interface StreamPosterOptions {
  url: string;
  body: Record<string, unknown>;
  accessToken: string;
  apiKey: string;
  signal?: AbortSignal;
  onFrame: (dataUrl: string, isFinal: boolean) => void;
  onHeartbeat?: (info: HeartbeatInfo) => void;
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] ?? c));
const b64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const wrap = (text: string, max = 30) => {
  const words = text.trim().split(/\s+/); const lines: string[] = []; let line = "";
  for (const w of words) { const n = line ? `${line} ${w}` : w; if (n.length > max && line) { lines.push(line); line = w; } else line = n; }
  if (line) lines.push(line); return lines.slice(0, 4);
};

function posterDataUrl(body: Record<string, unknown>, variantIndex: number) {
  const headline = String(body.headline ?? "Create with Resonance");
  const sub = String(body.subheadline ?? "Sovereign-local creative preview");
  const brand = String(body.brand ?? "RESONANCE");
  const cta = String(body.callToAction ?? "Discover more");
  const colors = Array.isArray(body.colorSuggestions) ? body.colorSuggestions.map(String) : [];
  const a = colors[0] || (variantIndex === 1 ? "#6d28d9" : "#0f766e");
  const b = colors[1] || (variantIndex === 1 ? "#db2777" : "#2563eb");
  const lines = wrap(headline);
  const headlineSvg = lines.map((l, i) => `<text x="80" y="${250 + i * 78}" font-size="64" font-weight="800" fill="white" font-family="Arial, sans-serif">${esc(l)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${esc(a)}"/><stop offset="1" stop-color="${esc(b)}"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="45"/></filter></defs>
  <rect width="1200" height="675" fill="#090914"/><circle cx="1040" cy="100" r="330" fill="${esc(a)}" opacity=".45" filter="url(#blur)"/><circle cx="120" cy="600" r="320" fill="${esc(b)}" opacity=".35" filter="url(#blur)"/>
  <rect x="48" y="48" width="1104" height="579" rx="32" fill="url(#g)" opacity=".18" stroke="white" stroke-opacity=".18"/>
  <text x="80" y="115" font-size="24" font-weight="700" letter-spacing="5" fill="white" opacity=".9" font-family="Arial, sans-serif">${esc(brand.toUpperCase())}</text>
  ${headlineSvg}
  <text x="80" y="${Math.min(570, 285 + lines.length * 78)}" font-size="27" fill="white" opacity=".78" font-family="Arial, sans-serif">${esc(sub.slice(0, 78))}</text>
  <rect x="80" y="575" width="260" height="58" rx="29" fill="white"/><text x="112" y="613" font-size="21" font-weight="700" fill="#111827" font-family="Arial, sans-serif">${esc(cta.slice(0, 24))}</text>
  <text x="920" y="614" font-size="16" fill="white" opacity=".58" font-family="Arial, sans-serif">SOVEREIGN LOCAL · V${variantIndex}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${b64(svg)}`;
}

export async function streamPoster(opts: StreamPosterOptions): Promise<{ ok: boolean; finalDataUrl?: string; error?: string; status?: number }> {
  if (opts.signal?.aborted) return { ok: false, error: "Canceled", status: 499 };
  opts.onHeartbeat?.({ seq: 1, t: Date.now(), ageMs: 0, sinceUpstreamMs: 0, variantIndex: Number(opts.body.variantIndex ?? 1) });
  await new Promise((r) => setTimeout(r, 180));
  if (opts.signal?.aborted) return { ok: false, error: "Canceled", status: 499 };
  const dataUrl = posterDataUrl(opts.body, Number(opts.body.variantIndex ?? 1));
  flushSync(() => opts.onFrame(dataUrl, true));
  return { ok: true, finalDataUrl: dataUrl };
}
