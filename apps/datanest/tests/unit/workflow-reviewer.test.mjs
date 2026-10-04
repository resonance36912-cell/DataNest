import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeSourceText,
  analyzeWorkflowText,
  buildReusableWorkflowFindings,
  findLongFunctions,
  isExcluded,
  prioritizeFindings,
  safeNormalizeText,
} from "../../scripts/workflow-reviewer.mjs";

test("safe normalization is deterministic and preserves markdown trailing spaces", () => {
  const source = safeNormalizeText("\ufeffconst x = 1;  \r\n\r\n", ".ts");
  assert.equal(source.text, "const x = 1;\n");
  assert.deepEqual(source.refinements, [
    "removed_utf8_bom",
    "normalized_line_endings",
    "removed_trailing_whitespace",
    "normalized_terminal_newline",
  ]);

  const markdown = safeNormalizeText("hard break  \n", ".md");
  assert.equal(markdown.text, "hard break  \n");
});

test("exclusions match both the directory itself and descendants", () => {
  assert.equal(isExcluded("node_modules", ["node_modules"]), true);
  assert.equal(isExcluded("node_modules/pkg/index.js", ["node_modules"]), true);
  assert.equal(isExcluded("src/index.ts", ["node_modules"]), false);
});

test("workflow directory exclusion forms a complete autonomous mutation boundary", () => {
  const rules = [".github/workflows"];
  assert.equal(isExcluded(".github/workflows", rules), true);
  assert.equal(isExcluded(".github/workflows/guardian.yml", rules), true);
  assert.equal(isExcluded(".github/workflows/nested/reusable.yml", rules), true);
  assert.equal(isExcluded(".github/actions/automation-x-annotation/action.yml", rules), false);
  assert.equal(isExcluded("scripts/workflow-reviewer.mjs", rules), false);
});

test("long functions become medium-priority refactor findings", () => {
  const body = Array.from({ length: 100 }, (_, index) => `  const x${index} = ${index};`).join("\n");
  const text = `function oversized() {\n${body}\n}\n`;
  assert.equal(findLongFunctions(text, 90).length, 1);
  const result = analyzeSourceText("src/example.ts", text, { maxFileLines: 900, maxFunctionLines: 90 });
  assert.equal(result.findings.some((finding) => finding.code === "long_function"), true);
});

test("workflow reviewer flags floating action refs and broad permissions", () => {
  const text = [
    "name: risky",
    "on: [pull_request]",
    "permissions: write-all",
    "jobs:",
    "  test:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: vendor/action@main",
  ].join("\n");
  const result = analyzeWorkflowText(".github/workflows/risky.yml", text, { maxWorkflowSteps: 24 });
  assert.deepEqual(
    result.findings.map((finding) => finding.code).sort(),
    ["floating_action_reference", "write_all_permissions"]
  );
});

test("repeated workflow steps become consolidation candidates", () => {
  const workflows = ["a.yml", "b.yml", "c.yml"].map((name) => ({
    file: `.github/workflows/${name}`,
    metrics: { uses: ["actions/checkout@v7.0.1"], runs: ["npm ci"] },
  }));
  const findings = buildReusableWorkflowFindings(workflows, 3);
  assert.equal(findings.length, 2);
  assert.equal(findings.every((finding) => finding.code === "reusable_step_candidate"), true);
});

test("already-centralized local actions are not re-reported as dedup candidates", () => {
  const workflows = ["a.yml", "b.yml", "c.yml"].map((name) => ({
    file: `.github/workflows/${name}`,
    metrics: { uses: ["./.github/actions/node-project-setup"], runs: [] },
  }));
  const findings = buildReusableWorkflowFindings(workflows, 3);
  assert.equal(findings.length, 0);
});

test("priority ordering puts high-severity findings before lower levels", () => {
  const ordered = prioritizeFindings([
    { severity: "low", category: "z", file: "b" },
    { severity: "high", category: "z", file: "a" },
    { severity: "medium", category: "a", file: "c" },
  ]);
  assert.deepEqual(ordered.map((item) => item.severity), ["high", "medium", "low"]);
});
