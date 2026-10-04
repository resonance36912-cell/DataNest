import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationPath=path.join(root,"supabase/migrations/20260927094000_add_portfolio_registry_governed_operations.sql");

function sql(){
  return fs.existsSync(migrationPath)?fs.readFileSync(migrationPath,"utf8"):"";
}

test("Phase B governed portfolio operations migration exists",()=>{
  assert.equal(
    fs.existsSync(migrationPath),
    true,
    "20260927094000_add_portfolio_registry_governed_operations.sql must exist"
  );
});

test("portfolio operations expose the approved governed RPC contract",()=>{
  const source=sql();
  if(!source)return;

  for(const fn of [
    "create_portfolio_item_v1",
    "propose_portfolio_classification_v1",
    "approve_portfolio_classification_v1",
    "reject_portfolio_classification_v1",
    "propose_portfolio_relationship_v1",
    "approve_portfolio_relationship_v1",
    "reject_portfolio_relationship_v1",
    "propose_portfolio_lifecycle_transition_v1",
    "approve_portfolio_lifecycle_transition_v1",
    "reject_portfolio_lifecycle_transition_v1",
    "promote_product_candidate_v1",
    "deprecate_portfolio_item_v1",
    "retire_portfolio_item_v1"
  ]){
    assert.match(source,new RegExp("create or replace function public\\."+fn+"\\(","i"));
    assert.match(source,new RegExp("revoke all on function public\\."+fn+"\\(","i"));
  }

  assert.match(source,/create_portfolio_item_v1\([\s\S]*target_project uuid[\s\S]*target_slug text[\s\S]*target_name text[\s\S]*target_kind text[\s\S]*target_lifecycle text default null[\s\S]*target_source_authority text default null[\s\S]*target_source_reference text default null[\s\S]*target_metadata jsonb default '\{\}'::jsonb/is);
  assert.match(source,/propose_portfolio_classification_v1\([\s\S]*target_item uuid[\s\S]*target_classification text[\s\S]*target_product uuid default null[\s\S]*target_rationale text default null[\s\S]*target_evidence_reference text default null/is);
  assert.match(source,/propose_portfolio_relationship_v1\([\s\S]*target_source_item uuid[\s\S]*target_target_item uuid[\s\S]*target_relationship_type text[\s\S]*target_criticality text default 'normal'/is);
  assert.match(source,/promote_product_candidate_v1\([\s\S]*target_category text[\s\S]*target_mission text[\s\S]*target_operating_model text[\s\S]*target_primary_runtime text[\s\S]*target_promotion_packet jsonb[\s\S]*target_evidence_reference text/is);
  assert.doesNotMatch(source,/promote_product_candidate_v1\([^)]*billing/is);
});

test("portfolio operation authority, audit, and graph guards fail closed",()=>{
  const source=sql();
  if(!source)return;

  assert.match(source,/security definer/ig);
  assert.match(source,/set search_path\s*=\s*public\s*,\s*private\s*,\s*auth/i);
  assert.match(source,/auth\.uid\(\)/i);
  assert.match(source,/array\['owner','admin','operator'\]/i);
  assert.match(source,/array\['owner','admin'\]/i);

  assert.match(source,/private\.portfolio_contains_path/i);
  assert.match(source,/with recursive/i);
  assert.match(source,/private\.portfolio_has_active_critical_dependants/i);
  assert.match(source,/relationship_type='depends_on'[\s\S]*criticality='critical'/i);

  assert.match(source,/source_item_id\s*=\s*target_item_id/i);
  assert.match(source,/project mismatch/i);
  assert.match(source,/classification='product_owned'[\s\S]*target_product_id/i);
  assert.match(source,/status='superseded'[\s\S]*status='active'/i);

  assert.match(source,/PORTFOLIO_ITEM_CREATED/i);
  assert.match(source,/PORTFOLIO_CLASSIFICATION_PROPOSED/i);
  assert.match(source,/PORTFOLIO_CLASSIFICATION_APPROVED/i);
  assert.match(source,/PORTFOLIO_RELATIONSHIP_PROPOSED/i);
  assert.match(source,/PORTFOLIO_RELATIONSHIP_APPROVED/i);
  assert.match(source,/PORTFOLIO_LIFECYCLE_PROPOSED/i);
  assert.match(source,/PORTFOLIO_LIFECYCLE_APPROVED/i);
  assert.match(source,/PORTFOLIO_PRODUCT_PROMOTED/i);
  assert.match(source,/PORTFOLIO_ITEM_DEPRECATED/i);
  assert.match(source,/PORTFOLIO_ITEM_RETIRED/i);
  assert.match(source,/insert into public\.events/i);
});

test("candidate promotion is evidence-backed, atomic, and billing-off",()=>{
  const source=sql();
  if(!source)return;

  assert.match(source,/item_kind\s*<>\s*'product_candidate'/i);
  assert.match(source,/independent_datanest_product/i);
  assert.match(source,/private\.validate_portfolio_promotion_packet/i);
  for(const key of [
    "problem","users","value_proposition","repeat_demand_evidence",
    "operational_owner","independent_lifecycle_justification","product_lab_evidence"
  ]){
    assert.match(source,new RegExp(key,"i"));
  }

  assert.match(source,/product_surfaces[\s\S]*portfolio_item_id[\s\S]*build_commit is not null/i);
  assert.match(source,/product_test_runs[\s\S]*surface_id/i);
  assert.match(source,/insert into public\.products[\s\S]*billing_enabled[\s\S]*false/i);
  assert.match(source,/commercial_mode[\s\S]*free promotion \/ no billing until pricing is established/i);
  assert.match(source,/insert into public\.product_records[\s\S]*promotion/i);
  assert.match(source,/update public\.portfolio_items[\s\S]*item_kind='governed_product'[\s\S]*current_lifecycle='active'/i);
});

test("governed operations are RPC-only for authenticated users",()=>{
  const source=sql();
  if(!source)return;

  assert.doesNotMatch(source,/grant\s+[^;]*(?:insert|update|delete)[^;]*on table public\.portfolio_(?:items|classifications|relationships|lifecycle_events)[^;]*to authenticated/i);
  for(const fn of [
    "create_portfolio_item_v1",
    "propose_portfolio_classification_v1",
    "approve_portfolio_classification_v1",
    "reject_portfolio_classification_v1",
    "propose_portfolio_relationship_v1",
    "approve_portfolio_relationship_v1",
    "reject_portfolio_relationship_v1",
    "propose_portfolio_lifecycle_transition_v1",
    "approve_portfolio_lifecycle_transition_v1",
    "reject_portfolio_lifecycle_transition_v1",
    "promote_product_candidate_v1",
    "deprecate_portfolio_item_v1",
    "retire_portfolio_item_v1"
  ]){
    assert.match(source,new RegExp("grant execute on function public\\."+fn+"\\([^;]+to authenticated, service_role","is"));
  }
});


test("owner/admin can reject proposed portfolio changes without changing active state",()=>{
  const source=sql();
  if(!source)return;
  for(const fn of [
    "reject_portfolio_classification_v1",
    "reject_portfolio_relationship_v1",
    "reject_portfolio_lifecycle_transition_v1"
  ]){
    assert.match(source,new RegExp("create or replace function public\\."+fn+"\\(","i"));
    assert.match(source,new RegExp("grant execute on function public\\."+fn+"\\([^;]+to authenticated, service_role","is"));
  }
  assert.match(source,/status='rejected'/i);
  assert.match(source,/Only proposed .* may be rejected/i);
});


test("Portfolio Item creation cannot fabricate governed product identity",()=>{
  const source=sql();
  if(!source)return;
  assert.match(
    source,
    /if\s+target_kind\s*=\s*'governed_product'[\s\S]*Product Registry[\s\S]*promotion workflow/i
  );
});

test("candidate promotion persists authoritative exact Product Lab evidence",()=>{
  const source=sql();
  if(!source)return;
  assert.match(source,/tr\.build_commit\s*=\s*s\.build_commit/i);
  assert.match(source,/authoritative_lab_evidence\s+jsonb/i);
  assert.match(source,/jsonb_agg[\s\S]*surface_id[\s\S]*build_commit[\s\S]*release_id[\s\S]*test_run_id/i);
  assert.match(source,/authoritative_product_lab_evidence[\s\S]*authoritative_lab_evidence/i);
});
