import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const libPath=path.join(root,"src/lib/intelligenceFabric.ts");
const panelPath=path.join(root,"src/components/IntelligenceFabricPanel.tsx");
const workspacePath=path.join(root,"src/components/DataNestAiWorkspace.tsx");

test("shared Intelligence Fabric UI contract exists",()=>{
  assert.equal(fs.existsSync(libPath),true);
  const source=fs.readFileSync(libPath,"utf8");
  for(const token of ["IlmProfileStatus","IntelligenceRouteKind","IntelligenceRouteDecision","IntelligenceEvaluationStatus","IntelligenceCapabilityEvidenceStatus","canManageIntelligenceFabric"]){
    assert.match(source,new RegExp(token));
  }
});

test("Intelligence Fabric panel reads workspace and mutates profiles only",()=>{
  assert.equal(fs.existsSync(panelPath),true);
  const source=fs.readFileSync(panelPath,"utf8");
  assert.match(source,/get_intelligence_fabric_workspace_v1/);
  assert.match(source,/upsert_ilm_profile_v1/);
  assert.doesNotMatch(source,/service_record_intelligence_route_v1|service_record_intelligence_evaluation_v1|service_record_intelligence_capability_evidence_v1/);
});

test("ILM-1 boundary is explicit and no credential fields are rendered",()=>{
  const source=fs.readFileSync(panelPath,"utf8");
  assert.match(source,/ILM-1 = governed orchestration, not a trained foundation model/);
  assert.match(source,/Routing ≠ authorization/);
  assert.match(source,/Evaluation evidence is read-only/i);
  assert.doesNotMatch(source,/Password|API key|Access token|Refresh token|Chain of thought/i);
});

test("DataNest AI keeps Certified Memory and adds Intelligence Fabric",()=>{
  const source=fs.readFileSync(workspacePath,"utf8");
  assert.match(source,/DataNestAiMemoryPanel/);
  assert.match(source,/IntelligenceFabricPanel/);
  assert.match(source,/>Intelligence Fabric<\/button>|Intelligence Fabric/);
});
