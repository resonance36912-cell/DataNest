/**
 * Builds a concise "test failure summary" markdown block from the machine-readable
 * reports produced in CI:
 *
 *   test-results/playwright/results.json   Playwright JSON reporter
 *   test-results/vitest/results.json       Vitest JSON reporter
 *
 * Output: top failing specs, their first error message (trimmed of ANSI codes and
 * truncated), and the retry history per spec (attempt -> status/duration).
 *
 * Missing or malformed reports never throw — the caller gets an empty string and
 * the issue body simply omits the section.
 */
import { readFileSync, existsSync } from "node:fs";

const PW_REPORT = "test-results/playwright/results.json";
const VITEST_REPORT = "test-results/vitest/results.json";

const readJson = (path) => {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.log(`[failure-summary] could not read ${path}: ${err.message}`);
    return null;
  }
};

const stripAnsi = (s) => String(s ?? "").replace(/\u001B\[[0-9;]*m/g, "");

const firstLines = (text, max = 240) => {
  const clean = stripAnsi(text).replace(/\s*\n\s*/g, " ⏎ ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const ms = (n) => (Number.isFinite(n) ? `${Math.round(n)}ms` : "—");

/** Walk Playwright's nested suite tree into a flat list of failing specs. */
function playwrightFailures(report) {
  if (!report?.suites) return [];
  const out = [];
  const walk = (suites, trail = []) => {
    for (const suite of suites ?? []) {
      const path = [...trail, suite.title].filter(Boolean);
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const results = test.results ?? [];
          const failed = results.some((r) => r.status !== "passed" && r.status !== "skipped");
          if (!spec.ok || failed) {
            const lastBad = [...results].reverse().find((r) => r.status !== "passed");
            out.push({
              runner: "playwright",
              file: spec.file ?? suite.file ?? path[0] ?? "",
              line: spec.line,
              title: [...path.slice(1), spec.title].filter(Boolean).join(" › ") || spec.title,
              error:
                firstLines(lastBad?.error?.message ?? lastBad?.errors?.[0]?.message ?? "") ||
                `status: ${lastBad?.status ?? "failed"}`,
              attempts: results.map((r, i) => ({
                attempt: i + 1,
                status: r.status,
                duration: r.duration,
              })),
            });
          }
        }
      }
      walk(suite.suites, path);
    }
  };
  walk(report.suites);
  return out;
}

/** Vitest JSON reporter uses the jest-style testResults shape. */
function vitestFailures(report) {
  const files = report?.testResults ?? [];
  const out = [];
  for (const file of files) {
    for (const test of file.assertionResults ?? []) {
      if (test.status !== "failed") continue;
      out.push({
        runner: "vitest",
        file: (file.name ?? "").replace(`${process.cwd()}/`, ""),
        title: [...(test.ancestorTitles ?? []), test.title].filter(Boolean).join(" › "),
        error: firstLines((test.failureMessages ?? [])[0] ?? ""),
        attempts: [{ attempt: 1, status: "failed", duration: test.duration }],
      });
    }
  }
  return out;
}

/**
 * @param {object} [opts]
 * @param {number} [opts.limit=5]  how many failing specs to detail
 * @returns {string} markdown block (empty string when no failures were parsed)
 */
export function collectTestFailures(opts = {}) {
  return [
    ...playwrightFailures(readJson(opts.playwrightReport ?? PW_REPORT)),
    ...vitestFailures(readJson(opts.vitestReport ?? VITEST_REPORT)),
  ];
}

/** Repo-relative file paths of the failing specs (used for CODEOWNERS routing). */
export function failingTestFiles(opts = {}) {
  return [...new Set(collectTestFailures(opts).map((f) => f.file).filter(Boolean))];
}

export function buildTestFailureSummary(opts = {}) {
  const limit = opts.limit ?? 5;
  const failures = collectTestFailures(opts);

  if (!failures.length) return "";

  // Most retried first (flakiest), then alphabetically for stability.
  failures.sort(
    (a, b) => (b.attempts?.length ?? 0) - (a.attempts?.length ?? 0) || a.title.localeCompare(b.title),
  );

  const shown = failures.slice(0, limit);
  const rows = shown
    .map((f) => {
      const where = `\`${f.file}${f.line ? `:${f.line}` : ""}\``;
      const retries = Math.max(0, (f.attempts?.length ?? 1) - 1);
      return `| ${where} | ${f.title || "_untitled_"} | ${f.runner} | ${retries} | ${f.error || "_no message captured_"} |`;
    })
    .join("\n");

  const history = shown
    .map((f) => {
      const attempts = (f.attempts ?? [])
        .map((a) => `attempt ${a.attempt}: ${a.status} (${ms(a.duration)})`)
        .join(" → ");
      return `- **${f.title || f.file}** — ${attempts || "no attempt data"}`;
    })
    .join("\n");

  const more = failures.length > shown.length ? `\n_+${failures.length - shown.length} more failing spec(s) — see the Playwright report._\n` : "";

  return `### Test failure summary (${failures.length} failing spec${failures.length === 1 ? "" : "s"})

| Spec | Test | Runner | Retries | First error |
| --- | --- | --- | --- | --- |
${rows}
${more}
<details><summary>Retry history</summary>

${history}

</details>
`;
}
