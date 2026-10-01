import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const files=[
  "supabase/migrations/20261001140000_resonance_certification_service_offering.sql",
  "supabase/migrations/20261001153000_certification_business_intake_and_pricing.sql",
  "supabase/migrations/20261001162000_certification_bank_transfer_business_payments.sql"
];

test("RCS public tables remain explicitly exposed and RLS-protected",()=>{
  for(const file of files){
    const sql=fs.readFileSync(file,"utf8");
    for(const table of [
      "resonance_certification_credentials",
      "certification_service_requests",
      "certification_service_invoices"
    ]){
      if(!sql.includes(`create table if not exists public.${table}`)) continue;
      assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`),file);
      assert.match(sql,new RegExp(`revoke all on table public\\.${table} from anon,authenticated`),file);
      assert.match(sql,new RegExp(`grant (?:select|select,insert) on table public\\.${table} to authenticated`),file);
    }
  }
});

test("RCS SECURITY DEFINER functions explicitly revoke public/anon execution",()=>{
  const combined=files.map(file=>fs.readFileSync(file,"utf8")).join("\n");
  const functionNames=[
    "create_certification_service_request_v1",
    "create_certification_service_request_v2",
    "create_certification_service_invoice_v1",
    "record_certification_service_payment_v1",
    "issue_resonance_certification_v1",
    "set_resonance_certification_status_v1"
  ];
  for(const name of functionNames){
    if(!combined.includes(`create or replace function public.${name}`)) continue;
    assert.match(
      combined,
      new RegExp(`revoke all on function public\\.${name}\\(`),
      name
    );
  }
});
