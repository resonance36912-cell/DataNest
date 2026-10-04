import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const source=fs.readFileSync(
  path.join(root,"supabase/functions/audit-optimizer/index.ts"),
  "utf8"
);

test("Audit Optimizer reconciles monitored evidence to the latest control/check state",()=>{
  assert.match(source,/function reconcileControlEvidence\(/);
  assert.match(source,/monitorEvidenceIdentity/);
  assert.match(source,/timestampValue\(b\.observed_at\)-timestampValue\(a\.observed_at\)/);
  assert.match(source,/control_evidence:reconciledControlEvidence\.active/);
  assert.doesNotMatch(source,/control_evidence_history:reconciledControlEvidence\.history/);
  assert.match(source,/superseded_failure_count/);
});

test("superseded failures are explicitly historical-only in the optimizer prompt",()=>{
  assert.match(
    source,
    /Never propose remediation from a superseded failed monitor record when the latest evidence for that same control\/check is passed or resolved\./
  );
  assert.match(source,/Superseded monitor failures are intentionally omitted from active-problem evidence/);
});

test("optimizer suggestions must cite evidence that exists in the reconciled snapshot",()=>{
  assert.match(source,/function collectAllowedEvidenceRefs\(/);
  assert.match(source,/filter\(ref=>allowedEvidenceRefs\.has\(ref\)\)/);
  assert.match(source,/if\(evidenceRefs\.length===0\)continue/);
  assert.match(source,/function collectPassingControlEvidenceRefs\(/);
  assert.match(source,/evidenceRefs\.every\(ref=>passingControlEvidenceRefs\.has\(ref\)\)/);
  assert.match(source,/validateDraft\(parsed,standardKeys,allowedEvidenceRefs,passingControlEvidenceRefs\)/);
});

test("optimizer run records reconciliation counts for provenance",()=>{
  assert.match(source,/reconciledControlEvidenceCount:reconciledControlEvidence\.active\.length/);
  assert.match(source,/reconciledMonitorCheckCount:reconciledControlEvidence\.history\.length/);
});
