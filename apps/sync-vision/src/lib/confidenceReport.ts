import jsPDF from "jspdf";
import type { TranscriptionResult, VerificationResult, AudioSegment } from "@/contexts/ProjectContext";

export interface ConfidenceReportInput {
  projectName?: string | null;
  fileName?: string | null;
  transcription: TranscriptionResult;
  verification: VerificationResult | null;
  /** When true, prefer the user's edited values (lyrics/bpm/instruments) over the original engine output. */
  useEdited?: boolean;
  editedLyrics?: string | null;
  editedBpm?: number | string | null;
  editedInstruments?: string[] | null;
  /** Audio/scene segments (with start/end timestamps) to include in the report. */
  segments?: AudioSegment[] | null;
  /** Verification stage pass status keyed as `pass_1`, `pass_2`, ... */
  passStatus?: Record<string, string> | null;
  /** Optional branding block applied to the PDF report. */
  branding?: ReportBranding | null;
}

export interface ReportBranding {
  /** Overrides project name shown in the PDF header. */
  projectName?: string | null;
  /** Diagonal watermark text drawn faintly across every page. */
  watermarkText?: string | null;
  /** Logo as a data URL (PNG/JPEG). Rendered top-right of the first page. */
  logoDataUrl?: string | null;
  /** Watermark opacity 0.02–0.5 (default 0.08). */
  watermarkOpacity?: number | null;
  /** Watermark font size in pt, 24–160 (default 72). */
  watermarkFontSize?: number | null;
  /** Watermark rotation in degrees, -90 to 90 (default 30). */
  watermarkRotation?: number | null;
  /** Logo square size in pt, 20–160 (default 44). */
  logoSize?: number | null;
  /** Padding (pt) inset from page top-right edge, 0–80 (default 0 — keeps original behaviour). */
  logoPadding?: number | null;
  /** Page size for the rendered PDF. Logo top-right inset is identical in absolute pt across both. */
  pageSize?: "a4" | "letter" | null;
}

export const WATERMARK_DEFAULTS = {
  opacity: 0.08,
  fontSize: 72,
  rotation: 30,
} as const;

export const LOGO_DEFAULTS = {
  size: 44,
  padding: 0,
} as const;

export const PAGE_SIZE_DEFAULT: "a4" | "letter" = "a4";

/** Page dimensions in pt, matching jsPDF's built-in A4/Letter formats. */
export const PAGE_DIMENSIONS = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const;

/** Page margin (pt) used by the PDF renderer; logo is anchored from this inset. */
export const PDF_PAGE_MARGIN = 40;
/** Vertical nudge applied to the logo so its top edge lifts slightly into the header gutter. */
export const PDF_LOGO_Y_OFFSET = -6;

/**
 * Bumped whenever the saved-report schema gains layout-affecting fields. The download
 * pipeline uses this marker (or infers it from the snapshot shape when missing) to
 * explain exactly which legacy version triggered the layout-defaults backfill.
 *
 * History:
 *  - v1: initial schema. No layout-critical branding (logo size/padding, page size,
 *        watermark style). Re-downloads MUST inject defaults rather than borrow from
 *        the current local override.
 *  - v2: adds layout-critical branding fields. No migration needed.
 */
export const REPORT_SCHEMA_VERSION = 2 as const;
export type ReportSchemaVersion = 1 | 2;

export interface ConfidenceReportJSON {
  /** Schema marker — see REPORT_SCHEMA_VERSION. Absent on pre-v2 saved reports. */
  schema_version?: ReportSchemaVersion;
  generated_at: string;
  source: "engine" | "verified";
  project: { name: string | null; file: string | null };
  edited?: {
    lyrics: string | null;
    bpm: number | null;
    instruments: string[] | null;
    lyrics_changed: boolean;
    bpm_changed: boolean;
    instruments_changed: boolean;
  };
  summary: {
    lyrics_confidence_pct: number | null;
    bpm_confidence_pct: number | null;
    instruments_confidence_pct: number | null;
    bpm: number | null;
    word_count: number;
    word_level_available: boolean;
    word_avg_confidence_pct: number | null;
    word_low_confidence_count: number;
    word_med_confidence_count: number;
    word_high_confidence_count: number;
  };
  pass_status: Array<{ pass: string; label: string; status: string }>;
  segments: Array<{
    index: number;
    start_sec: number;
    end_sec: number;
    duration_sec: number;
    lyrics: string | null;
    word_count: number;
    avg_confidence_pct: number | null;
    low_count: number;
    med_count: number;
    high_count: number;
    tier: "high" | "med" | "low" | "unknown";
  }>;
  flagged_issues: Array<{ word: string; issue: string; suggestion?: string }>;
  words: Array<{ index: number; text: string; start_sec: number; end_sec: number; confidence_pct: number | null; tier: "high" | "med" | "low" | "unknown" }>;
  /** Branding block applied at export time so the same PDF can be reproduced later. */
  branding?: ReportBranding | null;
}

const CONF_LOW = 0.6;
const CONF_MED = 0.85;
function tierOf(c: number | null | undefined): "high" | "med" | "low" | "unknown" {
  if (c == null || Number.isNaN(c)) return "unknown";
  if (c < CONF_LOW) return "low";
  if (c < CONF_MED) return "med";
  return "high";
}
function pct(n: number | null | undefined): number | null {
  return typeof n === "number" ? Math.round(n * 100) : null;
}

