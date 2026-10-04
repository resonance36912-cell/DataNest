import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(
  new URL("../../supabase/migrations/20260925053442_datanest_sovereign_governance_v1.sql",import.meta.url),
  "utf8"
);
const workspace=readFileSync(
  new URL("../../src/components/GovernanceWorkspace.tsx",import.meta.url),
  "utf8"
);
const app=readFileSync(
  new URL("../../src/components/DataNestApp.tsx",import.meta.url),
  "utf8"
);

test("Sovereign Governance is exposed as a project workspace",()=>{
  assert.match(app,/label:"Governance"/);
  assert.match(app,/view==="governance"/);
  assert.match(workspace,/RESONANCE SOVEREIGN GOVERNANCE/);
  assert.match(workspace,/<h2>Project governance<\/h2>/);
});

test("migration does not silently pre-ratify a human governance protocol",()=>{
  assert.doesNotMatch(
    migration,
    /insert into public\.governance_protocol_versions[\s\S]{0,1200}'ratified'/i
  );
  assert.match(workspace,/No human-ratified protocol/);
  assert.match(workspace,/has not invented mission, vision or governance text on your behalf/);
});

test("formal votes are unweighted by Sparks or reputation",()=>{
  assert.match(migration,/vote_weight numeric not null default 1 check \(vote_weight=1\)/);
  assert.match(migration,/'vote_weighting','one_active_member_one_vote'/);
  assert.match(migration,/'sparks_weight',false/);
  assert.match(migration,/'reputation_weight',false/);
  assert.match(workspace,/Formal vote basis/);
});

test("proposal acceptance requires independent support",()=>{
  assert.match(migration,/user_id<>proposal\.proposed_by and choice='support'/);
  assert.match(migration,/support_count>oppose_count and independent_support/);
  assert.match(migration,/outcome='accepted'[\s\S]{0,500}independent_support=true/);
  assert.match(workspace,/independent support/i);
});

test("governance cannot grant economic, legal or role authority",()=>{
  for(const boundary of [
    "contractual_effect",
    "ownership_effect",
    "financial_authority_effect",
    "role_authority_effect"
  ]){
    assert.match(migration,new RegExp(boundary+" boolean not null default false check \\("+boundary+"=false\\)"));
  }
  assert.doesNotMatch(migration,/update public\.project_members/i);
  assert.doesNotMatch(migration,/insert into public\.project_members/i);
  assert.doesNotMatch(migration,/update public\.contribution_ledger/i);
  assert.doesNotMatch(migration,/insert into public\.spark_ledger_entries/i);
  assert.match(workspace,/do not amend signed agreements, create legal ownership, create royalty entitlements, grant project roles or create financial authority/);
});

test("dispute resolution preserves source governance records",()=>{
  assert.match(migration,/source_record_mutated boolean not null default false check \(source_record_mutated=false\)/);
  assert.match(migration,/A stakeholder cannot resolve their own governance dispute/);
  const start=migration.indexOf("create or replace function public.resolve_governance_dispute_v1");
  const next=migration.indexOf("create or replace function public.get_governance_workspace_v1",start);
  const body=migration.slice(start,next);
  assert.doesNotMatch(body,/update public\.governance_decisions/i);
  assert.doesNotMatch(body,/update public\.governance_protocol_versions/i);
  assert.match(workspace,/source history was not rewritten/);
});

test("client uses governed governance RPCs",()=>{
  for(const rpc of [
    "get_governance_workspace_v1",
    "create_governance_protocol_draft_v1",
    "create_governance_proposal_v1",
    "cast_governance_vote_v1",
    "close_governance_proposal_v1",
    "ratify_governance_protocol_v1",
    "file_governance_dispute_v1",
    "resolve_governance_dispute_v1"
  ]) assert.match(workspace,new RegExp(rpc));
  assert.doesNotMatch(workspace,/\.from\("governance_[^"]+"\)\.(insert|update|delete)/);
});
