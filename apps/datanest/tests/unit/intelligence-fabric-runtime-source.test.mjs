import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const runtimePath=path.join(root,"supabase/functions/_shared/ilm.ts");

test("shared ILM-1 runtime contract exists",()=>{
  assert.equal(fs.existsSync(runtimePath),true);
  const source=fs.readFileSync(runtimePath,"utf8");
  assert.match(source,/resolveIlm1Route/);
  for(const result of ["selected","rejected","review_required"]) assert.match(source,new RegExp(result));
});

test("ILM-1 composes existing governed dependencies in order",()=>{
  const source=fs.readFileSync(runtimePath,"utf8");
  const memory=source.indexOf("loadCertifiedMemory");
  const policy=source.indexOf("evaluateDataPolicy");
  const resources=source.indexOf("resolveResourceCandidates");
  const provider=source.indexOf("resolveProviderConnection");
  const record=source.indexOf("recordRouteDecision");
  assert.ok(memory>=0&&policy>memory&&resources>policy&&provider>resources&&record>provider);
});

test("ILM runtime does not execute side effects or expose provider secrets",()=>{
  const source=fs.readFileSync(runtimePath,"utf8");
  assert.doesNotMatch(source,/service_authorize_execution_v1|createCapabilityLease|insertReservation|executeShell|remoteDesktop/i);
  assert.doesNotMatch(source,/decrypted_secret|connection\.secret|api_key|access_token|refresh_token/i);
});

test("ILM-1 source states orchestration and no-training boundary",()=>{
  const source=fs.readFileSync(runtimePath,"utf8");
  assert.match(source,/governed orchestration/i);
  assert.match(source,/not a trained foundation model/i);
});