export function buildConfidenceReportJSON(input: ConfidenceReportInput): ConfidenceReportJSON {
  const { projectName = null, fileName = null, transcription, verification, useEdited = false, editedLyrics = null, editedBpm = null, editedInstruments = null, segments = null, passStatus = null } = input;
  const words = transcription.words ?? [];
  let low = 0, med = 0, high = 0, sum = 0, n = 0;
  for (const w of words) {
    const c = (w as { confidence?: number }).confidence;
    const t = tierOf(c);
    if (t === "low") low++;
    else if (t === "med") med++;
    else if (t === "high") high++;
    if (typeof c === "number") { sum += c; n++; }
  }

  const editedBpmNum = editedBpm == null || editedBpm === "" ? null : Number(editedBpm);
  const finalBpm = useEdited
    ? (Number.isFinite(editedBpmNum as number) ? (editedBpmNum as number) : (verification?.bpm ?? null))
    : (verification?.bpm ?? null);
  const finalInstruments = useEdited ? (editedInstruments ?? verification?.instruments ?? null) : (verification?.instruments ?? null);
  const finalLyrics = useEdited ? (editedLyrics ?? verification?.verified_lyrics ?? null) : (verification?.verified_lyrics ?? null);

  const out: ConfidenceReportJSON = {
    schema_version: REPORT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source: useEdited ? "verified" : "engine",
    project: { name: projectName ?? null, file: fileName ?? null },
    summary: {
      // Verification confidence is already on a 0-100 scale.
      lyrics_confidence_pct: verification?.confidence_lyrics ?? null,
      bpm_confidence_pct: verification?.confidence_bpm ?? null,
      instruments_confidence_pct: verification?.confidence_instruments ?? null,
      bpm: finalBpm,
      word_count: words.length,
      word_level_available: n > 0,
      word_avg_confidence_pct: n > 0 ? Math.round((sum / n) * 100) : null,
      word_low_confidence_count: low,
      word_med_confidence_count: med,
      word_high_confidence_count: high,
    },
    pass_status: (() => {
      const labels: Record<string, string> = {
        pass_1: "Transcription",
        pass_2: "Verification",
        pass_3: "Confidence",
      };
      const ps = passStatus ?? {};
      const keys = Object.keys(labels);
      const extra = Object.keys(ps).filter(k => !keys.includes(k));
      return [...keys, ...extra].map(k => ({ pass: k, label: labels[k] ?? k, status: ps[k] ?? "pending" }));
    })(),
    segments: (segments ?? []).map((s) => {
      const inSeg = words.filter(w => w.start >= s.start_sec && w.end <= s.end_sec);
      let sLow = 0, sMed = 0, sHigh = 0, sSum = 0, sN = 0;
      for (const w of inSeg) {
        const c = (w as { confidence?: number }).confidence;
        const t = tierOf(c);
        if (t === "low") sLow++;
        else if (t === "med") sMed++;
        else if (t === "high") sHigh++;
        if (typeof c === "number") { sSum += c; sN++; }
      }
      const avg = sN > 0 ? sSum / sN : null;
      return {
        index: s.index,
        start_sec: Number(s.start_sec.toFixed(3)),
        end_sec: Number(s.end_sec.toFixed(3)),
        duration_sec: Number(s.duration_sec.toFixed(3)),
        lyrics: s.lyrics ?? null,
        word_count: inSeg.length,
        avg_confidence_pct: avg != null ? Math.round(avg * 100) : null,
        low_count: sLow,
        med_count: sMed,
        high_count: sHigh,
        tier: tierOf(avg),
      };
    }),
    flagged_issues: verification?.flagged_issues ?? [],
    words: words.map((w, i) => {
      const c = (w as { confidence?: number }).confidence;
      return {
        index: i,
        text: w.text,
        start_sec: Number(w.start.toFixed(3)),
        end_sec: Number(w.end.toFixed(3)),
        confidence_pct: pct(c),
        tier: tierOf(c),
      };
    }),
  };

  if (useEdited) {
    out.edited = {
      lyrics: finalLyrics,
      bpm: finalBpm,
      instruments: finalInstruments,
      lyrics_changed: (finalLyrics ?? "") !== (verification?.verified_lyrics ?? ""),
      bpm_changed: finalBpm !== (verification?.bpm ?? null),
      instruments_changed: JSON.stringify(finalInstruments ?? []) !== JSON.stringify(verification?.instruments ?? []),
    };
  }

  if (input.branding) {
    const b = input.branding;
    const hasAny = !!(
      b.projectName?.trim() ||
      b.watermarkText?.trim() ||
      b.logoDataUrl ||
      b.logoSize != null ||
      b.logoPadding != null ||
      b.pageSize
    );
    if (hasAny) {
      out.branding = {
        projectName: b.projectName?.trim() || null,
        watermarkText: b.watermarkText?.trim() || null,
        logoDataUrl: b.logoDataUrl ?? null,
        watermarkOpacity: b.watermarkOpacity ?? null,
        watermarkFontSize: b.watermarkFontSize ?? null,
        watermarkRotation: b.watermarkRotation ?? null,
        logoSize: b.logoSize ?? null,
        logoPadding: b.logoPadding ?? null,
        pageSize: b.pageSize ?? null,
      };
    }
  }

  return out;
}

function safeFilenameStem(input: ConfidenceReportInput): string {
  const base = input.projectName || input.fileName || "transcription";
  return base.replace(/[^\w\-]+/g, "_").slice(0, 60) || "transcription";
}

