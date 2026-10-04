import test from "node:test";
import assert from "node:assert/strict";
import {
  allCertificationGatesPassed,
  canAutoCertify,
  canHumanCertify,
  canUseUncertifiedEvidence,
  requiredCertificationAuthority,
  contextTrustLabel
} from "../../supabase/functions/_shared/datanestAiPolicy.ts";

test("owner-only categories never auto-certify", () => {
  for (const category of ["architecture","security","authorization","governance","destructive","production_policy"]) {
    assert.equal(
      requiredCertificationAuthority({ category, riskClass: "low", hasConflict: false }),
      "owner"
    );
    assert.equal(
      canAutoCertify({
        category,
        riskClass: "low",
        hasConflict: false,
        allGatesPassed: true,
        evidenceCount: 10,
        confidence: 1
      }),
      false
    );
  }
});

test("low-risk automation requires stronger support and confidence", () => {
  assert.equal(
    canAutoCertify({
      category: "workflow",
      riskClass: "low",
      hasConflict: false,
      allGatesPassed: true,
      evidenceCount: 3,
      confidence: 0.9
    }),
    true
  );
  assert.equal(
    canAutoCertify({
      category: "workflow",
      riskClass: "low",
      hasConflict: false,
      allGatesPassed: true,
      evidenceCount: 2,
      confidence: 0.95
    }),
    false
  );
  assert.equal(
    canAutoCertify({
      category: "workflow",
      riskClass: "low",
      hasConflict: false,
      allGatesPassed: true,
      evidenceCount: 5,
      confidence: 0.5
    }),
    false
  );
});

test("conflict forces owner review", () => {
  assert.equal(
    requiredCertificationAuthority({ category: "workflow", riskClass: "low", hasConflict: true }),
    "owner"
  );
});

test("uncertified evidence is scoped to the same project, job and session", () => {
  const evidence = { projectId: "p1", jobId: "j1", sessionId: "s1" };
  assert.equal(canUseUncertifiedEvidence(evidence, { projectId: "p1", jobId: "j1", sessionId: "s1" }), true);
  assert.equal(canUseUncertifiedEvidence(evidence, { projectId: "p1", jobId: "j2", sessionId: "s1" }), false);
  assert.equal(canUseUncertifiedEvidence(evidence, { projectId: "p1", jobId: "j1", sessionId: "s2" }), false);
});

test("trust labels do not blur provisional and certified evidence", () => {
  assert.equal(contextTrustLabel("uncertified"), "UNCERTIFIED");
  assert.equal(contextTrustLabel("certified"), "CERTIFIED");
});

test("admin cannot certify owner-only architecture knowledge", () => {
  assert.equal(
    canHumanCertify("admin",{category:"architecture",riskClass:"high",hasConflict:false}),
    false
  );
  assert.equal(
    canHumanCertify("owner",{category:"architecture",riskClass:"high",hasConflict:false}),
    true
  );
});

test("admin can certify normal project knowledge", () => {
  assert.equal(
    canHumanCertify("admin",{category:"workflow",riskClass:"normal",hasConflict:false}),
    true
  );
});

test("all certification gates require one passing run for every gate", () => {
  assert.equal(allCertificationGatesPassed([
    {gate:"AUDIT",passed:true},
    {gate:"VERIFY",passed:true},
    {gate:"VALIDATE",passed:true}
  ]),false);
  assert.equal(allCertificationGatesPassed([
    {gate:"AUDIT",passed:true},
    {gate:"VERIFY",passed:true},
    {gate:"VALIDATE",passed:true},
    {gate:"STRESS_TEST",passed:true}
  ]),true);
  assert.equal(allCertificationGatesPassed([
    {gate:"AUDIT",passed:true},
    {gate:"VERIFY",passed:false},
    {gate:"VERIFY",passed:true},
    {gate:"VALIDATE",passed:true},
    {gate:"STRESS_TEST",passed:true}
  ]),true);
});

test("automatic certification requires the latest passing result for every gate to be automated", async () => {
  const { allAutomatedCertificationGatesPassed } = await import("../../supabase/functions/_shared/datanestAiPolicy.ts");
  const automated=[
    {gate:"AUDIT",passed:true,actor_type:"automation"},
    {gate:"VERIFY",passed:true,actor_type:"automation"},
    {gate:"VALIDATE",passed:true,actor_type:"automation"},
    {gate:"STRESS_TEST",passed:true,actor_type:"automation"}
  ];
  assert.equal(allAutomatedCertificationGatesPassed(automated),true);
  assert.equal(
    allAutomatedCertificationGatesPassed([
      ...automated.slice(0,3),
      {gate:"STRESS_TEST",passed:true,actor_type:"human"}
    ]),
    false
  );
  assert.equal(
    allAutomatedCertificationGatesPassed([
      ...automated,
      {gate:"VERIFY",passed:false,actor_type:"human"}
    ]),
    false,
    "the latest result for a gate controls its state"
  );
});
