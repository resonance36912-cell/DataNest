import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationPath=path.join(root,"supabase/migrations/20260927093000_add_portfolio_registry_foundations.sql");

test("Phase B portfolio registry foundation migration exists",()=>{
  assert.equal(
    fs.existsSync(migrationPath),
    true,
    "20260927093000_add_portfolio_registry_foundations.sql must exist"
  );
});

test("portfolio registry schema pins the approved identity, lifecycle, relationship, and Product Lab contract",()=>{
  if(!fs.existsSync(migrationPath))return;
  const sql=fs.readFileSync(migrationPath,"utf8");

  assert.match(sql,/create table public\.portfolio_items/i);
  assert.match(sql,/item_kind[\s\S]*governed_product[\s\S]*product_candidate[\s\S]*application[\s\S]*module[\s\S]*capability[\s\S]*external_capability/i);
  assert.match(sql,/review_state[\s\S]*pending_review[\s\S]*classified[\s\S]*deprecated[\s\S]*retired/i);
  assert.match(sql,/current_lifecycle[\s\S]*concept[\s\S]*experiment[\s\S]*validating[\s\S]*candidate[\s\S]*active[\s\S]*maintained[\s\S]*deprecated[\s\S]*retired/i);

  assert.match(sql,/create table public\.portfolio_classifications/i);
  assert.match(sql,/classification[\s\S]*product_owned[\s\S]*shared_datanest_capability[\s\S]*independent_datanest_product[\s\S]*registered_external_capability/i);
  assert.match(sql,/status[\s\S]*proposed[\s\S]*active[\s\S]*superseded[\s\S]*rejected/i);

  assert.match(sql,/create table public\.portfolio_relationships/i);
  assert.match(sql,/relationship_type[\s\S]*contains[\s\S]*uses[\s\S]*provides[\s\S]*depends_on[\s\S]*replaces[\s\S]*supersedes[\s\S]*integrates_with[\s\S]*derived_from/i);
  assert.match(sql,/criticality[\s\S]*optional[\s\S]*normal[\s\S]*critical/i);

  assert.match(sql,/create table public\.portfolio_lifecycle_events/i);
  assert.match(sql,/status[\s\S]*proposed[\s\S]*approved[\s\S]*rejected/i);

  assert.match(sql,/unique\s*\(project_id\s*,\s*slug\)/i);
  assert.match(sql,/unique index[\s\S]*linked_product_id[\s\S]*where linked_product_id is not null/i);
  assert.match(sql,/unique index[\s\S]*source_authority[\s\S]*source_reference[\s\S]*where source_reference is not null/i);
  assert.match(sql,/unique index[\s\S]*portfolio_classifications[\s\S]*portfolio_item_id[\s\S]*where status='active'/i);

  assert.match(sql,/alter table public\.product_surfaces[\s\S]*add column if not exists portfolio_item_id uuid/i);
  assert.doesNotMatch(sql,/portfolio_item_id uuid references public\.portfolio_items\(id\)/i);
  assert.match(sql,/create unique index portfolio_items_id_project_unique_idx[\s\S]*on public\.portfolio_items\(id,project_id\)/i);
  assert.match(sql,/add constraint product_surfaces_portfolio_item_project_fkey[\s\S]*foreign key\s*\(portfolio_item_id,project_id\)[\s\S]*references public\.portfolio_items\(id,project_id\)[\s\S]*on delete set null\s*\(portfolio_item_id\)/i);
  assert.match(sql,/create index[\s\S]*product_surfaces[\s\S]*portfolio_item_id/i);

  assert.match(sql,/create (or replace )?view public\.portfolio_registry_view[\s\S]*security_invoker\s*=\s*true/i);

  for(const table of ["portfolio_items","portfolio_classifications","portfolio_relationships","portfolio_lifecycle_events"]){
    assert.match(sql,new RegExp("alter table public\\."+table+" enable row level security","i"));
  }

  assert.match(sql,/private\.is_project_stakeholder\(project_id\)[\s\S]*private\.is_project_member\(project_id\)/i);
  assert.doesNotMatch(sql,/grant\s+[^;]*(?:insert|update|delete)[^;]*on table public\.portfolio_(?:items|classifications|relationships|lifecycle_events)[^;]*to authenticated/i);
  assert.match(sql,/grant select on table public\.portfolio_items to authenticated/i);
  assert.match(sql,/grant select on table public\.portfolio_classifications to authenticated/i);
  assert.match(sql,/grant select on table public\.portfolio_relationships to authenticated/i);
  assert.match(sql,/grant select on table public\.portfolio_lifecycle_events to authenticated/i);
  assert.match(sql,/service_role/i);
});

test("portfolio registry foundation indexes every new foreign-key column",()=>{
  if(!fs.existsSync(migrationPath))return;
  const sql=fs.readFileSync(migrationPath,"utf8");
  for(const token of [
    "portfolio_items_project_idx",
    "portfolio_items_id_project_unique_idx",
    "portfolio_items_linked_product_idx",
    "portfolio_classifications_project_idx",
    "portfolio_classifications_item_idx",
    "portfolio_classifications_target_product_idx",
    "portfolio_relationships_project_idx",
    "portfolio_relationships_source_idx",
    "portfolio_relationships_target_idx",
    "portfolio_lifecycle_events_project_idx",
    "portfolio_lifecycle_events_item_idx",
    "portfolio_items_created_by_idx",
    "portfolio_classifications_proposed_by_idx",
    "portfolio_classifications_approved_by_idx",
    "portfolio_relationships_proposed_by_idx",
    "portfolio_relationships_approved_by_idx",
    "portfolio_lifecycle_events_proposed_by_idx",
    "portfolio_lifecycle_events_approved_by_idx",
    "product_surfaces_portfolio_item_idx"
  ]){
    assert.match(sql,new RegExp(token,"i"));
  }
});
