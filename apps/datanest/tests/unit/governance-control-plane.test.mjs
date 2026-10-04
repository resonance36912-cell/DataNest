import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("CONDUCTOR runs on bounded scheduled/manual control paths only",()=>{
  const workflow=readFileSync(".github/workflows/conductor.yml","utf8");
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/cron: "0 \* \* \* \*"/);
  assert.doesNotMatch(workflow,/workflow_run:/);
  assert.doesNotMatch(workflow,/cron: "\*\/15 \* \* \* \*"/);
  assert.match(workflow,/cancel-in-progress: true/);
});

test("native protection reconciliation is isolated to manual execution",()=>{
  const workflow=readFileSync(".github/workflows/native-protection-reconcile.yml","utf8");
  assert.match(workflow,/on:\n  workflow_dispatch:/);
  assert.doesNotMatch(workflow,/push:/);
  assert.doesNotMatch(workflow,/workflow_run:/);
  assert.match(workflow,/DATANEST_GITHUB_ADMIN_TOKEN/);
});
