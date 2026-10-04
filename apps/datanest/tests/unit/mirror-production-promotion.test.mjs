import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyPath, loadBoundary } from "../../scripts/lib/repository-boundary.mjs";

const importWorkflow=readFileSync(
  new URL("../../.github/workflows/mirror-production-import.yml",import.meta.url),
  "utf8"
);
const pagesWorkflow=readFileSync(
  new URL("../../.github/workflows/pages.yml",import.meta.url),
  "utf8"
);
const governanceWriter=readFileSync(
  new URL("../../scripts/write-ui-governance-evidence.mjs",import.meta.url),
  "utf8"
);

test("Mirror production import is isolated from main and live deployment",()=>{
  assert.match(importWorkflow,/repository_dispatch:/);
  assert.match(importWorkflow,/mirror-production-candidate/);
  assert.match(importWorkflow,/mirror-promotion\//);
  assert.match(importWorkflow,/git switch -c "\$branch_name" origin\/main/);
  assert.match(importWorkflow,/git push origin "\$branch_name"/);
  assert.doesNotMatch(importWorkflow,/actions\/deploy-pages/);
  assert.doesNotMatch(importWorkflow,/git push origin main/);
});

test("Mirror import validates post-sync anchor lineage instead of canonical ancestry",()=>{
  assert.match(importWorkflow,/mirror_sync_sha:/);
  assert.match(importWorkflow,/MIRROR_SYNC_SHA/);
  assert.match(importWorkflow,/merge-base --is-ancestor "\$MIRROR_SYNC_SHA" "\$MIRROR_SHA"/);
  assert.match(importWorkflow,/merge-base --is-ancestor "\$BASE_SHA" origin\/main/);
  assert.doesNotMatch(importWorkflow,/merge-base --is-ancestor "\$BASE_SHA" "\$MIRROR_SHA"/);
  assert.match(importWorkflow,/git diff --name-only "\$MIRROR_SYNC_SHA" "\$MIRROR_SHA"/);
});

test("Mirror-only controls are excluded while canonical/protected divergence remains blocked",()=>{
  const boundary=loadBoundary();
  const validator=readFileSync(
    new URL("../../scripts/validate-mirror-candidate-boundary.mjs",import.meta.url),
    "utf8"
  );
  assert.match(importWorkflow,/validate-mirror-candidate-boundary\.mjs/);
  assert.match(importWorkflow,/promotablePaths/);
  assert.match(validator,/item\.policy === "mirror_only"/);
  assert.match(validator,/\["canonical_only", "protected_shared", "unclassified"\]/);

  for(const path of [
    ".github/workflows/ci.yml",
    ".github/workflows/pages.yml",
    ".github/workflows/production-candidate.yml",
    "config/mirror-rd-policy.json",
    "docs/MIRROR_DATANEST_RD_MODE.md",
    "scripts/mirror-test-suite.mjs",
    "README.md"
  ]){
    assert.equal(classifyPath(path,boundary).policy,"mirror_only",path);
  }
});

test("canonical importer binds candidate and live workflow evidence to the Mirror SHA",()=>{
  assert.match(importWorkflow,/Candidate workflow identity is not bound to the declared Mirror SHA/);
  assert.match(importWorkflow,/\.github\/workflows\/production-candidate\.yml/);
  assert.match(importWorkflow,/Live Mirror evidence is not a successful pushed Pages run/);
  assert.match(importWorkflow,/\.github\/workflows\/pages\.yml/);
  assert.match(importWorkflow,/\.head_sha/);
  assert.match(importWorkflow,/\.event/);
});

test("candidate artifact identity and digest are fail-closed",()=>{
  assert.match(importWorkflow,/mirror-production-candidate-\$\{MIRROR_SHA:0:12\}/);
  assert.match(importWorkflow,/candidate_patch_digest must be sha256/);
  assert.match(importWorkflow,/Candidate patch digest does not match/);
  assert.match(importWorkflow,/candidateArtifact:\$candidateArtifact/);
  assert.match(importWorkflow,/candidatePatchDigest:\$candidatePatchDigest/);
  assert.match(importWorkflow,/mirrorSyncSha:\$mirrorSyncSha/);
});

test("promotion manifest starts with zero production authority",()=>{
  assert.match(importWorkflow,/auditOptimizer:\{status:"pending",reference:null\}/);
  assert.match(importWorkflow,/governance:\{status:"pending",reference:null\}/);
  assert.match(importWorkflow,/productionAuthorization:\{status:"pending",reference:null\}/);
  assert.match(importWorkflow,/productionDeploymentAllowed:false/);
});

test("production Pages release is environment-gated and no longer requires manual evidence IDs",()=>{
  assert.match(pagesWorkflow,/push:\n    branches:\n      - main/);
  assert.match(pagesWorkflow,/environment:\n      name: github-pages/);
  assert.match(pagesWorkflow,/Verify live production database release attestation/);
  assert.doesNotMatch(pagesWorkflow,/mirror_promotion_reference/);
  assert.doesNotMatch(pagesWorkflow,/audit_optimizer_reference/);
});

test("canonical promotion PR explicitly requires audit and human governance",()=>{
  assert.match(importWorkflow,/DataNest Audit Optimizer review recorded/);
  assert.match(importWorkflow,/Human reviewer approval recorded/);
  assert.match(importWorkflow,/Audit-Optimizer-Reference:\*\* PENDING/);
  assert.match(importWorkflow,/Live deployment initiated only from/);
});
