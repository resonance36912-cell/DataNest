import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const libPath=path.join(root,"src/lib/trustPolicy.ts");
const panelPath=path.join(root,"src/components/TrustPolicyPanel.tsx");
const governancePath=path.join(root,"src/components/GovernanceWorkspace.tsx");
const appPath=path.join(root,"src/components/DataNestApp.tsx");

test("trust policy shared types keep processing and reuse separate",()=>{
  assert.equal(fs.existsSync(libPath),true,"src/lib/trustPolicy.ts must exist");
  const source=fs.readFileSync(libPath,"utf8");
  for(const token of ["VisibilityClass","ReuseState","TrustEvidenceState","ProviderTrustStatus","RetentionDispositionIntent","TrustPolicyRole","canProposeTrustPolicy","canApproveTrustPolicy"]){
    assert.match(source,new RegExp(token));
  }
  assert.doesNotMatch(source,/consent:boolean/i);
});

test("Trust Policy panel reads the governed workspace and mutates only through RPCs",()=>{
  assert.equal(fs.existsSync(panelPath),true,"src/components/TrustPolicyPanel.tsx must exist");
  const source=fs.readFileSync(panelPath,"utf8");
  assert.match(source,/get_trust_policy_workspace_v1/);
  for(const fn of [
    "propose_data_policy_binding_v1","request_retention_review_v1","create_trust_manifest_draft_v1",
    "create_provider_trust_profile_v1","approve_data_policy_binding_v1","activate_trust_manifest_v1",
    "activate_provider_trust_profile_v1","propose_retention_policy_v1","approve_retention_policy_v1",
    "place_retention_hold_v1","release_retention_hold_v1","resolve_retention_review_v1"
  ])assert.match(source,new RegExp(fn));
  assert.doesNotMatch(source,/from\("(?:data_policy_bindings|trust_manifests|provider_trust_profiles|retention_policies|retention_holds|retention_reviews)"\)\.(?:insert|update|delete)/);
});

test("Trust Policy UI explicitly separates processing, learning, publication, retention and rollout state",()=>{
  const source=fs.readFileSync(panelPath,"utf8");
  const domain=fs.readFileSync(libPath,"utf8");
  assert.match(source,/Processing permission does not grant learning or publication permission\./);
  assert.match(source,/No destructive retention action is enabled in Phase C v1\./);
  assert.match(source,/Provider credentials are managed outside Trust Profiles\./);
  assert.match(source,/Planned\/unknown controls are not verified trust guarantees\./);
  assert.match(source,/Visibility \/ processing/);
  assert.match(source,/Reuse \/ learning/);
  assert.match(source,/Rollout mode/);
  assert.match(source,/report_only/);
  assert.match(source,/Approved provider route keys/);
  assert.match(source,/Authority basis/);
  assert.match(source,/Evidence reference/);
  assert.match(source,/evidenceStates\.map/);
  for(const state of ["verified","partial","planned","unknown"])assert.match(domain,new RegExp(state));
  assert.doesNotMatch(source,/>\s*(?:Delete data|Purge|Anonymize)/i);
  assert.doesNotMatch(source,/API key|Password|Secret value/);
});

test("retention review resolution does not accept caller-supplied lineage truth",()=>{
  const source=fs.readFileSync(panelPath,"utf8");
  assert.doesNotMatch(source,/target_lineage_resolved/);
  assert.match(source,/target_reason:"Future disposition approved after server-derived lineage review/);
});

test("Governance keeps Sovereign Governance default and exposes trust section deep link",()=>{
  const source=fs.readFileSync(governancePath,"utf8");
  assert.match(source,/Sovereign Governance/);
  assert.match(source,/Trust & Data Policy/);
  assert.match(source,/searchParams\.get\("section"\)/);
  assert.match(source,/section==="trust"/);
  assert.match(source,/TrustPolicyPanel/);
});

test("DataNest passes exact membership role into Governance",()=>{
  const source=fs.readFileSync(appPath,"utf8");
  assert.match(source,/GovernanceWorkspace projectId=\{project\.id\} currentUserId=\{session\.user\.id\} role=\{membership\?\.role\|\|"viewer"\}/);
});

test("approval controls are role gated",()=>{
  const source=fs.readFileSync(panelPath,"utf8");
  assert.match(source,/canProposeTrustPolicy\(role\)/);
  assert.match(source,/canApproveTrustPolicy\(role\)/);
  assert.match(source,/Owner \/ admin/);
});

test("Trust Policy receives current actor for independent-review safeguards",()=>{
  const governance=fs.readFileSync(governancePath,"utf8");
  const panel=fs.readFileSync(panelPath,"utf8");
  assert.match(governance,/TrustPolicyPanel projectId=\{projectId\} currentUserId=\{currentUserId\} role=\{role\}/);
  assert.match(panel,/currentUserId:string/);
  assert.match(panel,/item\.proposed_by[\s\S]{0,180}currentUserId|item\.created_by[\s\S]{0,180}currentUserId/);
  assert.match(panel,/independent review/i);
});

test("self-authored trust activation is pre-disabled in the review UI",()=>{
  const panel=fs.readFileSync(panelPath,"utf8");
  const disabled=(panel.match(/disabled=\{busy\|\|text\(item\.created_by\)===currentUserId\}/g)||[]).length;
  assert.ok(disabled>=2,"Trust Manifest and Provider Trust Profile activation must both pre-disable self-review");
  assert.match(panel,/self-authored Trust Manifest/i);
  assert.match(panel,/self-authored Provider Trust Profile/i);
});

