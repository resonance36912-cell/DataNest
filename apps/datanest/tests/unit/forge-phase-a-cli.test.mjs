import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cli = path.resolve("scripts/forge-phase-a.mjs");

function run(command, payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-phase-a-"));
  const file = path.join(dir, "input.json");
  fs.writeFileSync(file, JSON.stringify(payload));
  return spawnSync(process.execPath, [cli, command, file], { encoding: "utf8" });
}

test("CLI validates a complete release contract", () => {
  const result = run("validate-release", {
    candidate: {
      repository: "DataNest-Supository/DataNest",
      commitSha: "a".repeat(40),
      canonicalBaseSha: "b".repeat(40),
      environment: "candidate",
      evidenceRefs: [
        "mirror_live_evidence_reference",
        "datanest_ai_certification_reference",
        "audit_optimizer_reference",
        "canonical_pr_verification_reference",
        "security_scan_reference",
        "governance_review_reference",
        "human_production_authorization_reference"
      ]
    },
    policy: {
      canonicalProductionAuthority: true,
      forgeProductionAuthority: false,
      humanProductionAuthorizationRequired: true,
      exactShaPromotionRequired: true
    }
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /"valid": true/);
});

test("CLI exits non-zero for incomplete evidence", () => {
  const result = run("validate-release", {
    candidate: {
      repository: "DataNest-Supository/DataNest",
      commitSha: "a".repeat(40),
      canonicalBaseSha: "b".repeat(40),
      environment: "candidate",
      evidenceRefs: []
    },
    policy: {
      canonicalProductionAuthority: true,
      forgeProductionAuthority: false,
      humanProductionAuthorizationRequired: true,
      exactShaPromotionRequired: true
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /"valid": false/);
});
