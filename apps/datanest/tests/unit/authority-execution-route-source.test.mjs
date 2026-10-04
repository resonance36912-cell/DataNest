import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationPath=path.join(root,"supabase/migrations/20260927125000_add_phase_d_authority_route_adapters.sql");
const aiPath=path.join(root,"supabase/functions/datanest-ai-chat/index.ts");
function migration(){return fs.readFileSync(migrationPath,"utf8");}
function ai(){return fs.readFileSync(aiPath,"utf8");}

test("Phase D route adapter migration exists without rewriting historical job transitions",()=>{
  assert.equal(fs.existsSync(migrationPath),true);
  const source=migration();
  assert.match(source,/create or replace function public\.transition_job_status\(/i);
  assert.doesNotMatch(source,/drop function[\s\S]*transition_job_status/i);
});

test("RESERVED to RUNNING alone evaluates canonical job_start authority",()=>{
  const source=migration();
  assert.match(source,/current_job\.status='RESERVED'[\s\S]*normalized='RUNNING'/i);
  assert.match(source,/private\.authority_evaluate_execution_v1\(/i);
  assert.match(source,/'job_start'/i);
  assert.match(source,/'resource_execution'/i);
  assert.match(source,/'A3'/i);
  assert.match(source,/'human'/i);
  assert.match(source,/'user:'\|\|caller::text/i);
  assert.match(source,/jsonb_array_elements_text\(coalesce\(current_job\.required_capabilities,'\[\]'::jsonb\)\)/i);
  assert.match(source,/true\s*,\s*true[\s\n]*\)/i);
});

test("job_start only blocks on enforced non-allow and preserves report-only behavior",()=>{
  const source=migration();
  assert.match(source,/authority_decision->>'enforcement_mode'='enforced'/i);
  assert.match(source,/authority_decision->>'outcome'<>'allow'/i);
  assert.match(source,/raise exception[\s\S]{0,240}authority/i);
  assert.match(source,/update public\.jobs[\s\S]*set status=normalized/i);
});

test("transition adapter preserves existing human role check and all state-machine transitions",()=>{
  const source=migration();
  assert.match(source,/security definer/i);
  assert.match(source,/set search_path\s*=\s*public,\s*private,\s*auth/i);
  assert.match(source,/caller uuid:=auth\.uid\(\)/i);
  assert.match(source,/private\.has_project_role\(current_job\.project_id,\s*array\['owner','admin','operator'\]\)/i);
  for(const fragment of [
    "when 'PLANNED' then normalized in ('READY','PAUSED','CANCELLED')",
    "when 'READY' then normalized in ('QUEUED','PAUSED','CANCELLED')",
    "when 'QUEUED' then normalized in ('MATCHING','PAUSED','CANCELLED')",
    "when 'MATCHING' then normalized in ('RESERVED','PAUSED','CANCELLED')",
    "when 'RESERVED' then normalized in ('RUNNING','PAUSED','CANCELLED')",
    "when 'RUNNING' then normalized in ('VERIFYING','COMPLETED','PAUSED','CANCELLED','FAILED')"
  ]) assert.ok(source.includes(fragment),fragment);
  assert.match(source,/revoke all on function public\.transition_job_status\(uuid,text\) from public,anon/i);
  assert.match(source,/grant execute on function public\.transition_job_status\(uuid,text\) to authenticated/i);
});

test("job_start adapter never manufactures envelopes or leases",()=>{
  const source=migration();
  assert.doesNotMatch(source,/insert into public\.authority_envelopes/i);
  assert.doesNotMatch(source,/insert into public\.capability_leases/i);
  assert.doesNotMatch(source,/propose_authority_envelope/i);
  assert.doesNotMatch(source,/issue_capability_lease/i);
});

test("external provider route evaluates Phase D after Phase C and before existing provider authorization",()=>{
  const source=ai();
  const phaseC=source.indexOf('"service_evaluate_data_policy_v1"',source.indexOf("callProvider:async"));
  const phaseD=source.indexOf('"service_evaluate_execution_authority_v1"',phaseC);
  const providerAuth=source.indexOf('"service_authorize_ai_request"',phaseD);
  const providerCall=source.indexOf("callOpenAiCompatibleProvider({",providerAuth);
  assert.ok(phaseC>=0,"Phase C evaluator must run");
  assert.ok(phaseD>phaseC,"Phase D evaluator must follow Phase C");
  assert.ok(providerAuth>phaseD,"existing provider authorization must remain after Phase D");
  assert.ok(providerCall>providerAuth,"provider call must remain after all gates");
});

test("external provider Phase D request uses canonical route actor capability target and Phase C decision",()=>{
  const source=ai();
  assert.match(source,/target_route_key:"external_ai_provider"/);
  assert.match(source,/target_actor_type:"service"/);
  assert.match(source,/target_actor_reference:"service:datanest-ai"/);
  assert.match(source,/target_requesting_user:user\.id/);
  assert.match(source,/target_job:job\.id/);
  assert.match(source,/target_operation:"external_provider_call"/);
  assert.match(source,/target_consequence_class:"resource_execution"/);
  assert.match(source,/target_requested_autonomy:"A3"/);
  assert.match(source,/target_capability_keys:\["external_ai:"\+providerKey\]/);
  assert.match(source,/target_target_type:"provider"/);
  assert.match(source,/target_target_reference:providerKey/);
  assert.match(source,/target_phase_c_decision:[^,\n]*phaseCPolicy[^,\n]*decision_record_id/);
  assert.match(source,/target_provider_request:activeRequestId/);
  assert.match(source,/target_require_reservation:false/);
  assert.match(source,/target_consume_operation:true/);
});

test("Phase D enforced denial prevents provider authorization and falls back to embedded response",()=>{
  const source=ai();
  assert.match(source,/phaseDAuthorityEnforced[\s\S]*String\(phaseDAuthority\.outcome\|\|"deny"\)!=="allow"/);
  assert.match(source,/execution_authority_denied/);
  const phaseDGuard=source.indexOf("phaseDAuthorityEnforced");
  const providerAuth=source.indexOf('"service_authorize_ai_request"',phaseDGuard);
  assert.ok(providerAuth>phaseDGuard);
  assert.match(source,/embeddedResponse\(job,message,productMode,jurisdiction,clientTimeZone\)/);
});

test("Phase D report-only never bypasses the existing provider authorization decision",()=>{
  const source=ai();
  assert.match(source,/String\(phaseDAuthority\.enforcement_mode\|\|"report_only"\)==="enforced"/);
  assert.match(source,/service_authorize_ai_request/);
  assert.match(source,/Boolean\(\(authz as Record<string,unknown>\|null\)\?\.allowed\)/);
});

test("external route never auto-creates authority records",()=>{
  const source=ai();
  assert.doesNotMatch(source,/propose_authority_envelope_v2/);
  assert.doesNotMatch(source,/issue_capability_lease_v2/);
  assert.doesNotMatch(source,/insert\([^\n]*authority_envelopes/i);
});
