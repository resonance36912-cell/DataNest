import test from "node:test";
import assert from "node:assert/strict";
import { createPromotionRecord, appendPromotionTransition, validatePromotionProvenance, verifyPromotionLineage } from "../../lib/resonance-forge-promotion-lineage.mjs";

const sha = "a".repeat(40);

test("promotion lineage is explicit and chained", () => {
  let record = createPromotionRecord({ candidateId: "c1", commitSha: sha, at: "2026-09-30T00:00:00.000Z" });
  record = appendPromotionTransition(record, { to: "live_candidate", at: "2026-09-30T00:01:00.000Z", evidenceRef: "e1" });
  assert.equal(record.history.length, 2);
  assert.equal(record.history[1].from, "r_and_d");
  assert.equal(validatePromotionProvenance(record).valid, true);
});

test("lineage cannot cross SHA", () => {
  const record = createPromotionRecord({ candidateId: "c1", commitSha: sha, at: "2026-09-30T00:00:00.000Z" });
  const result = verifyPromotionLineage(record, "b".repeat(40));
  assert.equal(result.valid, false);
});

test("broken history is rejected", () => {
  const record = createPromotionRecord({ candidateId: "c1", commitSha: sha, at: "2026-09-30T00:00:00.000Z" });
  record.history.push({ from: "live_candidate", to: "production", at: "2026-09-30T00:01:00.000Z", evidenceRef: null });
  assert.equal(validatePromotionProvenance(record).valid, false);
});
