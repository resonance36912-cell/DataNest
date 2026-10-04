import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow=readFileSync(
  new URL("../../.github/workflows/conductor.yml",import.meta.url),
  "utf8"
);

const mainDispatchGuard=/github\.event_name == 'workflow_dispatch'[\s\S]*?github\.ref == 'refs\/heads\/main'/;
const scheduleGuard=/github\.event_name == 'schedule'/;

test("CONDUCTOR coordinate and timeframe jobs share the same bounded trigger policy",()=>{
  const coordinate=workflow.match(/\n  coordinate:\n([\s\S]*?)(?=\n  gate-timeframe:)/)?.[1]||"";
  const timeframe=workflow.match(/\n  gate-timeframe:\n([\s\S]*)$/)?.[1]||"";

  for(const section of [coordinate,timeframe]){
    assert.match(section,mainDispatchGuard);
    assert.match(section,scheduleGuard);
  }

  assert.doesNotMatch(workflow,/workflow_run:/);
});

test("CONDUCTOR concurrency coalesces automation for the same canonical SHA",()=>{
  assert.match(
    workflow,
    /group: datanest-conductor-\$\{\{ github\.sha \}\}/
  );
  assert.match(workflow,/cancel-in-progress: true/);
});
