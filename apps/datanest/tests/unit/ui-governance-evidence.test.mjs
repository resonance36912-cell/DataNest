import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const writer=fileURLToPath(new URL("../../scripts/write-ui-governance-evidence.mjs",import.meta.url));
const sha="a".repeat(40);
const reviewRefs={
  DATANEST_UI_MIRROR_PROMOTION_REF:"Mirror-DataNest candidate run #42 @ abcdef1234567890abcdef1234567890abcdef12",
  DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF:"Mirror live verification #42",
  DATANEST_UI_DATANEST_AI_CERTIFICATION_REF:"DataNest AI Certification #42",
  DATANEST_UI_AUDIT_OPTIMIZER_REF:"Audit Optimizer review AO-2026-09-30-001",
  DATANEST_UI_PR_VERIFICATION_REF:"PR Verification #1291",
  DATANEST_UI_SECURITY_REF:"Security scan #817",
  DATANEST_UI_RONSAS_VALIDATION_REF:"RONSAS Application Validation #156",
  DATANEST_UI_VISUAL_REVIEW_REF:"ui-governance-review-36616655300",
  DATANEST_UI_GOVERNANCE_REVIEW_REF:"DN-GOV-REVIEW-001",
  DATANEST_UI_LEGAL_REVIEW_REF:"DN-LEGAL-REVIEW-001",
  DATANEST_UI_EXTERNAL_REVIEW_REF:"DN-EXTERNAL-REVIEW-001",
  DATANEST_UI_AUTHORIZATION_REF:"DN-PROD-AUTH-001"
};

function runWriter(extraEnv){
  const dir=mkdtempSync(join(tmpdir(),"datanest-ui-evidence-"));
  const target=join(dir,"ui-governance-release.json");
    const env={...process.env};
  for (const key of Object.keys(env)) {
    if (key.startsWith("DATANEST_UI_")) delete env[key];
  }
  Object.assign(env,extraEnv);
  const result=spawnSync(process.execPath,[writer,target],{
    env,
  encoding:"utf8"
  });
  const json=result.status===0 ? JSON.parse(readFileSync(target,"utf8")) : null;
  rmSync(dir,{recursive:true,force:true});
  return {result,json};
}

