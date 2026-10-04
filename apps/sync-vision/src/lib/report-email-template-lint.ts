import {
  TEMPLATE_PLACEHOLDERS,
  activeBody,
  type ReportEmailTemplate,
} from "@/lib/report-email-template";

/**
 * Line-level lint for report email templates. Finds unknown placeholders,
 * malformed markers and missing/unbalanced braces so problems can be shown
 * with the exact line before a report is sent.
 */

export type LintKind = "unknown" | "malformed" | "missing-braces";

export type LintField = "subject" | "body";

export interface LintIssue {
  field: LintField;
  /** 1-based line number within the field. */
  line: number;
  /** 0-based column of the offending text within the line. */
  column: number;
  /** The exact offending text. */
  snippet: string;
  kind: LintKind;
  message: string;
  /** Suggested replacement, when one can be inferred. */
  suggestion?: string;
}

export interface LintReport {
  issues: LintIssue[];
  ok: boolean;
  counts: Record<LintKind, number>;
  /** Source lines per field, for rendering highlights. */
  lines: Record<LintField, string[]>;
}

const KNOWN = new Set<string>(TEMPLATE_PLACEHOLDERS as readonly string[]);

function closest(key: string): string | undefined {
  const lower = key.toLowerCase();
  let best: string | undefined;
  let bestScore = 0;
  for (const k of KNOWN) {
    const kl = k.toLowerCase();
    let score = 0;
    if (kl === lower) score = 100;
    else if (kl.startsWith(lower) || lower.startsWith(kl)) score = 60;
    else if (kl.includes(lower) || lower.includes(kl)) score = 40;
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return bestScore >= 40 ? best : undefined;
}

function push(
  issues: LintIssue[],
  field: LintField,
  text: string,
  index: number,
  snippet: string,
  kind: LintKind,
  message: string,
  suggestion?: string,
) {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  const column = index - (before.lastIndexOf("\n") + 1);
  issues.push({ field, line, column, snippet, kind, message, suggestion });
}

function lintText(field: LintField, text: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const covered: Array<[number, number]> = [];

  // Well-formed {{ ... }} markers
  for (const m of text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    const idx = m.index ?? 0;
    covered.push([idx, idx + m[0].length]);
    const key = m[1];
    if (!/^\w+$/.test(key)) {
      push(
        issues,
        field,
        text,
        idx,
        m[0],
        "malformed",
        key.trim()
          ? `"${key}" is not a valid placeholder name (letters, numbers and underscores only).`
          : "Empty placeholder marker.",
      );
    } else if (!KNOWN.has(key)) {
      const hint = closest(key);
      push(
        issues,
        field,
        text,
        idx,
        m[0],
        "unknown",
        `Unknown placeholder "${key}" — it will be sent literally.`,
        hint ? `{{${hint}}}` : undefined,
      );
    }
  }

  const inside = (i: number) => covered.some(([s, e]) => i >= s && i < e);

  // Single-brace tokens like {commit}
  for (const m of text.matchAll(/\{\s*(\w+)\s*\}/g)) {
    const idx = m.index ?? 0;
    if (inside(idx)) continue;
    if (!KNOWN.has(m[1])) continue;
    push(
      issues,
      field,
      text,
      idx,
      m[0],
      "missing-braces",
      `"${m[0]}" uses single braces — placeholders need double braces.`,
      `{{${m[1]}}}`,
    );
  }

  // Unclosed "{{" runs
  for (const m of text.matchAll(/\{\{/g)) {
    const idx = m.index ?? 0;
    if (inside(idx)) continue;
    const rest = text.slice(idx, idx + 40).split("\n")[0];
    const key = /^\{\{\s*(\w+)/.exec(rest)?.[1];
    const resolved = key ? (KNOWN.has(key) ? key : closest(key)) : undefined;
    push(
      issues,
      field,
      text,
      idx,
      key ? rest.slice(0, rest.indexOf(key) + key.length) : rest,
      "missing-braces",
      "Unclosed placeholder — no matching }} was found on this line.",
      resolved ? `{{${resolved}}}` : undefined,
    );
  }


  // Stray "}}" without an opener
  for (const m of text.matchAll(/\}\}/g)) {
    const idx = m.index ?? 0;
    if (inside(idx)) continue;
    push(
      issues,
      field,
      text,
      idx,
      "}}",
      "missing-braces",
      "Stray }} without a matching {{.",
    );
  }

  return issues.sort((a, b) => a.line - b.line || a.column - b.column);
}

export function lintTemplate(tpl: ReportEmailTemplate): LintReport {
  const body = activeBody(tpl);
  const issues = [...lintText("subject", tpl.subject), ...lintText("body", body)];
  const counts: Record<LintKind, number> = {
    unknown: 0,
    malformed: 0,
    "missing-braces": 0,
  };
  for (const i of issues) counts[i.kind] += 1;
  return {
    issues,
    ok: issues.length === 0,
    counts,
    lines: { subject: tpl.subject.split("\n"), body: body.split("\n") },
  };
}

export function lintSummary(report: LintReport): string {
  if (report.ok) return "No placeholder issues found.";
  const parts: string[] = [];
  if (report.counts.unknown) parts.push(`${report.counts.unknown} unknown`);
  if (report.counts.malformed) parts.push(`${report.counts.malformed} malformed`);
  if (report.counts["missing-braces"])
    parts.push(`${report.counts["missing-braces"]} brace issue(s)`);
  return `${report.issues.length} issue${report.issues.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}

/** Applies every available suggested fix to a single text field. */
export function autoFixText(
  field: LintField,
  text: string,
): { text: string; fixed: number } {
  let current = text;
  let fixed = 0;
  for (let pass = 0; pass < 5; pass += 1) {
    const issues = lintText(field, current).filter((i) => i.suggestion);
    if (issues.length === 0) break;
    const lines = current.split("\n");
    // Apply bottom-up so earlier offsets stay valid.
    const ordered = [...issues].sort(
      (a, b) => b.line - a.line || b.column - a.column,
    );
    let applied = 0;
    for (const issue of ordered) {
      const idx = issue.line - 1;
      const line = lines[idx];
      if (line === undefined) continue;
      if (line.slice(issue.column, issue.column + issue.snippet.length) !== issue.snippet)
        continue;
      lines[idx] =
        line.slice(0, issue.column) +
        issue.suggestion +
        line.slice(issue.column + issue.snippet.length);
      applied += 1;
    }
    if (applied === 0) break;
    fixed += applied;
    current = lines.join("\n");
  }
  return { text: current, fixed };
}

/** Number of lint issues that can be auto-fixed. */
export function countFixable(report: LintReport): number {
  return report.issues.filter((i) => i.suggestion).length;
}

/** Rewrites subject and active body applying all suggested fixes. */
export function autoFixTemplate(tpl: ReportEmailTemplate): {
  subject: string;
  body: string;
  fixed: number;
} {
  const subject = autoFixText("subject", tpl.subject);
  const body = autoFixText("body", activeBody(tpl));
  return {
    subject: subject.text,
    body: body.text,
    fixed: subject.fixed + body.fixed,
  };
}
