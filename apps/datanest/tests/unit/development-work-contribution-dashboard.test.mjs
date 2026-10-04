import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const dashboard=fs.readFileSync(path.join(root,"src/components/DevelopmentWorkContributionDashboard.tsx"),"utf8");
const workspace=fs.readFileSync(path.join(root,"src/components/DataNestAiWorkspace.tsx"),"utf8");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20260929235950_add_development_work_dashboard_v1.sql"),"utf8");

const expertise=[
  ["ui_ux","UI & UX"],["frontend","Frontend"],["backend","Backend"],["data","Data"],["ai","AI"],
  ["testing","Testing"],["security","Security"],["infrastructure","Infrastructure"],
  ["documentation","Documentation"],["product_planning","Product Planning"]
];

test("Development Work dashboard reads only governed expertise-routed contributions",()=>{
  assert.ok(migration.includes("get_development_work_contribution_dashboard_v1"));
  assert.ok(migration.includes("l.metadata->>'category'='development_work'"));
  assert.ok(migration.includes("l.metadata->>'routing_version'='development-work-expertise-v1'"));
  assert.ok(migration.includes("private.has_project_role(target_project,array['owner','admin','operator','viewer'])"));
  assert.ok(migration.includes("(is_admin or l.user_id=auth.uid())"));
  for(const [key,label] of expertise){
    assert.ok(migration.includes(`('${key}','${label}'`),`missing dashboard expertise route ${key}`);
  }
});

test("verification queue uses evidence state while impact points remain verification gated",()=>{
  assert.ok(migration.includes("from public.contribution_evidence e"));
  assert.ok(migration.includes("coalesce(ev.verification_state,'submitted')"));
  assert.ok(migration.includes("then greatest(0,coalesce(points,0))"));
  assert.ok(migration.includes("'raw_activity_never_awards_points',true"));
  assert.ok(migration.includes("'verification_source','public.contribution_evidence'"));
  assert.ok(migration.includes("'impact_source','public.contribution_ledger'"));
});

test("trend signal compares recent routed activity without turning activity into impact",()=>{
  assert.ok(migration.includes("now()-interval '7 days'"));
  assert.ok(migration.includes("now()-interval '14 days'"));
  assert.ok(migration.includes("'trend_signal_is_activity_only',true"));
  for(const signal of ["quiet","new","rising","cooling","steady"]){
    assert.ok(migration.includes(`'${signal}'`),`missing trend state ${signal}`);
  }
});

test("DataNest AI exposes the compact verification dashboard below the command summary",()=>{
  assert.ok(workspace.includes('import DevelopmentWorkContributionDashboard from "@/components/DevelopmentWorkContributionDashboard";'));
  assert.ok(workspace.includes("<DevelopmentWorkContributionDashboard"));
  assert.ok(workspace.includes("projectId={projectId}"));
  assert.ok(workspace.includes('refreshToken={(context?.events?.length||0)+":"+sessionId}'));
  assert.ok(dashboard.includes('supabase.rpc("get_development_work_contribution_dashboard_v1"'));
  assert.ok(dashboard.includes("Verification queue &amp; project impact"));
  assert.ok(dashboard.includes("trend pulse measures recent routed activity only"));
  assert.ok(dashboard.includes("Verified project impact"));
  assert.ok(dashboard.includes("function isDashboard(value:unknown):value is Dashboard"));
  assert.ok(dashboard.includes("Array.isArray(candidate.sections)"));
  assert.ok(dashboard.includes("Development Work contribution dashboard is not available in this environment yet."));
});