test("candidate evidence remains non-authoritative and leaves independent gates pending",()=>{
  const {result,json}=runWriter({
    DATANEST_UI_RELEASE_SHA:sha,
    DATANEST_UI_RELEASE_STATE:"candidate",
    DATANEST_UI_PR_VERIFICATION_REF:"PR Verification #1291",
    DATANEST_UI_AUTHORIZATION_REF:"must-not-be-promoted"
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(json.releaseState,"candidate");
  assert.equal(json.authorized,false);
  assert.deepEqual(json.evidence.prVerification,{
    status:"supplied",
    reference:"PR Verification #1291"
  });
  assert.deepEqual(json.evidence.securityScan,{status:"pending",reference:null});
  assert.deepEqual(json.evidence.productionAuthorization,{status:"pending",reference:null});
});

test("evidence identifies the approved design spec and all four implementation plans exactly",()=>{
  const {result,json}=runWriter({
    DATANEST_UI_RELEASE_SHA:sha,
    DATANEST_UI_RELEASE_STATE:"candidate"
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(
    json.designSpec,
    "docs/superpowers/specs/2026-09-29-resonance-datanest-ui-governance-system-design.md"
  );
  assert.deepEqual(json.implementationPlans,[
    "docs/superpowers/plans/2026-09-29-resonance-datanest-ui-foundation-shell.md",
    "docs/superpowers/plans/2026-09-29-resonance-datanest-governance-legal-centre.md",
    "docs/superpowers/plans/2026-09-29-resonance-datanest-ronsas-ui-migration.md",
    "docs/superpowers/plans/2026-09-29-resonance-datanest-certification-production-gates.md"
  ]);
});

test("progressive-live evidence allows missing human and assurance references and publishes deadlines",()=>{
  const {result,json}=runWriter({
    DATANEST_UI_RELEASE_SHA:sha,
    DATANEST_UI_RELEASE_STATE:"progressive_live"
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(json.releaseState,"progressive_live");
  assert.equal(json.authorized,false);
  assert.equal(json.fullyGoverned,false);
  assert.equal(json.productionDeploymentAllowed,true);
  assert.equal(json.gaps.length,12);
  assert.ok(json.gaps.every((gap)=>gap.blocking===false));
  assert.ok(json.gaps.find((gap)=>gap.domain==="visualReview").proposedDeadlineHours===24);
  assert.ok(json.gaps.find((gap)=>gap.domain==="legalReview").proposedDeadlineHours===72);
});

test("authorized evidence fails closed on placeholder review references",()=>{
  const {result}=runWriter({
    DATANEST_UI_RELEASE_SHA:sha,
    DATANEST_UI_RELEASE_STATE:"authorized",
    ...reviewRefs,
    DATANEST_UI_LEGAL_REVIEW_REF:"pending"
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/DATANEST_UI_LEGAL_REVIEW_REF/);
});

test("authorized evidence requires and records the complete review chain",()=>{
  const {result,json}=runWriter({
    DATANEST_UI_RELEASE_SHA:sha,
    DATANEST_UI_RELEASE_STATE:"authorized",
    ...reviewRefs
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(json.authorized,true);
  for (const item of Object.values(json.evidence)) {
    assert.equal(item.status,"supplied");
    assert.ok(item.reference);
  }
});


test("human review dossier covers every production-chain stage without default approval",()=>{
  const review=readFileSync(
    new URL("../../docs/governance/platform-dossier/UI_GOVERNANCE_RELEASE_REVIEW.md",import.meta.url),
    "utf8"
  );
  const schema=readFileSync(
    new URL("../../docs/governance/platform-dossier/UI_GOVERNANCE_EVIDENCE_SCHEMA.md",import.meta.url),
    "utf8"
  );
  for(const phrase of [
    "Self-audit",
    "Automated verification",
    "Security validation",
    "Visual / UX review",
    "Governance-impact review",
    "Legal review",
    "External / independent human review",
    "Production authorization",
    "Deployment run",
    "Post-deployment verification",
    "Dossier / evidence update"
  ]){
    assert.ok(review.toLowerCase().includes(phrase.toLowerCase()),phrase);
  }
  assert.match(schema,/self-audit.*automated verification.*security validation.*visual\/UX review.*governance-impact review.*legal review.*external\/human review.*production authorization.*deployment.*post-deployment verification.*dossier\/evidence update/is);
  assert.match(review,/Empty fields mean \*\*not yet reviewed or approved\*\*/i);
  assert.doesNotMatch(review,/Decision:\s*(approved|accepted|authorized)/i);
});


test("Owner Live Test Mode preserves pending human reviews and temporary deployment authority",()=>{
  const expiry=new Date(Date.now()+60*60*1000).toISOString();
  const {result,json}=runWriter({
    DATANEST_UI_RELEASE_SHA:sha,
    DATANEST_UI_RELEASE_STATE:"owner_test_mode",
    DATANEST_UI_MIRROR_PROMOTION_REF:"Mirror-DataNest candidate run #43",
    DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF:"Mirror live verification #43",
    DATANEST_UI_DATANEST_AI_CERTIFICATION_REF:"DataNest AI Certification #43",
    DATANEST_UI_AUDIT_OPTIMIZER_REF:"Audit Optimizer review AO-TEST-001",
    DATANEST_UI_PR_VERIFICATION_REF:"PR Verification #1340",
    DATANEST_UI_SECURITY_REF:"Security scan #882",
    DATANEST_UI_RONSAS_VALIDATION_REF:"RONSAS Application Validation #186",
    DATANEST_UI_VISUAL_REVIEW_REF:"pending",
    DATANEST_UI_AUTHORIZATION_REF:"pending",
    DATANEST_UI_OWNER_TEST_MODE_REF:"owner temporary exception",
    DATANEST_UI_OWNER_TEST_MODE_OWNER_LOGIN:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_ACTOR:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_EXPIRES_AT:expiry,
    DATANEST_UI_OWNER_TEST_MODE_REASON:"Gather live evidence needed to complete human governance review gates."
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(json.releaseState,"owner_test_mode");
  assert.equal(json.authorized,false);
  assert.equal(json.fullyGoverned,false);
  assert.equal(json.productionDeploymentAllowed,true);
  assert.equal(json.ownerTestMode.active,true);
  assert.equal(json.evidence.visualReview.status,"pending");
  assert.equal(json.evidence.productionAuthorization.status,"pending");
  assert.ok(json.ownerTestMode.evidenceDeadlines.visualReview);
  assert.ok(json.ownerTestMode.evidenceDeadlines.governanceReview);
  assert.equal(json.ownerTestMode.evidenceDeadlines.legalReview,json.ownerTestMode.expiresAt);
  assert.equal(json.ownerTestMode.evidenceDeadlines.externalReview,json.ownerTestMode.expiresAt);
  assert.equal(json.ownerTestMode.evidenceDeadlines.productionAuthorization,json.ownerTestMode.expiresAt);
  assert.equal(json.evidence.governanceReview.status,"pending");
  assert.equal(json.evidence.legalReview.status,"pending");
  assert.equal(json.evidence.externalReview.status,"pending");
});


test("Owner Test Mode evidence records the AI proposal and accepted recommendation",()=>{
  const {result,json}=runWriter({
    DATANEST_UI_RELEASE_SHA:sha,
    DATANEST_UI_RELEASE_STATE:"owner_test_mode",
    DATANEST_UI_MIRROR_PROMOTION_REF:"Mirror-DataNest candidate run #44",
    DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF:"Mirror live verification #44",
    DATANEST_UI_DATANEST_AI_CERTIFICATION_REF:"DataNest AI Certification #44",
    DATANEST_UI_AUDIT_OPTIMIZER_REF:"Audit Optimizer review AO-TEST-002",
    DATANEST_UI_PR_VERIFICATION_REF:"PR Verification #1340",
    DATANEST_UI_SECURITY_REF:"Security scan #882",
    DATANEST_UI_RONSAS_VALIDATION_REF:"RONSAS Application Validation #186",
    DATANEST_UI_VISUAL_REVIEW_REF:"ui-governance-review",
    DATANEST_UI_GOVERNANCE_REVIEW_REF:"",
    DATANEST_UI_LEGAL_REVIEW_REF:"",
    DATANEST_UI_EXTERNAL_REVIEW_REF:"",
    DATANEST_UI_AUTHORIZATION_REF:"operator authorization",
    DATANEST_UI_OWNER_TEST_MODE_REF:"owner temporary exception",
    DATANEST_UI_OWNER_TEST_MODE_OWNER_LOGIN:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_ACTOR:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_WINDOW_STRATEGY:"ai_proposed",
    DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY:"cross_system",
    DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY:"audit_grade",
    DATANEST_UI_OWNER_TEST_MODE_REASON:"Gather live evidence needed to complete human governance review gates."
  });
  assert.equal(result.status,0,result.stderr);
  const proposal=json.ownerTestMode.timeframeProposal;
  assert.equal(proposal.strategy,"ai_proposed");
  assert.equal(proposal.recommendedHours,72);
  assert.equal(proposal.acceptedHours,72);
  assert.equal(proposal.ownerOverride,false);
  assert.equal(proposal.pendingReviewCount,3);
  assert.equal(json.ownerTestMode.expiresAt,proposal.recommendedExpiresAt);
});

test("explicit Owner override preserves the AI recommendation and deviation",()=>{
  const expiry=new Date(Date.now()+36*60*60*1000).toISOString();
  const {result,json}=runWriter({
    DATANEST_UI_RELEASE_SHA:sha,
    DATANEST_UI_RELEASE_STATE:"owner_test_mode",
    DATANEST_UI_MIRROR_PROMOTION_REF:"Mirror-DataNest candidate run #45",
    DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF:"Mirror live verification #45",
    DATANEST_UI_DATANEST_AI_CERTIFICATION_REF:"DataNest AI Certification #45",
    DATANEST_UI_AUDIT_OPTIMIZER_REF:"Audit Optimizer review AO-TEST-003",
    DATANEST_UI_PR_VERIFICATION_REF:"PR Verification #1340",
    DATANEST_UI_SECURITY_REF:"Security scan #882",
    DATANEST_UI_RONSAS_VALIDATION_REF:"RONSAS Application Validation #186",
    DATANEST_UI_VISUAL_REVIEW_REF:"ui-governance-review",
    DATANEST_UI_GOVERNANCE_REVIEW_REF:"",
    DATANEST_UI_LEGAL_REVIEW_REF:"complete",
    DATANEST_UI_EXTERNAL_REVIEW_REF:"complete",
    DATANEST_UI_AUTHORIZATION_REF:"operator authorization",
    DATANEST_UI_OWNER_TEST_MODE_REF:"owner temporary exception",
    DATANEST_UI_OWNER_TEST_MODE_OWNER_LOGIN:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_ACTOR:"ResonanceAppDev",
    DATANEST_UI_OWNER_TEST_MODE_WINDOW_STRATEGY:"explicit",
    DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY:"routine",
    DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY:"summary",
    DATANEST_UI_OWNER_TEST_MODE_EXPIRES_AT:expiry,
    DATANEST_UI_OWNER_TEST_MODE_REASON:"Gather live evidence needed to complete the remaining governance review."
  });
  assert.equal(result.status,0,result.stderr);
  const proposal=json.ownerTestMode.timeframeProposal;
  assert.equal(proposal.strategy,"explicit");
  assert.equal(proposal.ownerOverride,true);
  assert.ok(proposal.acceptedHours>35.9 && proposal.acceptedHours<=36);
  assert.equal(proposal.recommendedHours,24);
  assert.ok(proposal.overrideDeltaHours>11);
});
