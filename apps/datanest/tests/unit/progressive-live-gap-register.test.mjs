import test from "node:test";
import assert from "node:assert/strict";
import { buildProgressiveLiveGapRegister } from "../../scripts/write-progressive-live-gap-register.mjs";

test("progressive-live release records non-blocking human and technical gaps with deadlines",()=>{
  const now="2026-10-02T05:00:00.000Z";
  const register=buildProgressiveLiveGapRegister({
    DATANEST_UI_RELEASE_SHA:"e".repeat(40),
    DATANEST_UI_RELEASE_STATE:"progressive_live"
  },{generatedAt:now});
  assert.equal(register.releaseMode,"progressive_live");
  assert.equal(register.deploymentAllowed,true);
  assert.equal(register.gapCount,14);
  assert.ok(register.gaps.every((gap)=>gap.blocking===false));
  const visual=register.gaps.find((gap)=>gap.id==="human-evidence:visualReview");
  assert.equal(visual.proposedDeadlineHours,24);
  assert.equal(
    Date.parse(visual.proposedDeadline),
    Date.parse(now)+24*60*60*1000
  );
  const db=register.gaps.find((gap)=>gap.id==="technical:database-attestation");
  assert.equal(db.proposedDeadlineHours,48);
  assert.equal(
    Date.parse(db.proposedDeadline),
    Date.parse(now)+48*60*60*1000
  );
  const edge=register.gaps.find((gap)=>gap.id==="technical:edge-function-release");
  assert.equal(edge.proposedDeadlineHours,48);
  assert.equal(
    Date.parse(edge.proposedDeadline),
    Date.parse(now)+48*60*60*1000
  );
});

test("non-progressive release modes do not manufacture progressive gaps",()=>{
  const register=buildProgressiveLiveGapRegister({
    DATANEST_UI_RELEASE_SHA:"f".repeat(40),
    DATANEST_UI_RELEASE_STATE:"candidate"
  },{generatedAt:"2026-10-02T05:00:00.000Z"});
  assert.equal(register.gapCount,0);
  assert.deepEqual(register.gaps,[]);
});
