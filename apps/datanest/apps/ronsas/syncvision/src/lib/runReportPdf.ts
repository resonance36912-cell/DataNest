/**
 * PDF renderer for the run report. Plain jsPDF (no autotable dep) — we lay
 * out a clean, multi-page summary by hand so we control pagination and the
 * dark-on-light theme works in any reader.
 */

import { jsPDF } from "jspdf";
import type { RunReport } from "./runReport";

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function statusColor(status?: string): [number, number, number] {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "succeeded") return [34, 139, 70];
  if (s === "failed" || s === "error") return [200, 50, 50];
  if (s === "processing" || s === "running" || s === "queued") return [180, 130, 30];
  return [110, 110, 110];
}

export function generateRunReportPdf(report: RunReport): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  const ensure = (h: number) => {
    if (y + h > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const h1 = (text: string) => {
    ensure(12);
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(20);
    doc.text(text, MARGIN, y);
    y += 8;
    doc.setDrawColor(220).setLineWidth(0.3).line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 5;
  };

  const h2 = (text: string) => {
    ensure(10);
    y += 2;
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(40);
    doc.text(text, MARGIN, y);
    y += 6;
  };

  const kv = (label: string, value: string) => {
    ensure(6);
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(90);
    doc.text(label, MARGIN, y);
    doc.setFont("helvetica", "normal").setTextColor(20);
    const lines = doc.splitTextToSize(value || "—", CONTENT_W - 45) as string[];
    doc.text(lines, MARGIN + 45, y);
    y += Math.max(5, lines.length * 4.5);
  };

  const para = (text: string, opts: { size?: number } = {}) => {
    if (!text) return;
    const size = opts.size ?? 9;
    doc.setFont("helvetica", "normal").setFontSize(size).setTextColor(40);
    const lines = doc.splitTextToSize(text, CONTENT_W) as string[];
    for (const line of lines) {
      ensure(5);
      doc.text(line, MARGIN, y);
      y += size * 0.45 + 0.6;
    }
  };

  // ── Header ──
  h1("Storyboard Run Report");
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  doc.text(`Generated ${fmtDate(report.generated_at)}`, MARGIN, y);
  y += 7;

  // ── Project ──
  h2("Project");
  kv("Name", report.project.name || report.project.id);
  kv("Project ID", report.project.id);
  kv("Status", report.project.status || "—");
  kv("BPM / Key", `${report.project.bpm ?? "—"} • ${report.project.music_key ?? "—"}`);
  kv("Mood / Energy", `${report.project.mood ?? "—"} • ${report.project.energy ?? "—"}`);
  if (report.project.instruments?.length) {
    kv("Instruments", report.project.instruments.join(", "));
  }
  kv("Created", fmtDate(report.project.created_at));
  kv("Last updated", fmtDate(report.project.updated_at));

  // ── Totals ──
  h2("Totals");
  kv("Scenes", String(report.totals.scenes));
  kv("With image", String(report.totals.scenes_with_image));
  kv("With video", String(report.totals.scenes_with_video));
  kv("With vocal sync", String(report.totals.scenes_with_lipsync));
  kv("Failed renders", String(report.totals.failed_renders));

  // ── Final assets ──
  h2("Final Assets");
  kv("Merge status", report.final_assets.merge_status || "—");
  kv("Final video URL", report.final_assets.final_video_url || "—");
  kv("Merge updated", fmtDate(report.final_assets.merge_updated_at));

  // ── Transcription ──
  if (report.transcription) {
    h2("Transcription");
    kv("Version", `v${report.transcription.version_number ?? "?"} (${report.transcription.status ?? "—"})`);
    kv("Word count", String(report.transcription.word_count ?? "—"));
    if (report.transcription.full_text) {
      ensure(6);
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(90);
      doc.text("Full text", MARGIN, y);
      y += 5;
      // Cap to ~3000 chars in PDF — full text always lives in the JSON export.
      const txt = report.transcription.full_text.length > 3000
        ? report.transcription.full_text.slice(0, 3000) + "\n\n[…truncated — see JSON export for full text]"
        : report.transcription.full_text;
      para(txt, { size: 9 });
    }
  }

  // ── Scenes ──
  h1("Per-Scene Job Status");
  for (const s of report.scenes) {
    ensure(40);
    // Scene header + status pill
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20);
    doc.text(`Scene ${s.scene_number}`, MARGIN, y);
    const status = s.render_job?.status ?? (s.video_url ? "completed" : "pending");
    const [r, g, b] = statusColor(status);
    doc.setFillColor(r, g, b);
    doc.roundedRect(MARGIN + 30, y - 4, 28, 5.5, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(255);
    doc.text(status.toUpperCase(), MARGIN + 31, y);
    if (s.tracking_id) {
      doc.setFont("courier", "normal").setFontSize(8).setTextColor(120);
      doc.text(s.tracking_id, PAGE_W - MARGIN, y, { align: "right" });
    }
    y += 6;

    if (s.lyric_segment) {
      doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(80);
      const lines = doc.splitTextToSize(`"${s.lyric_segment}"`, CONTENT_W) as string[];
      for (const line of lines) { ensure(5); doc.text(line, MARGIN, y); y += 4.5; }
    }
    if (s.time_start || s.time_end) {
      kv("Timing", `${s.time_start || "?"} → ${s.time_end || "?"}`);
    }
    if (s.mood || s.location) {
      kv("Setting", `${s.mood || "—"} · ${s.location || "—"}`);
    }
    if (s.render_job) {
      kv(
        "Render",
        `${s.render_job.provider} (${s.render_job.quality}) · ${s.render_job.progress}% · upd ${fmtDate(s.render_job.updated_at)}`,
      );
      if (s.render_job.error) kv("Error", s.render_job.error);
    }
    if (s.lipsync_job) {
      kv(
        "Vocal sync",
        `${s.lipsync_job.provider} · ${s.lipsync_job.status} · ${s.lipsync_job.progress}%`,
      );
    }
    if (s.video_url) kv("Video URL", s.video_url);
    if (s.lipsync_video_url) kv("Vocal sync URL", s.lipsync_video_url);
    y += 3;
    doc.setDrawColor(235).setLineWidth(0.2).line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 3;
  }

  // Footer page numbers.
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(140);
    doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN, PAGE_H - 6, { align: "right" });
    doc.text("Resonance SyncVision — Run Report", MARGIN, PAGE_H - 6);
  }

  return doc.output("blob");
}