export function downloadConfidenceJSON(input: ConfidenceReportInput): string {
  const json = buildConfidenceReportJSON(input);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilenameStem(input)}_confidence${input.useEdited ? "_verified" : ""}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return a.download;
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildConfidenceCSV(input: ConfidenceReportInput): string {
  const data = buildConfidenceReportJSON(input);
  const header = ["index", "word", "start_sec", "end_sec", "duration_sec", "confidence_pct", "tier", "segment_index"];
  const rows: string[] = [header.join(",")];
  for (const w of data.words) {
    const seg = data.segments.find(s => w.start_sec >= s.start_sec && w.end_sec <= s.end_sec);
    rows.push([
      w.index + 1,
      csvEscape(w.text),
      w.start_sec.toFixed(3),
      w.end_sec.toFixed(3),
      Math.max(0, w.end_sec - w.start_sec).toFixed(3),
      w.confidence_pct ?? "",
      w.tier,
      seg ? seg.index + 1 : "",
    ].join(","));
  }
  return rows.join("\n");
}

export function downloadConfidenceCSV(input: ConfidenceReportInput): string {
  const csv = buildConfidenceCSV(input);
  // BOM so Excel detects UTF-8 correctly
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilenameStem(input)}_confidence_words${input.useEdited ? "_verified" : ""}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return a.download;
}

function detectImageFormat(dataUrl: string): "PNG" | "JPEG" | null {
  const m = /^data:image\/(png|jpeg|jpg)/i.exec(dataUrl);
  if (!m) return null;
  return m[1].toLowerCase() === "png" ? "PNG" : "JPEG";
}

