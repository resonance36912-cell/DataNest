/**
 * Flattens the deploy verification runbook (checklist state, last check run,
 * diff vs previous run and Search Console context) into a single CSV so it can
 * be pasted straight into deploy-notes spreadsheets.
 *
 * One row per item, with a `section` column identifying which part of the
 * runbook the row came from — keeps the file importable without any reshaping.
 */

import type { ChecklistPdfInput } from "./seo-checklist-pdf";
import { BUILD_INFO } from "./build-info";


const HEADERS = [
  "section",
  "group",
  "id",
  "label",
  "status",
  "detail",
  "before",
  "after",
] as const;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function stamp(iso: string | null | undefined, fallback = "") {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

type Row = Partial<Record<(typeof HEADERS)[number], unknown>>;

export function buildChecklistCsv(input: ChecklistPdfInput): string {
  const rows: Row[] = [];

  rows.push({ section: "meta", id: "origin", label: "Origin", detail: input.origin });
  rows.push({
    section: "meta",
    id: "exported_at",
    label: "Exported at",
    detail: new Date().toISOString(),
  });
  const build = input.build ?? BUILD_INFO;
  rows.push({ section: "meta", id: "commit", label: "Commit", detail: build.commit });
  rows.push({
    section: "meta",
    id: "commit_short",
    label: "Commit (short)",
    detail: build.commitShort,
  });
  rows.push({ section: "meta", id: "branch", label: "Branch", detail: build.branch });
  rows.push({ section: "meta", id: "build_mode", label: "Build mode", detail: build.mode });
  rows.push({
    section: "meta",
    id: "built_at",
    label: "Build timestamp",
    detail: build.builtAt || "unknown",
  });
  rows.push({
    section: "meta",
    id: "last_run_at",
    label: "Last check run",
    detail: stamp(input.ranAt, "never"),
  });


  rows.push({
    section: "search-console",
    id: "property",
    label: "Property",
    detail: input.submission.property,
  });
  rows.push({
    section: "search-console",
    id: "sitemap",
    label: "Sitemap submitted",
    detail: input.submission.lastSitemap,
  });
  rows.push({
    section: "search-console",
    id: "submitted_at",
    label: "Last submitted",
    detail: stamp(input.submission.lastSubmittedAt, "never"),
  });

  for (const c of input.checks ?? []) {
    rows.push({
      section: "check",
      group: "last run",
      id: c.id,
      label: c.label,
      status: c.status,
      detail: c.detail,
    });
  }

  for (const d of input.diff ?? []) {
    rows.push({
      section: "diff",
      group: `${stamp(input.runs[1]?.at)} -> ${stamp(input.runs[0]?.at)}`,
      id: d.id,
      label: d.label,
      status: d.kind,
      detail: d.afterDetail ?? d.beforeDetail ?? "",
      before: d.before ?? "",
      after: d.after ?? "",
    });
  }

  for (const section of input.sections) {
    for (const step of section.steps) {
      rows.push({
        section: "checklist",
        group: section.title,
        id: step.id,
        label: step.title,
        status: input.done[step.id] ? "done" : "todo",
        detail: step.note ? `${step.detail} — Note: ${step.note}` : step.detail,
      });
    }
  }

  const body = rows.map((r) => HEADERS.map((h) => cell(r[h])).join(","));
  return [HEADERS.join(","), ...body].join("\n") + "\n";
}

export function checklistCsvFilename(date = new Date()) {
  const iso = date.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `seo-deploy-verification-${iso}.csv`;
}

export function downloadChecklistCsv(input: ChecklistPdfInput) {
  const blob = new Blob([buildChecklistCsv(input)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = checklistCsvFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
