import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260925000530_datanest_stakeholder_contribution_v1.sql", import.meta.url),
  "utf8"
);
const app = readFileSync(new URL("../../src/components/DataNestApp.tsx", import.meta.url),"utf8");
const workspace = readFileSync(new URL("../../src/components/StakeholderWorkspace.tsx", import.meta.url),"utf8");

test("stakeholder contribution pipeline is gated and versioned",()=>{
  for(const stage of ["verified","accepted","scored","certified","minted","snapshot_eligible"]){
    assert.match(migration,new RegExp("'"+stage+"'"));
  }
  assert.match(migration,/model_version text not null/);
  assert.match(migration,/score_version integer not null/);
  assert.match(migration,/A stakeholder cannot verify their own contribution/);
  assert.match(migration,/A stakeholder cannot accept their own contribution/);
  assert.match(migration,/A stakeholder cannot score their own contribution/);
  assert.match(migration,/A stakeholder cannot certify their own contribution/);
  assert.match(migration,/A stakeholder cannot mint Sparks for their own contribution/);
});

test("Sparks are append-only and separate from royalty or ownership semantics",()=>{
  assert.match(migration,/prevent_spark_ledger_mutation/);
  assert.match(migration,/Spark ledger entries are append-only/);
  assert.match(migration,/'contribution_share_is_legal_ownership',false/);
  assert.match(migration,/'sparks_are_royalty_entitlement',false/);
  assert.match(migration,/'royalties_are_separate',true/);
  assert.doesNotMatch(migration,/royalties_payable/i);
});

test("scoring is impact-first rather than activity-first",()=>{
  assert.match(migration,/impact_weight numeric not null default 0\.70/);
  assert.match(migration,/quality_weight numeric not null default 0\.15/);
  assert.match(migration,/delivery_weight numeric not null default 0\.10/);
  assert.match(migration,/resource_weight numeric not null default 0\.05/);
  assert.match(migration,/'raw_time_is_not_score',true/);
  assert.match(migration,/'raw_ai_usage_is_not_score',true/);
});

test("stakeholder UI exposes simple and detailed views without restoring retired capacity UI",()=>{
  assert.match(app,/label:"Stakeholder"/);
  assert.match(workspace,/Simple UI/);
  assert.match(workspace,/Detailed UI/);
  assert.match(workspace,/Contribution share/);
  assert.match(workspace,/Not legal ownership/);
  assert.doesNotMatch(workspace,/Operations Capabilities/);
});


test("external AI import propagates the authoritative staged session to DataNest AI",()=>{
  const sidebar = readFileSync(new URL("../../src/components/ExternalAiSidebar.tsx", import.meta.url),"utf8");
  const aiWorkspace = readFileSync(new URL("../../src/components/DataNestAiWorkspace.tsx", import.meta.url),"utf8");
  assert.match(sidebar,/sessionId:stagedSessionId/);
  assert.match(aiWorkspace,/stagedSessionId&&stagedSessionId!==sessionId/);
  assert.match(aiWorkspace,/setSessionId\(stagedSessionId\)/);
});


test("Stakeholder workspace hotfix removes ambiguous model_version references",()=>{
  const hotfix=readFileSync(
    new URL("../../supabase/migrations/20260925020254_fix_contribution_workspace_model_version_ambiguity.sql", import.meta.url),
    "utf8"
  );
  assert.match(hotfix,/active_scoring_model_version text/);
  assert.match(hotfix,/select csm\.model_version into active_scoring_model_version/);
  assert.doesNotMatch(hotfix,/select model_version into model_version/);
  assert.match(hotfix,/'scoring_model_version',active_scoring_model_version/);
});