function renderConfidencePDFFromData(
  data: ConfidenceReportJSON,
  branding: ReportBranding | null,
  filenameStem: string,
  useEdited: boolean,
): { doc: jsPDF; filename: string } {
  const pageFormat: "a4" | "letter" = branding?.pageSize === "letter" ? "letter" : "a4";
  const doc = new jsPDF({ unit: "pt", format: pageFormat });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = PDF_PAGE_MARGIN;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Branding logo (top-right of first page)
  let headerRightOffset = 0;
  if (branding?.logoDataUrl) {
    const fmt = detectImageFormat(branding.logoDataUrl);
    if (fmt) {
      try {
        const logoSize = Math.min(160, Math.max(20, branding.logoSize ?? LOGO_DEFAULTS.size));
        const logoPad = Math.min(80, Math.max(0, branding.logoPadding ?? LOGO_DEFAULTS.padding));
        const x = pageW - margin - logoSize - logoPad;
        const yLogo = margin + PDF_LOGO_Y_OFFSET + logoPad;
        doc.addImage(branding.logoDataUrl, fmt, x, yLogo, logoSize, logoSize, undefined, "FAST");
        headerRightOffset = logoSize + logoPad + 12;
      } catch {
        // ignore malformed image
      }
    }
  }

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const titleMaxW = pageW - margin * 2 - headerRightOffset;
  const titleLines = doc.splitTextToSize("Transcription & BPM Confidence Report", titleMaxW);
  doc.text(titleLines, margin, y);
  y += 22;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  const brandedProjectName = branding?.projectName?.trim() || data.project.name;
  doc.text(`Generated ${new Date(data.generated_at).toLocaleString()}`, margin, y);
  y += 14;
  if (brandedProjectName || data.project.file) {
    doc.text(`Project: ${brandedProjectName ?? "—"}   File: ${data.project.file ?? "—"}`, margin, y);
    y += 14;
  }
  doc.text(`Source: ${data.source === "verified" ? "Verified / edited values" : "Original engine output"}`, margin, y);
  y += 14;
  y += 6;
  doc.setTextColor(0);

  if (data.edited) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Verified / edited values", margin, y);
    y += 16;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const editedRows: Array<[string, string]> = [
      [`BPM${data.edited.bpm_changed ? " (edited)" : ""}`, data.edited.bpm != null ? String(data.edited.bpm) : "n/a"],
      [`Instruments${data.edited.instruments_changed ? " (edited)" : ""}`, (data.edited.instruments ?? []).join(", ") || "n/a"],
    ];
    for (const [label, val] of editedRows) {
      ensureSpace(14);
      doc.setTextColor(90);
      doc.text(label, margin, y);
      doc.setTextColor(0);
      const wrapped = doc.splitTextToSize(val, pageW - margin - 220);
      doc.text(wrapped, margin + 220, y);
      y += Math.max(14, wrapped.length * 12);
    }
    if (data.edited.lyrics) {
      ensureSpace(20);
      doc.setTextColor(90);
      doc.text(`Lyrics${data.edited.lyrics_changed ? " (edited)" : ""}`, margin, y);
      y += 12;
      doc.setTextColor(0);
      const lyricsLines = doc.splitTextToSize(data.edited.lyrics, pageW - margin * 2);
      for (const line of lyricsLines) {
        ensureSpace(11);
        doc.text(line, margin, y);
        y += 11;
      }
    }
    y += 8;
  }

  // Summary table
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Summary", margin, y);
  y += 16;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const rows: Array<[string, string]> = [
    ["Lyrics confidence", data.summary.lyrics_confidence_pct != null ? `${data.summary.lyrics_confidence_pct}%` : "n/a"],
    ["BPM confidence", data.summary.bpm_confidence_pct != null ? `${data.summary.bpm_confidence_pct}%` : "n/a"],
    ["Instruments confidence", data.summary.instruments_confidence_pct != null ? `${data.summary.instruments_confidence_pct}%` : "n/a"],
    ["Detected BPM", data.summary.bpm != null ? `${data.summary.bpm}` : "n/a"],
    ["Word count", `${data.summary.word_count}`],
    ["Word-level avg confidence", data.summary.word_avg_confidence_pct != null ? `${data.summary.word_avg_confidence_pct}%` : "n/a"],
    ["Words low (<60%)", `${data.summary.word_low_confidence_count}`],
    ["Words medium (60-85%)", `${data.summary.word_med_confidence_count}`],
    ["Words high (≥85%)", `${data.summary.word_high_confidence_count}`],
  ];
  for (const [label, val] of rows) {
    ensureSpace(14);
    doc.setTextColor(90);
    doc.text(label, margin, y);
    doc.setTextColor(0);
    doc.text(val, margin + 220, y);
    y += 14;
  }
  y += 8;

  // Stage pass status
  if (data.pass_status.length > 0) {
    ensureSpace(30);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Verification Stage Passes", margin, y);
    y += 16;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    for (const p of data.pass_status) {
      ensureSpace(13);
      const color: [number, number, number] =
        p.status === "complete" ? [30, 140, 70]
        : p.status === "running" ? [40, 100, 200]
        : p.status === "failed" ? [200, 40, 40]
        : [140, 140, 140];
      doc.setTextColor(90);
      doc.text(p.label, margin, y);
      doc.setTextColor(...color);
      doc.text(p.status, margin + 220, y);
      doc.setTextColor(0);
      y += 13;
    }
    y += 8;
  }

  // Segments table
  if (data.segments.length > 0) {
    ensureSpace(40);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`Scenes / Segments (${data.segments.length})`, margin, y);
    y += 16;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const cols = { idx: margin, range: margin + 35, dur: margin + 145, words: margin + 195, conf: margin + 240, tier: margin + 290, lyr: margin + 335 };
    doc.setTextColor(120);
    doc.text("#", cols.idx, y);
    doc.text("Start-End", cols.range, y);
    doc.text("Dur", cols.dur, y);
    doc.text("Words", cols.words, y);
    doc.text("Avg", cols.conf, y);
    doc.text("Tier", cols.tier, y);
    doc.text("Lyrics", cols.lyr, y);
    y += 12;
    doc.setDrawColor(220);
    doc.line(margin, y - 6, pageW - margin, y - 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    for (const s of data.segments) {
      ensureSpace(12);
      const tierColor: [number, number, number] =
        s.tier === "low" ? [200, 40, 40]
        : s.tier === "med" ? [200, 140, 0]
        : s.tier === "high" ? [30, 140, 70]
        : [120, 120, 120];
      doc.setTextColor(120);
      doc.text(String(s.index + 1), cols.idx, y);
      doc.setTextColor(0);
      doc.text(`${s.start_sec.toFixed(2)}-${s.end_sec.toFixed(2)}s`, cols.range, y);
      doc.text(`${s.duration_sec.toFixed(2)}s`, cols.dur, y);
      doc.text(String(s.word_count), cols.words, y);
      doc.text(s.avg_confidence_pct != null ? `${s.avg_confidence_pct}%` : "-", cols.conf, y);
      doc.setTextColor(...tierColor);
      doc.text(s.tier, cols.tier, y);
      doc.setTextColor(0);
      const lyr = (s.lyrics ?? "").replace(/\s+/g, " ").trim();
      const lyrTxt = lyr.length > 38 ? lyr.slice(0, 37) + "..." : (lyr || "-");
      doc.text(lyrTxt, cols.lyr, y);
      y += 12;
    }
    y += 8;
  }

  // Flagged issues
  if (data.flagged_issues.length > 0) {
    ensureSpace(30);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`Flagged Issues (${data.flagged_issues.length})`, margin, y);
    y += 16;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    for (const fi of data.flagged_issues) {
      const line = `• "${fi.word}" — ${fi.issue}${fi.suggestion ? ` → ${fi.suggestion}` : ""}`;
      const wrapped = doc.splitTextToSize(line, pageW - margin * 2);
      ensureSpace(wrapped.length * 12 + 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 12 + 2;
    }
    y += 8;
  }

  // Word-level table
  if (data.summary.word_level_available) {
    ensureSpace(40);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Word-level confidence", margin, y);
    y += 16;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const cols = { idx: margin, word: margin + 35, start: margin + 200, end: margin + 250, conf: margin + 305, tier: margin + 360 };
    doc.setTextColor(120);
    doc.text("#", cols.idx, y);
    doc.text("Word", cols.word, y);
    doc.text("Start", cols.start, y);
    doc.text("End", cols.end, y);
    doc.text("Conf", cols.conf, y);
    doc.text("Tier", cols.tier, y);
    y += 12;
    doc.setDrawColor(220);
    doc.line(margin, y - 6, pageW - margin, y - 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    for (const w of data.words) {
      ensureSpace(11);
      const tierColor: [number, number, number] =
        w.tier === "low" ? [200, 40, 40]
        : w.tier === "med" ? [200, 140, 0]
        : w.tier === "high" ? [30, 140, 70]
        : [120, 120, 120];
      doc.setTextColor(120);
      doc.text(String(w.index + 1), cols.idx, y);
      doc.setTextColor(0);
      const wordTxt = w.text.length > 28 ? w.text.slice(0, 27) + "…" : w.text;
      doc.text(wordTxt, cols.word, y);
      doc.text(w.start_sec.toFixed(2), cols.start, y);
      doc.text(w.end_sec.toFixed(2), cols.end, y);
      doc.text(w.confidence_pct != null ? `${w.confidence_pct}%` : "—", cols.conf, y);
      doc.setTextColor(...tierColor);
      doc.text(w.tier, cols.tier, y);
      doc.setTextColor(0);
      y += 11;
    }
  } else {
    ensureSpace(20);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text("Per-word confidence not available for this transcription source.", margin, y);
    doc.setTextColor(0);
  }

  // Diagonal watermark on every page (drawn last so it overlays content faintly)
  const wm = branding?.watermarkText?.trim();
  if (wm) {
    const opacity = Math.min(0.5, Math.max(0.02, branding?.watermarkOpacity ?? WATERMARK_DEFAULTS.opacity));
    const fontSize = Math.min(160, Math.max(24, branding?.watermarkFontSize ?? WATERMARK_DEFAULTS.fontSize));
    const rotation = Math.min(90, Math.max(-90, branding?.watermarkRotation ?? WATERMARK_DEFAULTS.rotation));
    const total = doc.getNumberOfPages();
    const docAny = doc as unknown as { GState?: new (o: { opacity: number }) => unknown; setGState?: (g: unknown) => void };
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      if (docAny.GState && docAny.setGState) {
        try { docAny.setGState(new docAny.GState({ opacity })); } catch { /* ignore */ }
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fontSize);
      doc.setTextColor(120);
      const text = wm.length > 60 ? wm.slice(0, 60) : wm;
      doc.text(text, pageW / 2, pageH / 2, { align: "center", angle: rotation });
      if (docAny.GState && docAny.setGState) {
        try { docAny.setGState(new docAny.GState({ opacity: 1 })); } catch { /* ignore */ }
      }
      doc.setTextColor(0);
    }
  }

  const filename = `${filenameStem}_confidence${useEdited ? "_verified" : ""}.pdf`;
  return { doc, filename };
}

