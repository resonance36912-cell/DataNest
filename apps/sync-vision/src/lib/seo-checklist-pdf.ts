/**
 * Renders the deploy verification runbook (checklist state + last check run +
 * diff vs the previous run) into a plain, printable PDF for deploy notes.
 *
 * Deliberately text-only via jsPDF primitives — no DOM capture — so the output
 * stays small, selectable and readable regardless of the app theme.
 */

import { jsPDF } from "jspdf";
import type { SeoCheckResult } from "./seo-live-checks";
import type { SeoDiffEntry, SeoRun } from "./seo-run-history";
import {
  DEFAULT_BRANDING,
  logoFormat,
  type ChecklistBranding,
} from "./seo-checklist-branding";
import { BUILD_INFO, formatBuildInfo, type BuildInfo } from "./build-info";


export interface ChecklistPdfSection {
  title: string;
  summary: string;
  steps: { id: string; title: string; detail: string; note?: string }[];
}

export interface ChecklistPdfInput {
  sections: ChecklistPdfSection[];
  done: Record<string, boolean>;
  checks: SeoCheckResult[] | null;
  ranAt: string | null;
  diff: SeoDiffEntry[] | null;
  runs: SeoRun[];
  submission: { property: string; lastSitemap: string; lastSubmittedAt: string | null };
  origin: string;
  /** Optional team branding (title, company name, logo). */
  branding?: ChecklistBranding;
  /** Commit / build metadata for traceability; defaults to the running build. */
  build?: BuildInfo;
}



const MARGIN = 48;
const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;
const BODY_W = PAGE_W - MARGIN * 2;

function stamp(iso: string | null | undefined, fallback = "—") {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString();
}

export function buildChecklistPdf(input: ChecklistPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const nextPage = () => {
    doc.addPage();
    y = MARGIN;
  };

  const space = (h: number) => {
    if (y + h > PAGE_H - MARGIN) nextPage();
  };

  const text = (
    value: string,
    opts: { size?: number; bold?: boolean; indent?: number; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, BODY_W - indent) as string[];
    for (const line of lines) {
      space(size + 4);
      doc.text(line, MARGIN + indent, y);
      y += size + 3;
    }
    y += opts.gap ?? 0;
  };

  const rule = () => {
    space(12);
    doc.setDrawColor(200);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 12;
  };

  // Header — branded logo (optional) sits above the title block.
  const branding = { ...DEFAULT_BRANDING, ...(input.branding ?? {}) };
  if (branding.logoDataUrl) {
    try {
      const props = doc.getImageProperties(branding.logoDataUrl);
      const w = Math.max(24, Math.min(branding.logoWidth || 90, BODY_W));
      const h = (props.height / props.width) * w;
      doc.addImage(branding.logoDataUrl, logoFormat(branding.logoDataUrl), MARGIN, y, w, h);
      y += h + 12;
    } catch {
      /* unreadable logo — fall through to a text-only header */
    }
  }
  text(branding.title.trim() || DEFAULT_BRANDING.title, { size: 16, bold: true });
  if (branding.company.trim()) text(branding.company.trim(), { size: 11, bold: true });
  text(`Origin: ${input.origin}`, { size: 9 });
  text(`Exported: ${new Date().toLocaleString()}`, { size: 9 });
  const build = input.build ?? BUILD_INFO;
  text(`Build: ${formatBuildInfo(build)}`, { size: 9 });
  text(`Commit: ${build.commit}`, { size: 9, gap: 6 });
  rule();



  // Search Console context
  text("Search Console", { size: 12, bold: true });
  text(`Property: ${input.submission.property || "not set"}`, { size: 9 });
  text(`Sitemap submitted: ${input.submission.lastSitemap || "not set"}`, { size: 9 });
  text(`Last submitted: ${stamp(input.submission.lastSubmittedAt, "never")}`, {
    size: 9,
    gap: 6,
  });
  rule();

  // Last automated run
  text("Last automated check run", { size: 12, bold: true });
  if (!input.checks || input.checks.length === 0) {
    text("No checks recorded in this session.", { size: 9, gap: 6 });
  } else {
    const failed = input.checks.filter((c) => c.status === "fail").length;
    text(
      `${stamp(input.ranAt)} · ${input.checks.length - failed}/${input.checks.length} passing`,
      { size: 9, gap: 4 },
    );
    for (const c of input.checks) {
      text(`${c.status === "pass" ? "[PASS]" : "[FAIL]"} ${c.label}`, {
        size: 10,
        bold: true,
      });
      text(c.detail, { size: 9, indent: 14, gap: 4 });
    }
  }
  rule();

  // Diff vs previous run
  text("Change vs previous run", { size: 12, bold: true });
  if (!input.diff) {
    text("Not enough history yet — run the checks after the next deploy.", {
      size: 9,
      gap: 6,
    });
  } else {
    const changed = input.diff.filter((d) => d.kind !== "unchanged");
    text(`${stamp(input.runs[1]?.at)} -> ${stamp(input.runs[0]?.at)}`, { size: 9, gap: 4 });
    if (changed.length === 0) {
      text("No changes since the previous deploy.", { size: 9, gap: 6 });
    } else {
      for (const d of changed) {
        text(`${d.kind.toUpperCase()} · ${d.label}`, { size: 10, bold: true });
        if (d.beforeDetail) text(`Was (${d.before}): ${d.beforeDetail}`, { size: 9, indent: 14 });
        if (d.afterDetail) text(`Now (${d.after}): ${d.afterDetail}`, { size: 9, indent: 14 });
        y += 4;
      }
    }
  }
  rule();

  // Checklist
  const allSteps = input.sections.flatMap((s) => s.steps);
  const completed = allSteps.filter((s) => input.done[s.id]).length;
  text(`Checklist (${completed}/${allSteps.length} complete)`, { size: 12, bold: true, gap: 4 });

  for (const section of input.sections) {
    const secDone = section.steps.filter((s) => input.done[s.id]).length;
    space(40);
    text(`${section.title} — ${secDone}/${section.steps.length}`, { size: 11, bold: true });
    text(section.summary, { size: 9, gap: 4 });
    for (const step of section.steps) {
      text(`${input.done[step.id] ? "[x]" : "[ ]"} ${step.title}`, { size: 10, indent: 8 });
      text(step.detail, { size: 9, indent: 26 });
      if (step.note) text(`Note: ${step.note}`, { size: 9, indent: 26 });
      y += 4;
    }
    y += 6;
  }

  // Footer: company attribution (when set) + page numbers on every page.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    if (branding.company.trim()) {
      doc.text(branding.company.trim(), MARGIN, PAGE_H - 24);
    }
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 24, { align: "right" });
    doc.setTextColor(0);
  }

  return doc;

}

export function checklistPdfFilename(date = new Date()) {
  const iso = date.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `seo-deploy-verification-${iso}.pdf`;
}

export function downloadChecklistPdf(input: ChecklistPdfInput) {
  buildChecklistPdf(input).save(checklistPdfFilename());
}
