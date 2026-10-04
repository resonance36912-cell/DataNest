import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateAuditDraft } from "../../supabase/functions/_shared/externalAuditAnalysis.ts";

const analysis=fs.readFileSync("supabase/functions/_shared/externalAuditAnalysis.ts","utf8");
const fetchSource=fs.readFileSync("supabase/functions/_shared/externalAuditFetch.ts","utf8");
const api=fs.readFileSync("supabase/functions/external-audit/index.ts","utf8");
const hardening=fs.readFileSync("supabase/migrations/20260929090134_external_audit_release_hardening.sql","utf8");

test("audit analysis rejects unknown source and criterion identities",()=>{
  assert.match(analysis,/invalid_criterion_id/);
  assert.match(analysis,/invalid_evidence_id/);
});

test("unsupported findings are downgraded to inference",()=>{
  assert.match(analysis,/evidenceIds\.length===0[\s\S]*?"inferred"/);
});

test("source acquisition blocks unsafe URL classes and redirects",()=>{
  assert.match(fetchSource,/https_required/);
  assert.match(fetchSource,/private_or_local_host_rejected/);
  assert.match(fetchSource,/ipv6_literal_rejected/);
  assert.match(fetchSource,/private_dns_resolution_rejected/);
  assert.match(fetchSource,/a===100&&b>=64&&b<=127/);
  assert.match(fetchSource,/\^fe\[89ab\]/);
  assert.match(fetchSource,/redirect:"manual"/);
  assert.match(fetchSource,/source_too_large/);
});

test("snapshot validation failures are recorded as coverage gaps",()=>{
  assert.match(api,/if\(action==="snapshot"\)[\s\S]*?try\{[\s\S]*?validatePublicSourceUrl\(raw\)[\s\S]*?coverageGap:true/);
});

test("audit AI retry is safe around ambiguous provider calls",()=>{
  assert.match(api,/priorStatus==="pending"&&!providerCalled/);
  assert.match(api,/ai_request_requires_reconciliation/);
  assert.match(api,/target_status:"denied"/);
  assert.match(api,/service_finish_ai_request/);
});

test("authenticated assessment creation can append its governed event atomically",()=>{
  assert.match(hardening,/create or replace function public\.create_external_audit_v1[\s\S]*?security definer/);
  assert.match(hardening,/Authentication is required/);
  assert.match(hardening,/insert into public\.external_audit_events/);
  assert.match(hardening,/external_audit_assessment_identity_guard/);
});


test("non-numeric provider confidence is normalized to a finite value",()=>{
  const draft=validateAuditDraft({
    summary:"test",
    limitations:[],
    findings:[{
      criterionId:"ISO 19011",
      evidenceIds:["11111111-1111-4111-8111-111111111111"],
      observation:"Observed test condition.",
      limitation:null,
      claimKind:"observed",
      severity:"info",
      confidence:"unknown",
      draftAction:null
    }]
  },{
    sourceIds:["11111111-1111-4111-8111-111111111111"],
    criterionIds:["ISO 19011"]
  });
  assert.equal(Number.isFinite(draft.findings[0].confidence),true);
  assert.equal(draft.findings[0].confidence,0);
});