function buildConfidencePDFDoc(input: ConfidenceReportInput): { doc: jsPDF; filename: string } {
  return renderConfidencePDFFromData(
    buildConfidenceReportJSON(input),
    input.branding ?? null,
    safeFilenameStem(input),
    !!input.useEdited,
  );
}

/** Render a PDF directly from a previously exported confidence-report JSON snapshot. */
export function buildConfidencePDFDocFromJSON(
  data: ConfidenceReportJSON,
  branding: ReportBranding | null,
): { doc: jsPDF; filename: string } {
  const base = (data.project.name || data.project.file || "transcription")
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 60) || "transcription";
  return renderConfidencePDFFromData(data, branding, base, data.source === "verified");
}

export function downloadConfidencePDF(input: ConfidenceReportInput): string {
  const { doc, filename } = buildConfidencePDFDoc(input);
  doc.save(filename);
  return filename;
}

function buildConfidencePDFBlob(input: ConfidenceReportInput): { blob: Blob; filename: string } {
  const { doc, filename } = buildConfidencePDFDoc(input);
  const blob = doc.output("blob") as Blob;
  return { blob, filename };
}

// ─── Save / list / delete reports backed by Supabase Storage + DB ───
import { supabase } from "@/integrations/supabase/client";

const STORAGE_BUCKET = "media-uploads";

export interface SavedConfidenceReport {
  id: string;
  user_id: string;
  project_id: string | null;
  format: "json" | "pdf" | "csv";
  file_name: string;
  storage_path: string;
  file_size_bytes: number | null;
  source: "engine" | "verified";
  summary: Record<string, unknown>;
  created_at: string;
}

function buildReportArtifact(input: ConfidenceReportInput, format: "json" | "pdf" | "csv"): { blob: Blob; filename: string; contentType: string } {
  if (format === "json") {
    const json = buildConfidenceReportJSON(input);
    return {
      blob: new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }),
      filename: `${safeFilenameStem(input)}_confidence${input.useEdited ? "_verified" : ""}.json`,
      contentType: "application/json",
    };
  }
  if (format === "csv") {
    const csv = buildConfidenceCSV(input);
    return {
      blob: new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
      filename: `${safeFilenameStem(input)}_confidence_words${input.useEdited ? "_verified" : ""}.csv`,
      contentType: "text/csv",
    };
  }
  const { blob, filename } = buildConfidencePDFBlob(input);
  return { blob, filename, contentType: "application/pdf" };
}

export async function saveConfidenceReport(
  input: ConfidenceReportInput,
  format: "json" | "pdf" | "csv",
  projectId: string | null,
): Promise<SavedConfidenceReport> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("You must be signed in to save reports.");
  const userId = userData.user.id;

  const { blob, filename, contentType } = buildReportArtifact(input, format);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = `${userId}/confidence-reports/${ts}__${filename}`;

  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, blob, { upsert: false, contentType });
  if (upErr) throw upErr;

  const data = buildConfidenceReportJSON(input);
  const summary = {
    lyrics_confidence_pct: data.summary.lyrics_confidence_pct,
    bpm_confidence_pct: data.summary.bpm_confidence_pct,
    instruments_confidence_pct: data.summary.instruments_confidence_pct,
    bpm: data.summary.bpm,
    word_count: data.summary.word_count,
    word_avg_confidence_pct: data.summary.word_avg_confidence_pct,
    segments_count: data.segments.length,
    flagged_issues_count: data.flagged_issues.length,
  };

  const { data: row, error: insErr } = await supabase
    .from("confidence_reports")
    .insert({
      user_id: userId,
      project_id: projectId,
      format,
      file_name: filename,
      storage_path: storagePath,
      file_size_bytes: blob.size,
      source: input.useEdited ? "verified" : "engine",
      summary,
    })
    .select()
    .single();
  if (insErr) {
    // best-effort cleanup of uploaded file
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]).catch(() => {});
    throw insErr;
  }
  return row as SavedConfidenceReport;
}

