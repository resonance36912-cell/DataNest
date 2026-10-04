import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const lib=()=>fs.readFileSync(path.join(root,"src/lib/executionAuthority.ts"),"utf8");
const panel=()=>fs.readFileSync(path.join(root,"src/components/ExecutionAuthorityPanel.tsx"),"utf8");
const governance=()=>fs.readFileSync(path.join(root,"src/components/GovernanceWorkspace.tsx"),"utf8");
const app=()=>fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");

test("presentation vocabulary exposes canonical consequence routes and breaker states separately from legacy operations",()=>{
  const source=lib();
  assert.match(source,/export type ConsequenceClass=/);
  for(const value of [
    "read_only","advisory","preparatory","reversible_write","external_communication",
    "externally_visible_change","resource_execution","production_change","destructive",
    "legal_commitment","financial_commitment","ownership_or_governance","constitutional"
  ]) assert.match(source,new RegExp(value));
  assert.match(source,/authorityRouteKeys[\s\S]{0,100}"external_ai_provider"[\s\S]{0,80}"job_start"/);
  assert.match(source,/breakerCategories[\s\S]{0,120}"autonomous_writes"[\s\S]{0,100}"external_communications"[\s\S]{0,100}"deployments"[\s\S]{0,100}"resource_execution"/);
  assert.match(source,/export type ExecutionCircuitBreakerState="enabled"\|"paused"\|"blocked"/);
});

test("shared panel reads canonical workspace and uses only V2 canonical mutation RPCs",()=>{
  const source=panel();
  for(const fn of [
    "get_authority_execution_workspace_v1","propose_authority_envelope_v2","approve_authority_envelope_v2",
    "activate_authority_envelope_v2","reject_authority_envelope_v2","pause_authority_envelope_v2",
    "revoke_authority_envelope_v2","record_exact_action_approval_v1","issue_capability_lease_v2",
    "pause_capability_lease_v1","revoke_capability_lease_v1","set_execution_circuit_breaker_v2",
    "set_authority_execution_route_mode_v1"
  ]) assert.match(source,new RegExp(fn));
  assert.doesNotMatch(source,/rpc\("propose_authority_envelope_v1"/);
  assert.doesNotMatch(source,/rpc\("issue_capability_lease_v1"/);
  assert.doesNotMatch(source,/rpc\("set_execution_circuit_breaker_v1"/);
});

test("canonical panel exposes consequence scope route modes exact approvals and non-authorizing lease states",()=>{
  const source=panel();
  assert.match(source,/Allowed consequence classes/i);
  assert.match(source,/Route enforcement/i);
  assert.match(source,/Report only/i);
  assert.match(source,/Enforced/i);
  assert.match(source,/Exact-action approval/i);
  assert.match(source,/expired|revoked|exhausted/i);
  assert.match(source,/Capacity reservation ≠ authorization lease/);
  assert.match(source,/AVAILABLE does not mean authorized/i);
  assert.doesNotMatch(source,/maxCostMinor|max_cost_minor|Max cost minor/i);
});

test("panel does not expose credential or destructive legal financial executors",()=>{
  const source=panel();
  assert.doesNotMatch(source,/API key|Password|Secret value|Access token|Refresh token/);
  assert.doesNotMatch(source,/Delete production|Execute legal commitment|Execute financial commitment|Transfer ownership/);
  assert.match(source,/A4[\s\S]*exact-action/i);
});

test("Governance preserves Authority and Execution while supporting additional deep-linkable governed sections",()=>{
  const source=governance();
  assert.match(source,/ExecutionAuthorityPanel/);
  assert.match(source,/useState<"sovereign"\|"trust"\|"authority"\|"improvement"\|"release">/);
  assert.match(source,/requested==="authority"/);
  assert.match(source,/searchParams\.set\("section","authority"\)/);
  assert.match(source,/>Authority & Execution<\/button>/);
  assert.match(source,/section==="authority"[\s\S]*ExecutionAuthorityPanel/);
  assert.match(source,/requested==="improvement"/);
  assert.match(source,/searchParams\.set\("section","improvement"\)/);
  assert.match(source,/>Learning & Improvement<\/button>/);
  assert.match(source,/requested==="release"/);
  assert.match(source,/searchParams\.set\("section","release"\)/);
  assert.match(source,/>Production Evidence<\/button>/);
  assert.match(source,/section==="release"[\s\S]*GovernanceReleaseEvidencePanel/);
  assert.match(source,/return "sovereign"|\?"release":"sovereign"/);
});

test("TranScheduler preserves its operational Authority mode and loads read-only job authority summaries",()=>{
  const source=app();
  assert.match(source,/type SchedulerViewMode = "queue"\|"gantt"\|"authority"\|"resources"/);
  assert.match(source,/useState<SchedulerViewMode>\("gantt"\)/);
  assert.match(source,/get_job_execution_authority_summary_v1/);
  assert.match(source,/Authority not evaluated/);
  assert.match(source,/Report only/);
  assert.match(source,/Ready for authority check/);
  assert.match(source,/Approval required/);
  assert.match(source,/Lease missing|Lease expired/);
  assert.match(source,/Paused by policy|Blocked by policy/);
});

test("scheduler never derives Authorized from capability availability",()=>{
  const source=app();
  assert.doesNotMatch(source,/state==="AVAILABLE"[\s\S]{0,180}"Authorized"/);
  assert.match(source,/decision_outcome[\s\S]*allow|readiness[\s\S]*authorized/i);
});

test("viewer operator and owner/admin UI gates are explicit",()=>{
  const source=panel();
  assert.match(source,/canProposeExecutionAuthority\(role\)/);
  assert.match(source,/canApprove=canApproveExecutionAuthority\(role\)/);
  assert.match(source,/canControl=canManageCircuitBreakers\(role\)/);
  assert.match(source,/role==="operator"/);
});
