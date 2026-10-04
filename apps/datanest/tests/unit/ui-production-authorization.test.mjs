import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const verifier=fileURLToPath(
  new URL("../../scripts/verify-ui-production-authorization.mjs",import.meta.url)
);
const pagesWorkflow=readFileSync(
  new URL("../../.github/workflows/pages.yml",import.meta.url),
  "utf8"
);
const ronsasWorkflow=readFileSync(
  new URL("../../.github/workflows/ronsas-app-validation.yml",import.meta.url),
  "utf8"
);

const valid={
  // Keep authorized-release contract tests deterministic even when the parent
  // workflow exports candidate/test-mode state into process.env.
  DATANEST_UI_RELEASE_STATE:"authorized",
  DATANEST_UI_RELEASE_SHA:"c".repeat(40),
  DATANEST_UI_RELEASE_STATE:"authorized",
  DATANEST_UI_PRODUCTION_CONFIRMATION:"AUTHORIZE PRODUCTION",
  DATANEST_UI_MIRROR_PROMOTION_REF:"Mirror-DataNest candidate run #42",
  DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF:"Mirror live verification #42",
  DATANEST_UI_DATANEST_AI_CERTIFICATION_REF:"DataNest AI Certification #42",
  DATANEST_UI_AUDIT_OPTIMIZER_REF:"Audit Optimizer review AO-2026-09-30-001",
  DATANEST_UI_PR_VERIFICATION_REF:"PR Verification #1293",
  DATANEST_UI_SECURITY_REF:"Security scan #820",
  DATANEST_UI_RONSAS_VALIDATION_REF:"RONSAS Application Validation #158",
  DATANEST_UI_VISUAL_REVIEW_REF:"ui-governance-review-36619224572",
  DATANEST_UI_GOVERNANCE_REVIEW_REF:"DN-GOV-REVIEW-001",
  DATANEST_UI_LEGAL_REVIEW_REF:"DN-LEGAL-REVIEW-001",
  DATANEST_UI_EXTERNAL_REVIEW_REF:"DN-EXTERNAL-REVIEW-001",
  DATANEST_UI_AUTHORIZATION_REF:"DN-PROD-AUTH-001"
};

function verify(extra={}){
  return spawnSync(process.execPath,[verifier],{
    env:{...process.env,...valid,...extra},
    encoding:"utf8"
  });
}

test("production authorization rejects malformed SHA",()=>{
  const result=verify({DATANEST_UI_RELEASE_SHA:"not-a-sha"});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/40-character Git commit SHA/);
});

test("progressive-live authorization permits deployment without a separate human approval reference",()=>{
  const result=verify({
    DATANEST_UI_RELEASE_STATE:"progressive_live",
    DATANEST_UI_PRODUCTION_CONFIRMATION:"",
    DATANEST_UI_MIRROR_PROMOTION_REF:"",
    DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF:"",
    DATANEST_UI_DATANEST_AI_CERTIFICATION_REF:"",
    DATANEST_UI_AUDIT_OPTIMIZER_REF:"",
    DATANEST_UI_PR_VERIFICATION_REF:"",
    DATANEST_UI_SECURITY_REF:"",
    DATANEST_UI_RONSAS_VALIDATION_REF:"",
    DATANEST_UI_VISUAL_REVIEW_REF:"",
    DATANEST_UI_GOVERNANCE_REVIEW_REF:"",
    DATANEST_UI_LEGAL_REVIEW_REF:"",
    DATANEST_UI_EXTERNAL_REVIEW_REF:"",
    DATANEST_UI_AUTHORIZATION_REF:""
  });
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/progressive_live/);
});

test("production authorization rejects wrong confirmation text",()=>{
  const result=verify({DATANEST_UI_PRODUCTION_CONFIRMATION:"authorize production"});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/AUTHORIZE PRODUCTION/);
});

test("production authorization rejects missing and placeholder references",()=>{
  for (const [key,value] of [
    ["DATANEST_UI_MIRROR_PROMOTION_REF",""],
    ["DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF","pending"],
    ["DATANEST_UI_DATANEST_AI_CERTIFICATION_REF",""],
    ["DATANEST_UI_AUDIT_OPTIMIZER_REF","pending"],
    ["DATANEST_UI_SECURITY_REF",""],
    ["DATANEST_UI_RONSAS_VALIDATION_REF","pending"],
    ["DATANEST_UI_LEGAL_REVIEW_REF","todo"],
    ["DATANEST_UI_EXTERNAL_REVIEW_REF","tbd"]
  ]) {
    const result=verify({[key]:value});
    assert.notEqual(result.status,0,`${key} should fail closed`);
    assert.match(result.stderr,new RegExp(key));
  }
});