export async function listSavedConfidenceReports(projectId: string | null): Promise<SavedConfidenceReport[]> {
  let q = supabase.from("confidence_reports").select("*").order("created_at", { ascending: false }).limit(50);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SavedConfidenceReport[];
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Whitelist of branding fields the legacy migration is allowed to back-fill. Anything
 * outside this set MUST be preserved verbatim from the stored snapshot — including
 * intentionally cleared optional fields like `projectName: null` or `logoDataUrl: null`.
 *
 * This guardrail prevents the migration from silently re-introducing branding the user
 * removed, or stomping on text/image fields the user explicitly stored.
 */
export const LAYOUT_CRITICAL_BRANDING_FIELDS = [
  "logoSize",
  "logoPadding",
  "pageSize",
  "watermarkOpacity",
  "watermarkFontSize",
  "watermarkRotation",
] as const satisfies ReadonlyArray<keyof ReportBranding>;

type LayoutCriticalField = typeof LAYOUT_CRITICAL_BRANDING_FIELDS[number];

const LAYOUT_DEFAULTS: Record<LayoutCriticalField, NonNullable<ReportBranding[LayoutCriticalField]>> = {
  logoSize: LOGO_DEFAULTS.size,
  logoPadding: LOGO_DEFAULTS.padding,
  pageSize: PAGE_SIZE_DEFAULT,
  watermarkOpacity: WATERMARK_DEFAULTS.opacity,
  watermarkFontSize: WATERMARK_DEFAULTS.fontSize,
  watermarkRotation: WATERMARK_DEFAULTS.rotation,
};

/**
 * Migration fallback: when a saved report's branding snapshot pre-dates the layout-critical
 * fields, inject the global DEFAULTS for ONLY those fields rather than letting the current
 * session's override fill them in. Optional fields (projectName, watermarkText, logoDataUrl)
 * are NEVER touched — they pass through verbatim, even when explicitly stored as null.
 *
 * Returns a normalized branding snapshot plus a list of fields that were back-filled.
 */
export function applyLegacyBrandingFallback(
  stored: ReportBranding | null | undefined,
  opts?: { assumeSavedSnapshot?: boolean },
): { branding: ReportBranding; backfilled: Array<keyof ReportBranding> } {
  if (!stored) {
    // When called from a saved-report download (assumeSavedSnapshot), a missing branding
    // object is treated as a pre-v2 legacy snapshot: layout-critical defaults are injected,
    // optional fields stay absent (override MUST NOT leak in).
    if (!opts?.assumeSavedSnapshot) return { branding: {}, backfilled: [] };
    stored = {};
  }
  // Shallow copy preserves every original key — including optional/null fields.
  // Strip explicit `undefined` values so they behave identically to omitted keys.
  const out: ReportBranding = { ...stored };
  for (const k of Object.keys(out)) {
    if ((out as Record<string, unknown>)[k] === undefined) {
      delete (out as Record<string, unknown>)[k];
    }
  }
  const backfilled: Array<keyof ReportBranding> = [];
  for (const field of LAYOUT_CRITICAL_BRANDING_FIELDS) {
    // Guardrail: only back-fill when the stored snapshot has no value at all (undefined or null).
    // Falsy-but-explicit values like 0 (logoPadding) MUST be preserved.
    const current = out[field];
    if (current == null) {
      // Type-safe assignment: the LAYOUT_DEFAULTS map is keyed by the same union.
      (out as Record<string, unknown>)[field] = LAYOUT_DEFAULTS[field];
      backfilled.push(field);
    }
  }
  return { branding: out, backfilled };
}

/**
 * Merge a current-session branding override with the branding that was stored alongside
 * a saved confidence report. The override supplies text/style defaults, but the report's
 * own stored logo size/padding, watermark style, and page size WIN — so re-downloads
 * honour what was persisted to the user's account when the report was saved.
 *
 * Legacy snapshots (saved before these fields existed) are first migrated via
 * applyLegacyBrandingFallback so layout stays deterministic regardless of local overrides.
 */
function mergeStoredBrandingOverStoredOverride(
  stored: ReportBranding | null | undefined,
  override: ReportBranding | null | undefined,
  opts?: { assumeSavedSnapshot?: boolean },
): ReportBranding {
  const o = override ?? {};
  const hasStored = !!stored && Object.keys(stored).length > 0;
  // If branding is missing entirely on a saved-report download, apply the legacy
  // fallback against an empty snapshot — defaults win for layout fields and the
  // current local override is IGNORED so optional fields stay absent.
  if (!hasStored && opts?.assumeSavedSnapshot) {
    return applyLegacyBrandingFallback(null, { assumeSavedSnapshot: true }).branding;
  }
  const s = hasStored ? applyLegacyBrandingFallback(stored).branding : {};
  // Saved-report downloads NEVER let the current local override leak in for any
  // field — layout-critical or optional. The stored snapshot (with legacy backfill)
  // is the sole source of truth so re-downloads stay byte-faithful to what was saved.
  if (opts?.assumeSavedSnapshot) return s;
  return {
    ...o,
    ...s,
    // Stored (or legacy-defaulted) values always win for these layout/style-critical fields.
    logoSize: s.logoSize ?? o.logoSize ?? null,
    logoPadding: s.logoPadding ?? o.logoPadding ?? null,
    pageSize: s.pageSize ?? o.pageSize ?? null,
    watermarkOpacity: s.watermarkOpacity ?? o.watermarkOpacity ?? null,
    watermarkFontSize: s.watermarkFontSize ?? o.watermarkFontSize ?? null,
    watermarkRotation: s.watermarkRotation ?? o.watermarkRotation ?? null,
  };
}

/** Per-field source resolution describing where each branding value came from. */
export type BrandingFieldSource = "saved" | "legacy-default" | "override" | "default";

/** Describes which legacy schema version (if any) triggered the layout backfill. */
export interface BrandingSchemaVersionInfo {
  /** Version explicitly stored on the snapshot, or null if absent (pre-v2 saved reports). */
  stored: ReportSchemaVersion | null;
  /** Version we inferred from the snapshot shape — equals `stored` when present. */
  inferred: ReportSchemaVersion;
  /** Schema version this build of the app emits today. */
  current: ReportSchemaVersion;
  /** True when `inferred < current`, i.e. the legacy migration was needed. */
  migrated: boolean;
  /** Plain-English reason: which fields the legacy version was missing. */
  reason: string;
  /** Marker source: "explicit" if the snapshot stored a schema_version field, else "inferred". */
  markerSource: "explicit" | "inferred";
}

export interface BrandingResolution {
  fields: Record<
    "logoSize" | "logoPadding" | "pageSize" | "watermarkOpacity" | "watermarkFontSize" | "watermarkRotation" | "logoDataUrl" | "watermarkText" | "projectName",
    BrandingFieldSource
  >;
  savedCount: number;
  overrideCount: number;
  legacyBackfilledCount: number;
  schemaVersion: BrandingSchemaVersionInfo;
}

const RESOLVED_FIELDS = [
  "logoSize", "logoPadding", "pageSize",
  "watermarkOpacity", "watermarkFontSize", "watermarkRotation",
  "logoDataUrl", "watermarkText", "projectName",
] as const;

/**
 * Determine which schema version a stored branding snapshot was authored under.
 * If the snapshot includes an explicit `schema_version` (passed in via `explicitVersion`),
 * we trust it. Otherwise we infer: any missing layout-critical field => v1.
 */
export function inferReportSchemaVersion(
  stored: ReportBranding | null | undefined,
  explicitVersion?: ReportSchemaVersion | number | null,
): BrandingSchemaVersionInfo {
  const current = REPORT_SCHEMA_VERSION;
  const stored_ = explicitVersion === 1 || explicitVersion === 2 ? explicitVersion : null;
  const hasSnapshot = !!stored && Object.keys(stored).length > 0;
  const missing: LayoutCriticalField[] = [];
  if (hasSnapshot) {
    for (const f of LAYOUT_CRITICAL_BRANDING_FIELDS) {
      if ((stored as Record<string, unknown>)[f] == null) missing.push(f);
    }
  }
  const inferred: ReportSchemaVersion = stored_ ?? (missing.length > 0 ? 1 : 2);
  const migrated = inferred < current;
  let reason: string;
  if (!hasSnapshot) {
    reason = "No stored branding snapshot — current overrides apply directly.";
  } else if (!migrated) {
    reason = `Snapshot already on schema v${inferred}; no migration needed.`;
  } else {
    reason = missing.length > 0
      ? `Snapshot inferred as v${inferred}: missing ${missing.join(", ")}. Layout defaults injected.`
      : `Snapshot stored as v${inferred} (pre-v${current}). Layout defaults injected for forward-compat.`;
  }
  return {
    stored: stored_,
    inferred,
    current,
    migrated,
    reason,
    markerSource: stored_ != null ? "explicit" : "inferred",
  };
}

export function describeBrandingResolution(
  stored: ReportBranding | null | undefined,
  override: ReportBranding | null | undefined,
  explicitSchemaVersion?: ReportSchemaVersion | number | null,
  opts?: { assumeSavedSnapshot?: boolean },
): BrandingResolution {
  const sRaw = stored ?? {};
  const o = override ?? {};
  const hasSnapshot = !!stored && Object.keys(stored).length > 0;
  // assumeSavedSnapshot: a saved-report download whose branding object is missing entirely
  // is treated as a pre-v2 legacy snapshot — layout fields are 'legacy-default', and the
  // current local override does NOT leak into optional fields.
  const treatAsLegacy = !hasSnapshot && !!opts?.assumeSavedSnapshot;
  const { backfilled } = applyLegacyBrandingFallback(
    hasSnapshot ? stored : null,
    opts?.assumeSavedSnapshot ? { assumeSavedSnapshot: true } : undefined,
  );
  const backfilledSet = new Set<string>(backfilled);
  const fields = {} as BrandingResolution["fields"];
  let savedCount = 0;
  let overrideCount = 0;
  let legacyBackfilledCount = 0;
  for (const k of RESOLVED_FIELDS) {
    const sv = (sRaw as Record<string, unknown>)[k];
    const ov = (o as Record<string, unknown>)[k];
    const sHas = sv != null && sv !== "";
    const oHas = ov != null && ov !== "";
    let src: BrandingFieldSource = "default";
    if (sHas) { src = "saved"; savedCount++; }
    else if ((hasSnapshot || treatAsLegacy) && backfilledSet.has(k)) { src = "legacy-default"; legacyBackfilledCount++; }
    else if (oHas && !opts?.assumeSavedSnapshot) { src = "override"; overrideCount++; }
    fields[k] = src;
  }
  // For a missing-branding saved-report download, fabricate a v1 inference: all six
  // layout-critical fields are reported as missing so the resulting reason explains why
  // defaults were injected.
  const fakeLegacySnapshot: ReportBranding = treatAsLegacy
    ? Object.fromEntries(LAYOUT_CRITICAL_BRANDING_FIELDS.map((f) => [f, null])) as ReportBranding
    : {};
  const schemaVersion = inferReportSchemaVersion(
    treatAsLegacy ? fakeLegacySnapshot : stored,
    explicitSchemaVersion,
  );
  return { fields, savedCount, overrideCount, legacyBackfilledCount, schemaVersion };
}

export interface DownloadResolutionResult {
  /** Whether stored snapshot branding was available to merge with the override. */
  usedSnapshot: boolean;
  /** Per-field source breakdown (only populated when re-rendering from JSON snapshot). */
  resolution: BrandingResolution | null;
}

// ---------------------------------------------------------------------------
// Test-only debug hook
//
// Allows tests (and ad-hoc debugging) to inspect the exact branding payload
// handed to the PDF/JSON renderer during downloadSavedConfidenceReport. The
// hook fires only when a snapshot path is taken (i.e. an override is supplied
// AND a sibling/source JSON exists). Production code should never set this.
// ---------------------------------------------------------------------------
export interface BrandingDebugCapture {
  /** "pdf" when reached via the PDF re-render path, "json" via JSON re-emit. */
  format: "pdf" | "json";
  /** The exact object passed to the renderer / written into the JSON snapshot. */
  merged: ReportBranding;
  /** The keys actually present on the merged object (own enumerable). */
  keys: string[];
  /** Per-field source breakdown for this download. */
  resolution: BrandingResolution;
}

type BrandingDebugHook = (capture: BrandingDebugCapture) => void;

let __brandingDebugHook: BrandingDebugHook | null = null;
let __lastBrandingDebugCapture: BrandingDebugCapture | null = null;

/** Test-only: register a callback that fires after every snapshot-merge download. */
export function __setBrandingResolutionDebugHook(hook: BrandingDebugHook | null): void {
  __brandingDebugHook = hook;
}

/** Test-only: read the most recent capture (or null if none has fired yet). */
export function __getLastBrandingResolutionDebugCapture(): BrandingDebugCapture | null {
  return __lastBrandingDebugCapture;
}

/** Test-only: clear the last-captured payload between tests. */
export function __clearBrandingResolutionDebugCapture(): void {
  __lastBrandingDebugCapture = null;
}

function emitBrandingDebugCapture(
  format: "pdf" | "json",
  merged: ReportBranding,
  resolution: BrandingResolution,
): void {
  const capture: BrandingDebugCapture = {
    format,
    merged,
    keys: Object.keys(merged ?? {}),
    resolution,
  };
  __lastBrandingDebugCapture = capture;
  if (__brandingDebugHook) {
    try { __brandingDebugHook(capture); } catch { /* hook errors must not break downloads */ }
  }
}

export async function downloadSavedConfidenceReport(
  report: SavedConfidenceReport,
  /** Optional branding to apply when re-rendering JSON/PDF on download. */
  brandingOverride?: ReportBranding | null,
): Promise<DownloadResolutionResult> {
  // For JSON: re-emit with branding override merged in, but the report's own stored
  // logoSize/logoPadding/pageSize take precedence so re-downloads stay faithful to
  // what was saved to the account.
  if (report.format === "json" && brandingOverride) {
    const json = await fetchSavedConfidenceReportJSON(report);
    const resolution = describeBrandingResolution(json.branding, brandingOverride, json.schema_version ?? null, { assumeSavedSnapshot: true });
    json.branding = mergeStoredBrandingOverStoredOverride(json.branding, brandingOverride, { assumeSavedSnapshot: true });
    emitBrandingDebugCapture("json", json.branding, resolution);
    triggerBlobDownload(
      new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }),
      report.file_name,
    );
    return { usedSnapshot: true, resolution };
  }
  // For PDF: regenerate from JSON snapshot (if we can locate one). Stored logo size /
  // padding / page size from the snapshot are preserved over the current local override.
  if (report.format === "pdf" && brandingOverride) {
    const sibling = await findSiblingJSONSnapshot(report);
    if (sibling) {
      const json = await fetchSavedConfidenceReportJSON(sibling);
      const resolution = describeBrandingResolution(json.branding, brandingOverride, json.schema_version ?? null, { assumeSavedSnapshot: true });
      const merged = mergeStoredBrandingOverStoredOverride(json.branding, brandingOverride, { assumeSavedSnapshot: true });
      emitBrandingDebugCapture("pdf", merged, resolution);
      const { doc, filename } = buildConfidencePDFDocFromJSON(json, merged);
      const blob = doc.output("blob") as Blob;
      triggerBlobDownload(blob, filename || report.file_name);
      return { usedSnapshot: true, resolution };
    }
    // fall through to plain download if no source JSON available
  }
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(report.storage_path, 300);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not create download link");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = report.file_name;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { usedSnapshot: false, resolution: null };
}

