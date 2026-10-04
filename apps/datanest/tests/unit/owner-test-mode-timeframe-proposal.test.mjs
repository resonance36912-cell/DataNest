import test from "node:test";
import assert from "node:assert/strict";
import {
  proposeOwnerTestModeWindow,
  OWNER_TEST_MODE_TIMEFRAME_MODEL_VERSION
} from "../../scripts/propose-owner-test-mode-window.mjs";

const fixedNow=new Date("2026-09-30T09:00:00.000Z");

test("routine single governance review proposes a one-day window",()=>{
  const proposal=proposeOwnerTestModeWindow({
    DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY:"standard",
    DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY:"standard",
    DATANEST_UI_GOVERNANCE_REVIEW_REF:"",
    DATANEST_UI_LEGAL_REVIEW_REF:"legal-complete",
    DATANEST_UI_EXTERNAL_REVIEW_REF:"external-complete"
  },fixedNow);

  assert.equal(proposal.modelVersion,OWNER_TEST_MODE_TIMEFRAME_MODEL_VERSION);
  assert.deepEqual(proposal.pendingReviewDomains,["governanceReview"]);
  assert.equal(proposal.humanResponseHours,12);
  assert.equal(proposal.rawHours,22);
  assert.equal(proposal.recommendedHours,24);
  assert.equal(proposal.recommendedExpiresAt,"2026-10-01T09:00:00.000Z");
});

test("cross-system audit-grade work with governance legal and external reviews proposes 72 hours",()=>{
  const proposal=proposeOwnerTestModeWindow({
    DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY:"cross_system",
    DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY:"audit_grade",
    DATANEST_UI_GOVERNANCE_REVIEW_REF:"",
    DATANEST_UI_LEGAL_REVIEW_REF:"",
    DATANEST_UI_EXTERNAL_REVIEW_REF:""
  },fixedNow);

  assert.deepEqual(proposal.pendingReviewDomains,[
    "governanceReview",
    "legalReview",
    "externalReview"
  ]);
  assert.equal(proposal.humanResponseHours,24);
  assert.equal(proposal.coordinationHours,12);
  assert.equal(proposal.taskHours,18);
  assert.equal(proposal.reportingHours,12);
  assert.equal(proposal.rawHours,66);
  assert.equal(proposal.recommendedHours,72);
  assert.equal(proposal.recommendedExpiresAt,"2026-10-03T09:00:00.000Z");
});

test("completed human reviews reduce the proposal to a short evidence window",()=>{
  const proposal=proposeOwnerTestModeWindow({
    DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY:"routine",
    DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY:"summary",
    DATANEST_UI_GOVERNANCE_REVIEW_REF:"done",
    DATANEST_UI_LEGAL_REVIEW_REF:"done",
    DATANEST_UI_EXTERNAL_REVIEW_REF:"done"
  },fixedNow);

  assert.equal(proposal.pendingReviewCount,0);
  assert.equal(proposal.rawHours,8);
  assert.equal(proposal.recommendedHours,12);
});

test("proposal rejects unsupported complexity labels",()=>{
  assert.throws(
    ()=>proposeOwnerTestModeWindow({
      DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY:"impossible",
      DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY:"standard"
    },fixedNow),
    /TASK_COMPLEXITY/
  );
});
