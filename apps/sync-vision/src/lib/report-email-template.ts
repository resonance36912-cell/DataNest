import type { ReportSummary } from "@/lib/report-email";

/**
 * Customisable subject + body used for the emailed checklist report.
 * Supports {{placeholders}} filled from the run summary and build metadata.
 */

const STORAGE_KEY = "syncvision.report.email.template.v1";

export type ReportEmailFormat = "text" | "html";

export interface ReportEmailTemplate {
  subject: string;
  /** Plain-text body (used when format is "text"). */
  body: string;
  /** HTML body (used when format is "html"). */
  htmlBody: string;
  format: ReportEmailFormat;
}

export const DEFAULT_TEMPLATE: ReportEmailTemplate = {
  subject: "SEO deploy report — {{passing}}/{{total}} passing ({{commit}})",
  body: [
    "Deploy verification finished for {{origin}}.",
    "",
    "Result: {{passing}}/{{total}} checks passing",
    "Failed checks: {{failed}}",
    "Run time: {{ranAt}}",
    "Commit: {{commit}} ({{branch}})",
    "Built: {{builtAt}}",
    "Report file: {{filename}}",
  ].join("\n"),
  htmlBody: [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a">',
    '  <h2 style="margin:0 0 12px;font-size:18px">SEO deploy report</h2>',
    '  <p style="margin:0 0 12px">Deploy verification finished for <strong>{{origin}}</strong>.</p>',
    '  <p style="margin:0 0 12px;font-size:16px"><strong>{{passing}}/{{total}}</strong> checks passing</p>',
    '  <ul style="margin:0 0 12px;padding-left:18px">',
    '    <li>Failed checks: {{failed}}</li>',
    '    <li>Run time: {{ranAt}}</li>',
    '    <li>Commit: {{commit}} ({{branch}})</li>',
    '    <li>Built: {{builtAt}}</li>',
    '    <li>Report file: {{filename}}</li>',
    '  </ul>',
    '</div>',
  ].join("\n"),
  format: "text",
};

export const TEMPLATE_PLACEHOLDERS = [
  "passing",
  "total",
  "failed",
  "ranAt",
  "commit",
  "branch",
  "builtAt",
  "filename",
  "origin",
] as const;

export interface PlaceholderHelp {
  key: (typeof TEMPLATE_PLACEHOLDERS)[number];
  description: string;
  example: string;
}

export const PLACEHOLDER_HELP: PlaceholderHelp[] = [
  {
    key: "passing",
    description: "Number of checks that passed",
    example: "8",
  },
  {
    key: "total",
    description: "Total number of checks run",
    example: "10",
  },
  {
    key: "failed",
    description: "Comma-separated labels of failed checks, or 'none'",
    example: "Canonical tags, Hreflang alternates",
  },
  {
    key: "ranAt",
    description: "ISO timestamp when the checks finished",
    example: "2026-08-06T06:42:00.000Z",
  },
  {
    key: "commit",
    description: "Short Git commit hash from the build",
    example: "a1b2c3d",
  },
  {
    key: "branch",
    description: "Git branch the build was produced from",
    example: "main",
  },
  {
    key: "builtAt",
    description: "ISO timestamp when the app was built",
    example: "2026-08-06T05:00:00.000Z",
  },
  {
    key: "filename",
    description: "Name of the archived PDF report",
    example: "seo-checklist-20260806-a1b2c3d.pdf",
  },
  {
    key: "origin",
    description: "Origin where the checklist was run",
    example: "https://www.reson8.life",
  },
];

export function loadEmailTemplate(): ReportEmailTemplate {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TEMPLATE };
    const parsed = JSON.parse(raw);
    return {
      subject:
        typeof parsed?.subject === "string" && parsed.subject.trim()
          ? parsed.subject.slice(0, 200)
          : DEFAULT_TEMPLATE.subject,
      body:
        typeof parsed?.body === "string" && parsed.body.trim()
          ? parsed.body.slice(0, 4000)
          : DEFAULT_TEMPLATE.body,
      htmlBody:
        typeof parsed?.htmlBody === "string" && parsed.htmlBody.trim()
          ? parsed.htmlBody.slice(0, 8000)
          : DEFAULT_TEMPLATE.htmlBody,
      format: parsed?.format === "html" ? "html" : "text",
    };
  } catch {
    return { ...DEFAULT_TEMPLATE };
  }
}