/** Find a JSON snapshot saved alongside a PDF/CSV (same project, source, ~same time). */
async function findSiblingJSONSnapshot(report: SavedConfidenceReport): Promise<SavedConfidenceReport | null> {
  const created = new Date(report.created_at).getTime();
  const windowMs = 5 * 60 * 1000;
  let q = supabase.from("confidence_reports").select("*").eq("format", "json").eq("source", report.source).limit(20);
  if (report.project_id) q = q.eq("project_id", report.project_id);
  const { data, error } = await q;
  if (error || !data) return null;
  const candidates = (data as SavedConfidenceReport[])
    .map(r => ({ r, dt: Math.abs(new Date(r.created_at).getTime() - created) }))
    .filter(x => x.dt <= windowMs)
    .sort((a, b) => a.dt - b.dt);
  return candidates[0]?.r ?? null;
}

export async function deleteSavedConfidenceReport(report: SavedConfidenceReport): Promise<void> {
  await supabase.storage.from(STORAGE_BUCKET).remove([report.storage_path]).catch(() => {});
  const { error } = await supabase.from("confidence_reports").delete().eq("id", report.id);
  if (error) throw error;
}

/** Fetch a saved JSON report's parsed contents via a short-lived signed URL. */
export async function fetchSavedConfidenceReportJSON(report: SavedConfidenceReport): Promise<ConfidenceReportJSON> {
  if (report.format !== "json") {
    throw new Error("Only JSON reports can be re-loaded into the Analysis step.");
  }
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(report.storage_path, 120);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not access saved report");
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`Failed to download report (${res.status})`);
  return (await res.json()) as ConfidenceReportJSON;
}
