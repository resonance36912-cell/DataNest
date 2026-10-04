import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow=readFileSync(".github/workflows/production-edge-function-release.yml","utf8");
const writer=readFileSync("scripts/write-production-edge-function-release-attestation.mjs","utf8");
const verifier=readFileSync("scripts/verify-production-edge-function-release-reference.mjs","utf8");
const connector=JSON.parse(readFileSync("config/production-edge-function-connector-attestation.json","utf8"));

test("production Edge release supports a fail-closed connector attestation fallback",()=>{
  assert.match(workflow,/Verify connector-attested production state/);
  assert.match(workflow,/SUPABASE_ACCESS_TOKEN != ''/);
  assert.match(workflow,/SUPABASE_ACCESS_TOKEN == ''/);
  assert.match(writer,/connector-attested/);
  assert.match(verifier,/Connector-attested release observation is outside the allowed freshness window/);
  assert.equal(connector.schemaVersion,"edge-function-connector-attestation-v1");
  assert.equal(connector.status,"verified");
  assert.equal(connector.source,"supabase-mcp-connector");
  assert.equal(connector.functions["send-job-invite"].status,"ACTIVE");
  assert.equal(connector.functions["send-job-invite"].verify_jwt,true);
});
