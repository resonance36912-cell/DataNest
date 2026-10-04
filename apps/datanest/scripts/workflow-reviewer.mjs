#!/usr/bin/env node
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULTS = {
  reportDir: "artifacts/workflow-reviewer",
  workflowDir: ".github/workflows",
  scanRoots: ["src", "scripts", ".github/workflows", "docs"],
  exclude: [
    "node_modules",
    ".next",
    "artifacts",
    "backups",
    "package-lock.json",
    "public/transparency",
    "supabase/migrations"
  ],
  sourceExtensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"],
  textExtensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".yml", ".yaml", ".toml", ".css", ".scss", ".md", ".txt"],
  maxFileLines: 900,
  maxFunctionLines: 90,
  maxWorkflowSteps: 24,
  reusableStepMinWorkflows: 3
};

const severityRank = { high: 0, medium: 1, low: 2 };
const slash = (value) => String(value || "").split(sep).join("/").replace(/^\.\//, "");

function parseArgs(argv) {
  const out = {
    apply: false,
    strict: false,
    config: "workflow-reviewer.config.json",
    reportDir: null,
    root: process.cwd()
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") out.apply = true;
    else if (argv[i] === "--strict") out.strict = true;
    else if (argv[i] === "--config") out.config = argv[++i];
    else if (argv[i] === "--report-dir") out.reportDir = argv[++i];
    else if (argv[i] === "--root") out.root = argv[++i];
  }
  return out;
}

export function isExcluded(file, rules = []) {
  const value = slash(file);
  return rules.some((entry) => {
    const rule = slash(entry).replace(/\/$/, "");
    return value === rule || value.startsWith(rule + "/");
  });
}

export function safeNormalizeText(text, extension = "") {
  let value = String(text ?? "");
  const refinements = [];

  if (value.charCodeAt(0) === 0xfeff) {
    value = value.slice(1);
    refinements.push("removed_utf8_bom");
  }

  if (value.includes("\r\n")) {
    value = value.replace(/\r\n/g, "\n");
    refinements.push("normalized_line_endings");
  }

  const whitespaceSafe = ![".md", ".txt"].includes(extension);
  if (whitespaceSafe) {
    const trimmed = value
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n");
    if (trimmed !== value) {
      value = trimmed;
      refinements.push("removed_trailing_whitespace");
    }
  }

  if (value.length > 0) {
    const terminal = value.replace(/\n*$/u, "") + "\n";
    if (terminal !== value) {
      value = terminal;
      refinements.push("normalized_terminal_newline");
    }
  }

  return { text: value, changed: refinements.length > 0, refinements };
}

export function findLongFunctions(text, maxFunctionLines = 90) {
  const lines = String(text || "").split("\n");
  const candidates = [];
  const starter = /\b(?:function\s+[\w$]+\s*\(|(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?!(?:if|for|while|switch|catch)\b)(?:async\s+)?[\w$]+\s*\([^;]*\)\s*\{)/;

  for (let i = 0; i < lines.length; i++) {
    if (!starter.test(lines[i])) continue;
    let depth = 0;
    let opened = false;

    for (let j = i; j < lines.length; j++) {
      const line = lines[j]
        .replace(/\/\/.*$/g, "")
        .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "");
      for (const ch of line) {
        if (ch === "{") {
          depth++;
          opened = true;
        } else if (ch === "}") {
          depth--;
        }
      }
      if (opened && depth <= 0) {
        const length = j - i + 1;
        if (length > maxFunctionLines) {
          candidates.push({
            line: i + 1,
            endLine: j + 1,
            lines: length,
            signature: lines[i].trim().slice(0, 140)
          });
        }
        break;
      }
    }
  }

  return candidates;
}

export function analyzeSourceText(file, text, config = DEFAULTS) {
  const findings = [];
  const lines = String(text || "").split("\n");
  const lineCount = lines.length;
  const longFunctions = findLongFunctions(text, config.maxFunctionLines ?? DEFAULTS.maxFunctionLines);
  const todoCount = (String(text || "").match(/\b(?:TODO|FIXME|HACK)\b/g) || []).length;
  const consoleCount = (String(text || "").match(/\bconsole\.(?:log|debug|warn|error)\s*\(/g) || []).length;
  const anyCount = (String(text || "").match(/:\s*any\b|\bas\s+any\b/g) || []).length;

  if (lineCount > (config.maxFileLines ?? DEFAULTS.maxFileLines)) {
    findings.push({
      severity: "medium",
      category: "code-structure",
      code: "large_source_file",
      file,
      detail: `${lineCount} lines exceeds the ${config.maxFileLines ?? DEFAULTS.maxFileLines}-line review threshold.`,
      recommendation: "Split cohesive responsibilities into smaller modules and preserve public behavior with focused tests."
    });
  }

  for (const fn of longFunctions.slice(0, 12)) {
    findings.push({
      severity: "medium",
      category: "code-structure",
      code: "long_function",
      file,
      line: fn.line,
      detail: `${fn.lines}-line function: ${fn.signature}`,
      recommendation: "Extract pure helpers or domain operations, then keep the orchestration function narrow."
    });
  }

  if (todoCount >= 4) {
    findings.push({
      severity: "low",
      category: "maintenance",
      code: "dense_deferred_work",
      file,
      detail: `${todoCount} TODO/FIXME/HACK markers remain in this file.`,
      recommendation: "Convert durable work items into tracked issues and remove obsolete inline reminders."
    });
  }

  if (consoleCount >= 6) {
    findings.push({
      severity: "low",
      category: "observability",
      code: "console_logging_density",
      file,
      detail: `${consoleCount} console calls may indicate ad-hoc observability.`,
      recommendation: "Route operational diagnostics through the project logging/telemetry boundary where appropriate."
    });
  }

  if (anyCount >= 5) {
    findings.push({
      severity: "low",
      category: "type-safety",
      code: "any_type_density",
      file,
      detail: `${anyCount} explicit any usages reduce contract clarity.`,
      recommendation: "Replace repeated any types with narrow interfaces, unknown plus guards, or shared domain types."
    });
  }

  return { metrics: { lineCount, todoCount, consoleCount, anyCount, longFunctionCount: longFunctions.length }, findings };
}

export function analyzeWorkflowText(file, text, config = DEFAULTS) {
  const value = String(text || "");
  const findings = [];
  const stepCount = (value.match(/^\s*-\s+(?:name|uses|run):/gm) || []).length;
  const uses = [...value.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((m) => m[1]);
  const runs = [...value.matchAll(/^\s*-?\s*run:\s*(.+)$/gm)].map((m) => m[1].trim());

  if (stepCount > (config.maxWorkflowSteps ?? DEFAULTS.maxWorkflowSteps)) {
    findings.push({
      severity: "medium",
      category: "workflow-structure",
      code: "large_workflow",
      file,
      detail: `${stepCount} executable steps exceeds the ${config.maxWorkflowSteps ?? DEFAULTS.maxWorkflowSteps}-step review threshold.`,
      recommendation: "Extract repeated setup or validation sequences into reusable workflows/actions."
    });
  }

  const floatingActions = uses.filter((entry) => /@(main|master|latest)$/i.test(entry));
  if (floatingActions.length) {
    findings.push({
      severity: "high",
      category: "workflow-supply-chain",
      code: "floating_action_reference",
      file,
      detail: `Floating action references: ${floatingActions.join(", ")}.`,
      recommendation: "Pin third-party actions to a version tag or immutable commit according to repository policy."
    });
  }

  if (/^\s*permissions:\s*write-all\s*$/m.test(value)) {
    findings.push({
      severity: "high",
      category: "workflow-permissions",
      code: "write_all_permissions",
      file,
      detail: "Workflow grants write-all permissions.",
      recommendation: "Replace write-all with the smallest explicit permissions required by each job."
    });
  }

  if (/\bpull_request_target\b/.test(value)) {
    findings.push({
      severity: "medium",
      category: "workflow-security",
      code: "pull_request_target_review",
      file,
      detail: "pull_request_target requires careful trust-boundary review.",
      recommendation: "Confirm untrusted PR code is never executed with privileged tokens or write permissions."
    });
  }

  return { metrics: { stepCount, uses, runs }, findings };
}

export function buildReusableWorkflowFindings(workflows, minWorkflows = 3) {
  const usage = new Map();
  for (const workflow of workflows) {
    for (const action of new Set(workflow.metrics.uses || [])) {
      if (action.startsWith("./")) continue;
      const key = `uses:${action}`;
      usage.set(key, [...(usage.get(key) || []), workflow.file]);
    }
    for (const run of new Set(workflow.metrics.runs || [])) {
      if (!/^(npm ci|npm test|npm run check|npm run build|docker build\b)/.test(run)) continue;
      const key = `run:${run}`;
      usage.set(key, [...(usage.get(key) || []), workflow.file]);
    }
  }

  return [...usage.entries()]
    .filter(([, files]) => files.length >= minWorkflows)
    .map(([step, files]) => ({
      severity: "low",
      category: "workflow-deduplication",
      code: "reusable_step_candidate",
      file: files[0],
      detail: `${step} appears across ${files.length} workflows.`,
      recommendation: `Consider centralizing this repeated step; affected workflows: ${files.join(", ")}.`
    }));
}

export function prioritizeFindings(findings = []) {
  return [...findings].sort((a, b) => {
    const severity = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
    if (severity) return severity;
    const category = String(a.category).localeCompare(String(b.category));
    if (category) return category;
    return String(a.file).localeCompare(String(b.file));
  });
}

async function walk(root, start, config) {
  const absolute = resolve(root, start);
  const out = [];
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const absolutePath = join(absolute, entry.name);
    const relativePath = slash(relative(root, absolutePath));
    if (isExcluded(relativePath, config.exclude)) continue;
    if (entry.isDirectory()) out.push(...await walk(root, relativePath, config));
    else out.push(relativePath);
  }
  return out;
}

function renderMarkdown(report) {
  const lines = [
    "# Workflow Reviewer & Code Cleaner",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Executive summary",
    "",
    `- Files reviewed: ${report.summary.filesReviewed}`,
    `- Files safely refined: ${report.summary.filesRefined}`,
    `- Findings: ${report.summary.findings} (${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low)`,
    `- Workflow files reviewed: ${report.summary.workflowsReviewed}`,
    `- Mode: ${report.mode}`,
    "",
    "## Prioritized next steps",
    ""
  ];

  if (!report.nextSteps.length) {
    lines.push("No optimization findings crossed the configured thresholds.");
  } else {
    report.nextSteps.forEach((finding, index) => {
      const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      lines.push(
        `### ${index + 1}. [${finding.severity.toUpperCase()}] ${finding.code}`,
        "",
        `**Location:** \`${where}\``,
        "",
        finding.detail,
        "",
        `**Next action:** ${finding.recommendation}`,
        ""
      );
    });
  }

  lines.push("## Safe refinements", "");
  if (!report.refinements.length) lines.push("No byte-safe text refinements were needed.");
  else {
    for (const item of report.refinements) {
      lines.push(`- \`${item.file}\`: ${item.refinements.join(", ")}`);
    }
  }

  lines.push(
    "",
    "## Guardrails",
    "",
    "- Automatic cleanup is limited to byte-safe text normalization.",
    "- Behavioral source changes remain report-only and require review.",
    "- Generated output, backups, package locks, transparency evidence, and database migrations are excluded by default.",
    "- Findings are heuristics for prioritization; tests and domain review remain authoritative.",
    ""
  );
  return lines.join("\n");
}

export async function reviewRepository(options = {}) {
  const root = resolve(options.root || process.cwd());
  const config = { ...DEFAULTS, ...(options.config || {}) };
  const reportDir = resolve(root, options.reportDir || config.reportDir);
  const files = new Set();

  for (const scanRoot of config.scanRoots) {
    for (const file of await walk(root, scanRoot, config)) files.add(file);
  }

  const findings = [];
  const refinements = [];
  const workflows = [];
  let reviewed = 0;

  for (const file of [...files].sort()) {
    const extension = extname(file).toLowerCase();
    if (!config.textExtensions.includes(extension)) continue;

    let text;
    try {
      text = await readFile(resolve(root, file), "utf8");
    } catch {
      continue;
    }
    reviewed++;

    const normalized = safeNormalizeText(text, extension);
    if (normalized.changed) {
      refinements.push({ file, refinements: normalized.refinements });
      if (options.apply) await writeFile(resolve(root, file), normalized.text, "utf8");
    }

    const inspectedText = normalized.text;
    if (config.sourceExtensions.includes(extension)) {
      findings.push(...analyzeSourceText(file, inspectedText, config).findings);
    }
    if (file.startsWith(slash(config.workflowDir) + "/") && [".yml", ".yaml"].includes(extension)) {
      const workflow = { file, ...analyzeWorkflowText(file, inspectedText, config) };
      workflows.push(workflow);
      findings.push(...workflow.findings);
    }
  }

  findings.push(...buildReusableWorkflowFindings(workflows, config.reusableStepMinWorkflows));
  const ordered = prioritizeFindings(findings);
  const summary = {
    filesReviewed: reviewed,
    filesRefined: refinements.length,
    findings: ordered.length,
    high: ordered.filter((f) => f.severity === "high").length,
    medium: ordered.filter((f) => f.severity === "medium").length,
    low: ordered.filter((f) => f.severity === "low").length,
    workflowsReviewed: workflows.length
  };

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: options.apply ? "review+safe-refinement" : "review-only",
    config: {
      scanRoots: config.scanRoots,
      exclude: config.exclude,
      maxFileLines: config.maxFileLines,
      maxFunctionLines: config.maxFunctionLines,
      maxWorkflowSteps: config.maxWorkflowSteps,
      reusableStepMinWorkflows: config.reusableStepMinWorkflows
    },
    summary,
    refinements,
    nextSteps: ordered
  };

  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  await writeFile(join(reportDir, "report.md"), renderMarkdown(report), "utf8");

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, renderMarkdown({ ...report, nextSteps: ordered.slice(0, 12) }) + "\n", "utf8");
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let config = {};
  try {
    config = JSON.parse(await readFile(resolve(args.root, args.config), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const report = await reviewRepository({
    root: args.root,
    config,
    reportDir: args.reportDir || config.reportDir,
    apply: args.apply
  });

  console.log(JSON.stringify(report.summary, null, 2));
  if (args.strict && report.summary.high > 0) {
    console.error(`Workflow reviewer found ${report.summary.high} high-severity finding(s).`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
