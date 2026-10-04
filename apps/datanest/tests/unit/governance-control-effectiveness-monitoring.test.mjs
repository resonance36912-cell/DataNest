import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929115908_governance_control_effectiveness_monitoring_v1.sql"),
  "utf8"
);
const dashboard=fs.readFileSync(
  path.join(root,"src/components/GovernanceControlMonitor.tsx"),
  "utf8"
);
const ownerConsole=fs.readFileSync(
  path.join(root,"src/components/OwnerOptimizerDashboard.tsx"),
  "utf8"
);
const ci=fs.readFileSync(path.join(root,".github/workflows/ci.yml"),"utf8");

test("control monitoring is append-only, alerting, and explicitly non-authoritative",()=>{
  assert.match(migration,/create table if not exists public\.governance_control_runtime_events/);
  assert.match(migration,/create table if not exists public\.governance_control_monitor_runs/);
  assert.match(migration,/create table if not exists public\.governance_control_alerts/);
  assert.match(migration,/governance_effect boolean not null default false check \(governance_effect=false\)/);
  assert.match(migration,/deployment_authority boolean not null default false check \(deployment_authority=false\)/);
  assert.doesNotMatch(migration,/perform\s+public\.cast_governance_vote_v1/i);
  assert.doesNotMatch(migration,/perform\s+public\.close_governance_proposal_v1/i);
  assert.doesNotMatch(migration,/perform\s+public\.ratify_governance_protocol_v1/i);
});

test("runtime instrumentation covers the approved control points",()=>{
  assert.match(migration,/governance_decision_control_event/);
  assert.match(migration,/outcome_feedback_control_event/);
  assert.match(migration,/ai_impact_control_event/);
  assert.match(migration,/optimizer_authority_control_event/);
  assert.match(migration,/'authority_firewall'/);
  assert.match(migration,/'ai_impact_assessment_coverage'/);
  assert.match(migration,/'outcome_feedback_routing'/);
  assert.match(migration,/'control_evidence_chain'/);
  assert.match(migration,/'release_verification_freshness'/);
  assert.match(migration,/'standards_review_freshness'/);
});

test("monitor evidence remains descriptive rather than a conformity claim",()=>{
  assert.match(migration,/'evidence_does_not_equal_truth',true/);
  assert.match(migration,/'conformity_claim',false/);
  assert.match(migration,/evidence_state/);
  assert.match(migration,/case when target_passed then 'passed' else 'failed' end/);
  assert.match(migration,/record_control_monitor_evidence_v1/);
});

test("owner-only RPC surface supports review without direct table mutation",()=>{
  assert.match(migration,/get_owner_governance_control_monitor_v1/);
  assert.match(migration,/run_governance_control_monitor_v1/);
  assert.match(migration,/acknowledge_governance_control_alert_v1/);
  assert.match(migration,/private\.has_project_role\(target_project,array\['owner'\]\)/);
  for(const table of [
    "governance_control_runtime_events",
    "governance_control_monitor_runs",
    "governance_control_alerts"
  ]){
    assert.match(migration,new RegExp("alter table public\\."+table+" enable row level security"));
    assert.match(migration,new RegExp("revoke all on table public\\."+table+" from public,anon,authenticated"));
    assert.match(migration,new RegExp("grant select on table public\\."+table+" to authenticated"));
  }
});

test("hourly checks and explicit release validation are wired",()=>{
  assert.match(migration,/datanest-governance-control-monitor-hourly/);
  assert.match(migration,/'23 \* \* \* \*'/);
  assert.match(ci,/Governance control effectiveness contract/);
  assert.match(ci,/governance-control-effectiveness-monitoring\.test\.mjs/);
});

test("owner admin dashboard exposes findings and acknowledgement only",()=>{
  assert.match(ownerConsole,/GovernanceControlMonitor/);
  assert.match(dashboard,/Governance Control Monitor/);
  assert.match(dashboard,/Run control check now/);
  assert.match(dashboard,/Acknowledge alert/);
  assert.match(dashboard,/Can deploy/);
  assert.match(dashboard,/>No</);
  assert.doesNotMatch(dashboard,/Deploy fix/);
});