export function saveEmailTemplate(tpl: ReportEmailTemplate): ReportEmailTemplate {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tpl));
  } catch {
    /* storage unavailable */
  }
  return tpl;
}

export function resetEmailTemplate(): ReportEmailTemplate {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_TEMPLATE };
}

export function templateValues(
  summary: ReportSummary,
  builtAt: string,
): Record<string, string> {
  return {
    passing: String(summary.passing),
    total: String(summary.total),
    failed: summary.failed.length ? summary.failed.join(", ") : "none",
    ranAt: summary.ranAt,
    commit: summary.commit,
    branch: summary.branch,
    builtAt,
    filename: summary.filename,
    origin: summary.origin,
  };
}

export interface TemplateValidation {
  /** Unknown placeholder names found, in order of first appearance. */
  unknown: string[];
  /** Malformed markers such as single braces or unclosed {{. */
  malformed: string[];
  ok: boolean;
}

const KNOWN = new Set<string>(TEMPLATE_PLACEHOLDERS as readonly string[]);

function collect(text: string, unknown: Set<string>, malformed: Set<string>) {
  for (const m of text.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    const key = m[1];
    if (!/^\w+$/.test(key)) {
      malformed.add(m[0]);
    } else if (!KNOWN.has(key)) {
      unknown.add(key);
    }
  }
  // Unclosed "{{" or stray single-brace tokens like {commit}
  const stripped = text.replace(/\{\{[^}]*?\}\}/g, "");
  for (const m of stripped.matchAll(/\{\{[^\n]{0,40}/g)) malformed.add(m[0].trim());
  for (const m of stripped.matchAll(/\{\s*(\w+)\s*\}/g)) {
    if (KNOWN.has(m[1])) malformed.add(m[0]);
  }
}

/** Warn about unknown/malformed placeholders before a report is sent. */
export function validateTemplate(tpl: ReportEmailTemplate): TemplateValidation {
  const unknown = new Set<string>();
  const malformed = new Set<string>();
  collect(tpl.subject, unknown, malformed);
  collect(activeBody(tpl), unknown, malformed);
  return {
    unknown: [...unknown],
    malformed: [...malformed],
    ok: unknown.size === 0 && malformed.size === 0,
  };
}

/** Human-readable summary of validation problems, or null when clean. */
export function validationMessage(v: TemplateValidation): string | null {
  if (v.ok) return null;
  const parts: string[] = [];
  if (v.unknown.length)
    parts.push(
      `Unknown placeholder${v.unknown.length === 1 ? "" : "s"}: ${v.unknown
        .map((k) => `{{${k}}}`)
        .join(", ")}`,
    );
  if (v.malformed.length)
    parts.push(`Malformed: ${v.malformed.join(", ")}`);
  return parts.join(" · ");
}

/** The body being edited/sent for the template's current format. */
export function activeBody(tpl: ReportEmailTemplate): string {
  return tpl.format === "html" ? tpl.htmlBody : tpl.body;
}

/** Update the body for the template's current format. */
export function setActiveBody(
  tpl: ReportEmailTemplate,
  value: string,
): ReportEmailTemplate {
  return tpl.format === "html"
    ? { ...tpl, htmlBody: value }
    : { ...tpl, body: value };
}

/** Escape user values so they cannot inject markup into an HTML body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTemplate(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}

/** Render the active body, HTML-escaping placeholder values in HTML mode. */
export function renderBody(
  tpl: ReportEmailTemplate,
  values: Record<string, string>,
): string {
  if (tpl.format !== "html") return renderTemplate(tpl.body, values);
  const safe = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, escapeHtml(v)]),
  );
  return renderTemplate(tpl.htmlBody, safe);
}
