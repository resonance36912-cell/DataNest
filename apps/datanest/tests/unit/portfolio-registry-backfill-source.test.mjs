import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationPath=path.join(root,"supabase/migrations/20260927095000_backfill_portfolio_registry_baseline.sql");
const importPath=path.join(root,"data/imports/ronsas-product-20260926.jsonl");

function migration(){
  return fs.existsSync(migrationPath)?fs.readFileSync(migrationPath,"utf8"):"";
}

test("Phase B RONSAS portfolio backfill migration exists",()=>{
  assert.equal(
    fs.existsSync(migrationPath),
    true,
    "20260927095000_backfill_portfolio_registry_baseline.sql must exist"
  );
});

test("RONSAS baseline reuses the governed product and preserves billing state",()=>{
  const sql=migration();
  if(!sql)return;

  assert.match(sql,/from public\.products[\s\S]*slug='ronsas'/i);
  assert.match(sql,/project_members[\s\S]*role='owner'[\s\S]*status='active'/i);
  assert.match(sql,/active project owner/i);

  assert.match(sql,/item_kind[\s\S]*'governed_product'/i);
  assert.match(sql,/review_state[\s\S]*'classified'/i);
  assert.match(sql,/current_lifecycle[\s\S]*'active'/i);
  assert.match(sql,/linked_product_id/i);
  assert.match(sql,/independent_datanest_product/i);

  assert.doesNotMatch(sql,/update\s+public\.products[\s\S]{0,400}billing_enabled/i);
  assert.doesNotMatch(sql,/update\s+public\.products[\s\S]{0,400}commercial_mode/i);
});

test("historical RONSAS applications become pending-review identities with provenance only",()=>{
  const sql=migration();
  if(!sql)return;

  assert.match(sql,/from public\.product_records\s+pr[\s\S]*record_type='application'/i);
  assert.match(sql,/item_kind[\s\S]*'application'/i);
  assert.match(sql,/review_state[\s\S]*'pending_review'/i);
  assert.match(sql,/linked_product_id[\s\S]*null/i);
  assert.match(sql,/current_lifecycle[\s\S]*null/i);
  assert.match(sql,/source_authority[\s\S]*'product_records'/i);
  assert.match(sql,/source_reference[\s\S]*(?:pr|app)\.id::text/i);
  assert.match(sql,/historical_catalog/i);
  assert.match(sql,/payload->>'ownership'/i);
  assert.doesNotMatch(sql,/insert into public\.portfolio_classifications[\s\S]{0,1000}product_owned/i);
  assert.match(sql,/on conflict/i);
  assert.match(sql,/substr\(replace\((?:pr|app)\.id::text,'-',''\),1,8\)/i);
});

test("current RONSAS import snapshot has ten governed applications under DataNest authority",()=>{
  const rows=fs.readFileSync(importPath,"utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line=>JSON.parse(line));
  const apps=rows.filter(row=>row.record_type==="application");

  assert.equal(apps.length,10);
  assert.deepEqual(
    apps.map(row=>row.name).sort(),
    [
      "Career Compass",
      "Creative Studio",
      "LyricSync Studio",
      "RONS Control Center",
      "Resonance AppDev / Reson8 ADT",
      "Scene Song Spark",
      "SovereignForge",
      "Sync Vision",
      "YouTube Optimizer",
      "ePublisher"
    ].sort()
  );
  assert.equal(apps.every(row=>row.ownership==="RONSAS"),true);
});

test("baseline backfill writes attributable portfolio audit evidence without inferring application ownership",()=>{
  const sql=migration();
  if(!sql)return;
  assert.match(sql,/PORTFOLIO_BASELINE_RONSAS_BACKFILLED/i);
  assert.match(sql,/PORTFOLIO_BASELINE_APPLICATION_REGISTERED/i);
  assert.match(sql,/insert into public\.events/i);
  assert.doesNotMatch(sql,/relationship_type[\s\S]{0,300}'contains'/i);
});


test("RONSAS baseline is scoped to the canonical Resonance DataNest project",()=>{
  const sql=migration();
  if(!sql)return;
  assert.match(sql,/join\s+public\.projects\s+[a-z]+\s+on\s+[a-z]+\.id\s*=\s*[a-z]+\.project_id/is);
  assert.match(sql,/projects[\s\S]*slug='resonance-datanest'/i);
  assert.doesNotMatch(sql,/from\s+public\.products\s*\n\s*where\s+slug='ronsas'[\s\S]*limit\s+1/i);
});
