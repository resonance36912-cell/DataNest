import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const libPath=path.join(root,"src/lib/executionAuthority.ts");
const panelPath=path.join(root,"src/components/ExecutionAuthorityPanel.tsx");
const appPath=path.join(root,"src/components/DataNestApp.tsx");

test("shared authority types retain A0-A4 and legacy operation vocabulary while adding canonical consequence classes",()=>{
  const source=fs.readFileSync(libPath,"utf8");
  for(const token of [
    "AutonomyLevel","ExecutionOperation","ConsequenceClass","AuthorityEnvelopeState",
    "CapabilityLeaseState","ExecutionCircuitBreakerCategory","ExecutionCircuitBreakerState",
    "ExecutionAuthorityRole","canProposeExecutionAuthority","canApproveExecutionAuthority","canManageCircuitBreakers"
  ]) assert.match(source,new RegExp(token));
  for(const level of ["A0","A1","A2","A3","A4"])assert.match(source,new RegExp(level));
  for(const consequence of ["read_only","advisory","preparatory","reversible_write","resource_execution","production_change"])assert.match(source,new RegExp(consequence));
});

test("Authority & Execution panel reads canonical workspace and mutates only through governed RPCs",()=>{
  assert.equal(fs.existsSync(panelPath),true,"ExecutionAuthorityPanel must exist");
  const source=fs.readFileSync(panelPath,"utf8");
  for(const fn of [
    "get_authority_execution_workspace_v1","propose_authority_envelope_v2","approve_authority_envelope_v2",
    "activate_authority_envelope_v2","reject_authority_envelope_v2","revoke_authority_envelope_v2",
    "issue_capability_lease_v2","pause_capability_lease_v1","revoke_capability_lease_v1",
    "set_execution_circuit_breaker_v2","set_authority_execution_route_mode_v1"
  ])assert.match(source,new RegExp(fn));
  assert.doesNotMatch(source,/from\("(?:authority_envelopes|capability_leases|execution_circuit_breakers|execution_authority_decisions)"\)\.(?:insert|update|delete)/);
});

test("UI keeps authorization capacity and A4 boundaries explicit",()=>{
  const source=fs.readFileSync(panelPath,"utf8");
  assert.match(source,/Capacity reservation ≠ authorization lease/);
  assert.match(source,/AVAILABLE does not mean authorized/);
  assert.match(source,/Authority Envelopes do not store credentials/);
  assert.match(source,/A4 is human-gated/);
  assert.match(source,/exact-action/i);
  assert.match(source,/Circuit breakers/i);
  assert.doesNotMatch(source,/API key|Password|Secret value|Access token|Refresh token/);
});

test("UI role-gates proposal approval leases route modes and circuit breakers",()=>{
  const source=fs.readFileSync(panelPath,"utf8");
  assert.match(source,/canProposeExecutionAuthority\(role\)/);
  assert.match(source,/canApproveExecutionAuthority\(role\)/);
  assert.match(source,/canManageCircuitBreakers\(role\)/);
  assert.match(source,/Owner \/ admin/);
  assert.match(source,/role==="operator"\?autonomyLevels\.filter\(level=>level!=="A4"\):autonomyLevels/);
  assert.match(source,/set_authority_execution_route_mode_v1/);
});

test("TranScheduler keeps Gantt default and Authority & Execution as a sibling mode",()=>{
  const source=fs.readFileSync(appPath,"utf8");
  assert.match(source,/type SchedulerViewMode = "queue"\|"gantt"\|"authority"\|"resources"/);
  assert.match(source,/useState<SchedulerViewMode>\("gantt"\)/);
  assert.match(source,/>Queue<\/button>/);
  assert.match(source,/>Gantt chart<\/button>/);
  assert.match(source,/>Authority & Execution<\/button>/);
  assert.match(source,/viewMode==="authority"[\s\S]*ExecutionAuthorityPanel/);
  assert.match(source,/role=\{membership\?\.role\|\|"viewer"\}/);
});

test("existing human scheduler controls remain separate while job-start authority is enforced server-side",()=>{
  const source=fs.readFileSync(appPath,"utf8");
  assert.match(source,/onStatus\(job,"PAUSED"\)/);
  assert.match(source,/onStatus\(job,"READY"\)/);
  assert.match(source,/onStatus\(job,"CANCELLED"\)/);
  assert.doesNotMatch(source,/service_evaluate_execution_authority_v1/);
  assert.match(source,/get_job_execution_authority_summary_v1/);
});