test("production authorization accepts a complete structural payload",()=>{
  const result=verify();
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Validated UI production authorization payload/);
});

test("authorized fixture ignores parent candidate Test Mode state",()=>{
  const previous=process.env.DATANEST_UI_RELEASE_STATE;
  process.env.DATANEST_UI_RELEASE_STATE="candidate";
  try{
    const result=verify();
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/authorized/);
  }finally{
    if(previous===undefined) delete process.env.DATANEST_UI_RELEASE_STATE;
    else process.env.DATANEST_UI_RELEASE_STATE=previous;
  }
});

test("Pages production deployment uses the current main SHA and a protected environment",()=>{
  assert.match(pagesWorkflow,/push:\n    branches:\n      - main/);
  assert.match(pagesWorkflow,/workflow_dispatch:/);
  assert.doesNotMatch(pagesWorkflow,/workflow_run:/);
  assert.doesNotMatch(pagesWorkflow,/CONDUCTOR Process Synchronization Tree/);
  assert.match(pagesWorkflow,/github-pages/);
  assert.match(pagesWorkflow,/deployments: read/);
  assert.match(pagesWorkflow,/git rev-parse origin\/main/);
  assert.match(pagesWorkflow,/if \[ "\$GITHUB_EVENT_NAME" = "push" \]; then/);
  assert.match(pagesWorkflow,/verify-production-release-attestation\.mjs/);
  assert.match(pagesWorkflow,/npm test/);
  assert.match(pagesWorkflow,/npm run check/);
  assert.doesNotMatch(pagesWorkflow,/mirror_promotion_reference/);
  assert.doesNotMatch(pagesWorkflow,/production_authorization_reference/);
  assert.doesNotMatch(pagesWorkflow,/owner_test_mode/);
});


test("Pages post-deployment verification covers public routes and governed app targets",()=>{
  for (const route of [
    "legal","governance","accessibility","terms","privacy","disclaimers",
    "acceptable-use","intellectual-property","assurance"
  ]) {
    assert.match(pagesWorkflow,new RegExp(`for route in [^\\n]*\\b${route}\\b`));
  }
  for (const slug of [
    "career-compass","creative-studio","epublisher","lyricsync-studio",
    "scene-song-spark","sovereign-forge","syncvision"
  ]) {
    assert.match(pagesWorkflow,new RegExp(`for app in [^\\n]*\\b${slug}\\b`));
  }
  assert.match(pagesWorkflow,/youtubeoptimizer\.life/);
  assert.match(pagesWorkflow,/productionInclusion/);
  assert.match(pagesWorkflow,/release-manifest\.json/);
  assert.match(pagesWorkflow,/releaseAttestation/);
});

test("RONSAS validation is required when the Pages release gate changes",()=>{
  assert.match(
    ronsasWorkflow,
    /pull_request:[\s\S]*?paths:[\s\S]*?"\.github\/workflows\/pages\.yml"/
  );
  assert.match(
    ronsasWorkflow,
    /push:[\s\S]*?paths:[\s\S]*?"\.github\/workflows\/pages\.yml"/
  );
});


test("Owner Live Test Mode allows temporary production while human review refs remain pending",()=>{
  const expiry=new Date(Date.now()+2*60*60*1000).toISOString();
  const result=verify({
    DATANEST_UI_RELEASE_STATE:"owner_test_mode",
    DATANEST_UI_PRODUCTION_CONFIRMATION:"AUTHORIZE OWNER TEST MODE",
    DATANEST_UI_MIRROR_PROMOTION_REF:"Mirror-DataNest owner-test candidate",
    DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF:"Mirror owner-test live verification",
    DATANEST_UI_DATANEST_AI_CERTIFICATION_REF:"DataNest AI owner-test certification",
    DATANEST_UI_AUDIT_OPTIMIZER_REF:"Audit Optimizer owner-test review",
    DATANEST_UI_GOVERNANCE_REVIEW_REF:"",
    DATANEST_UI_LEGAL_REVIEW_REF:"",
    DATANEST_UI_EXTERNAL_REVIEW_REF:"",
    DATANEST_UI_OWNER_TEST_MODE_REF:"PR #291 owner authorization",
    DATANEST_UI_OWNER_TEST_MODE_OWNER_LOGIN:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_ACTOR:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_WINDOW_STRATEGY:"ai_proposed",
    DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY:"standard",
    DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY:"standard",
    DATANEST_UI_OWNER_TEST_MODE_EXPIRES_AT:"",
    DATANEST_UI_OWNER_TEST_MODE_REASON:"Gather live production evidence required for outstanding governance review."
  });
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/owner_test_mode/);
});

