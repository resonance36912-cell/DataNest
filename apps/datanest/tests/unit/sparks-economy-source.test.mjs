import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(
  new URL("../../supabase/migrations/20260925024028_datanest_sparks_economy_v1.sql",import.meta.url),
  "utf8"
);
const workspace=readFileSync(
  new URL("../../src/components/SparksWorkspace.tsx",import.meta.url),
  "utf8"
);
const app=readFileSync(
  new URL("../../src/components/DataNestApp.tsx",import.meta.url),
  "utf8"
);

test("Sparks is exposed as a governed project workspace",()=>{
  assert.match(app,/label:"Sparks"/);
  assert.match(app,/view==="sparks"/);
  assert.match(workspace,/SPARKS · INTERNAL UTILITY/);
  assert.match(workspace,/Earned contribution utility, not money/);
});

test("Sparks policy closes cash, transfer and secondary-market paths",()=>{
  for(const boundary of [
    "cash_purchase_enabled",
    "cash_redemption_enabled",
    "p2p_transfer_enabled",
    "external_transfer_enabled",
    "secondary_market_enabled",
    "contribution_history_changes_on_spend"
  ]){
    assert.match(migration,new RegExp(boundary+" boolean not null default false"));
    assert.match(migration,new RegExp("check \\("+boundary+"=false\\)"));
  }
  assert.match(workspace,/cannot be bought for cash, redeemed for cash, transferred peer-to-peer, traded/);
});

test("Spark spending is reservation based and append-only",()=>{
  assert.match(migration,/request_spark_redemption_v1/);
  assert.match(migration,/'hold',-total/);
  assert.match(migration,/'hold',total/);
  assert.match(migration,/'release',-redemption\.total_sparks/);
  assert.match(migration,/'release',redemption\.total_sparks/);
  assert.match(migration,/'service_spend',-redemption\.total_sparks/);
  assert.match(migration,/for update/i);
  assert.match(workspace,/Sparks reserved/);
  assert.match(workspace,/Ledger entries are append-only/);
});

test("Spark spending does not rewrite contribution or ownership history",()=>{
  for(const fn of [
    "request_spark_redemption_v1",
    "cancel_spark_redemption_v1",
    "fulfill_spark_redemption_v1"
  ]){
    const start=migration.indexOf("create or replace function public."+fn);
    assert.notEqual(start,-1,fn+" must exist");
    const next=migration.indexOf("create or replace function",start+40);
    const body=migration.slice(start,next===-1?migration.length:next);
    assert.doesNotMatch(body,/update public\.contribution_ledger/i);
  }
  assert.match(workspace,/does not erase historical contribution points, change reputation, create legal ownership, or create a royalty entitlement/);
});

test("client uses governed Sparks RPCs instead of direct ledger writes",()=>{
  assert.match(workspace,/get_sparks_workspace_v1/);
  assert.match(workspace,/publish_spark_service_v1/);
  assert.match(workspace,/request_spark_redemption_v1/);
  assert.match(workspace,/cancel_spark_redemption_v1/);
  assert.match(workspace,/fulfill_spark_redemption_v1/);
  assert.doesNotMatch(workspace,/\.from\("spark_ledger_entries"\)\.(insert|update|delete)/);
});
