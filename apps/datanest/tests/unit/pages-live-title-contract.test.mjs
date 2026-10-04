import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Pages live verifier accepts canonical DataNest title extensions", () => {
  const workflow = readFileSync(".github/workflows/pages.yml", "utf8");
  assert.ok(workflow.includes("grep -Eq '<title>DataNest([^<]*)</title>' /tmp/datanest-home.html"));
  assert.ok(!workflow.includes('grep -q "<title>DataNest</title>" /tmp/datanest-home.html'));
  assert.ok(workflow.includes('class="authShell"'));
});