test("Owner Live Test Mode rejects actor mismatch and excessive duration",()=>{
  const expiry=new Date(Date.now()+73*60*60*1000).toISOString();
  const base={
    DATANEST_UI_RELEASE_STATE:"owner_test_mode",
    DATANEST_UI_PRODUCTION_CONFIRMATION:"AUTHORIZE OWNER TEST MODE",
    DATANEST_UI_MIRROR_PROMOTION_REF:"Mirror-DataNest owner-test candidate",
    DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF:"Mirror owner-test live verification",
    DATANEST_UI_DATANEST_AI_CERTIFICATION_REF:"DataNest AI owner-test certification",
    DATANEST_UI_AUDIT_OPTIMIZER_REF:"Audit Optimizer owner-test review",
    DATANEST_UI_GOVERNANCE_REVIEW_REF:"",
    DATANEST_UI_LEGAL_REVIEW_REF:"",
    DATANEST_UI_EXTERNAL_REVIEW_REF:"",
    DATANEST_UI_OWNER_TEST_MODE_REF:"owner authorization",
    DATANEST_UI_OWNER_TEST_MODE_OWNER_LOGIN:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_ACTOR:"AnotherAdmin",
    DATANEST_UI_OWNER_TEST_MODE_WINDOW_STRATEGY:"explicit",
    DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY:"standard",
    DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY:"standard",
    DATANEST_UI_OWNER_TEST_MODE_EXPIRES_AT:expiry,
    DATANEST_UI_OWNER_TEST_MODE_REASON:"Gather live production evidence required for outstanding governance review."
  };
  const mismatch=verify(base);
  assert.notEqual(mismatch.status,0);
  assert.match(mismatch.stderr,/actor must match/i);

  const tooLong=verify({...base,DATANEST_UI_OWNER_TEST_MODE_ACTOR:"ResonanceAppDev"});
  assert.notEqual(tooLong.status,0);
  assert.match(tooLong.stderr,/72 hours/i);
});


test("Owner Live Test Mode AI-proposed strategy does not require an explicit expiry",()=>{
  const result=verify({
    DATANEST_UI_RELEASE_STATE:"owner_test_mode",
    DATANEST_UI_PRODUCTION_CONFIRMATION:"AUTHORIZE OWNER TEST MODE",
    DATANEST_UI_MIRROR_PROMOTION_REF:"Mirror-DataNest owner-test candidate",
    DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF:"Mirror owner-test live verification",
    DATANEST_UI_DATANEST_AI_CERTIFICATION_REF:"DataNest AI owner-test certification",
    DATANEST_UI_AUDIT_OPTIMIZER_REF:"Audit Optimizer owner-test review",
    DATANEST_UI_GOVERNANCE_REVIEW_REF:"",
    DATANEST_UI_LEGAL_REVIEW_REF:"",
    DATANEST_UI_EXTERNAL_REVIEW_REF:"",
    DATANEST_UI_OWNER_TEST_MODE_REF:"operator authorization",
    DATANEST_UI_OWNER_TEST_MODE_OWNER_LOGIN:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_ACTOR:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_WINDOW_STRATEGY:"ai_proposed",
    DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY:"cross_system",
    DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY:"audit_grade",
    DATANEST_UI_OWNER_TEST_MODE_EXPIRES_AT:"",
    DATANEST_UI_OWNER_TEST_MODE_REASON:"Gather evidence from live production behavior for governance reviewers."
  });
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/owner_test_mode/);
});

test("Pages workflow omits legacy Owner Test Mode timeframe inputs",()=>{
  assert.doesNotMatch(pagesWorkflow,/owner_test_mode_window_strategy/);
  assert.doesNotMatch(pagesWorkflow,/owner_test_mode_task_complexity/);
  assert.doesNotMatch(pagesWorkflow,/owner_test_mode_reporting_complexity/);
  assert.doesNotMatch(pagesWorkflow,/propose-owner-test-mode-window\\.mjs/);
});

test("Pages production keeps authorization in the protected environment",()=>{
  assert.match(pagesWorkflow,/environment:\n      name: github-pages/);
  assert.doesNotMatch(pagesWorkflow,/visual_review_reference/);
  assert.doesNotMatch(pagesWorkflow,/production_authorization_reference/);
  assert.doesNotMatch(pagesWorkflow,/owner_test_mode/);
});

test("Owner Live Test Mode expiry can fail closed without waiting on protected production review",()=>{
  const expiryWorkflow=readFileSync(
    new URL("../../.github/workflows/ui-owner-test-mode-expiry.yml",import.meta.url),
    "utf8"
  );
  assert.match(expiryWorkflow,/name: github-pages-owner-test-mode/);
  assert.match(expiryWorkflow,/owner_test_mode_expired/);
  assert.match(expiryWorkflow,/actions\/deploy-pages/);
});
