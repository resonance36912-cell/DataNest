import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const chat=fs.readFileSync(path.join(root,"src/components/DataNestAiChatPanel.tsx"),"utf8");
const workspace=fs.readFileSync(path.join(root,"src/components/DataNestAiWorkspace.tsx"),"utf8");
const workFocus=fs.readFileSync(path.join(root,"src/lib/workFocus.ts"),"utf8");
const edge=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),"utf8");
const impact=fs.readFileSync(path.join(root,"supabase/migrations/20260928220000_reconcile_production_impact_scoring_governed.sql"),"utf8");
const intakeV1=fs.readFileSync(path.join(root,"supabase/migrations/20260928223500_add_development_work_contribution_intake.sql"),"utf8");
const intakeV2=fs.readFileSync(path.join(root,"supabase/migrations/20260929235100_link_development_work_requirement_focus.sql"),"utf8");
const runtimeFix=fs.readFileSync(path.join(root,"supabase/migrations/20260928223619_fix_development_command_runtime_access.sql"),"utf8");

const sections=[
  ["ui_ux","UI & UX"],["frontend","Frontend"],["backend","Backend"],["data","Data"],["ai","AI"],
  ["testing","Testing"],["security","Security"],["infrastructure","Infrastructure"],
  ["documentation","Documentation"],["product_planning","Product Planning"]
];

const focusKeys=[
  "ui_ux","database_architecture","workflow_functionality","cost_saving","brand_promotion",
  "user_acquisition","datanest_ai_learning","governance_process","security_testing","documentation_mentoring"
];

test("Development Work exposes selectable expertise sections and requires a route",()=>{
  for(const [key,label] of sections){
    assert.ok(chat.includes(`key:"${key}"`),`missing expertise key ${key}`);
    assert.ok(chat.includes(`label:"${label}"`),`missing expertise label ${label}`);
  }
  assert.ok(chat.includes("DEVELOPMENT WORK · CHOOSE EXPERTISE"));
  assert.ok(chat.includes("expertiseSection:expertise.key"));
  assert.ok(chat.includes("disabled={busy||!contextReady||!selectedExpertise||!draft.trim()}"));
});

test("Development Work expertise is linked to canonical Job requirement focus",()=>{
  assert.ok(workspace.includes("jobRequirements={selectedJob.requirements||{}}"));
  assert.ok(chat.includes("workFocusKeysFromRequirements(jobRequirements)"));
  assert.ok(chat.includes("matchedRequirementFocusKeys"));
  assert.ok(chat.includes("requirement_focus_match:matchedRequirementFocusKeys.length>0"));
  assert.ok(chat.includes("Job requirement · "));
  for(const key of focusKeys){
    assert.ok(workFocus.includes(`key:"${key}"`),`work-focus taxonomy missing ${key}`);
    assert.ok(edge.includes(`"${key}"`),`edge routing taxonomy missing ${key}`);
  }
});

test("expertise and requirement focus survive cumulative Development Command working memory",()=>{
  assert.ok(edge.includes("body.expertiseSection"));
  assert.ok(edge.includes("Unsupported Development Work expertise section."));
  assert.ok(edge.includes("working_memory_scope:\"development_command\""));
  assert.ok(edge.includes("impact_area:input.expertiseLabel"));
  assert.ok(edge.includes("expertise_section:input.expertiseSection"));
  assert.ok(edge.includes("requirement_focus_keys:input.requirementFocusKeys"));
  assert.ok(edge.includes("job_requirement_focus_keys:input.jobRequirementFocusKeys"));
  assert.ok(edge.includes("matched_requirement_focus_keys:input.matchedRequirementFocusKeys"));
  assert.ok(edge.includes('routing_version:input.expertiseSection?"development-work-expertise-v1":null'));
});

test("expertise-routed commands stage governed contribution verification with zero raw points",()=>{
  assert.ok(edge.includes('"submit_development_work_contribution_v2"'));
  assert.ok(edge.includes("contributionTracking"));
  assert.ok(intakeV1.includes("insert into public.contribution_ledger"));
  assert.ok(intakeV1.includes("'human_input'"));
  assert.ok(intakeV1.includes("'development_work'"));
  assert.ok(intakeV1.includes("0,"));
  assert.ok(intakeV1.includes("false,"));
  assert.ok(intakeV1.includes("insert into public.contribution_evidence"));
  assert.ok(intakeV1.includes("verification_state"));
  assert.ok(intakeV1.includes("set lifecycle_state='staged'"));
});

test("production contribution metadata derives requirement matching from governed Job requirements",()=>{
  assert.ok(intakeV2.includes("submit_development_work_contribution_v1("));
  assert.ok(intakeV2.includes("j.requirements"));
  assert.ok(intakeV2.includes("'requirement_focus_keys'"));
  assert.ok(intakeV2.includes("'job_requirement_focus_keys'"));
  assert.ok(intakeV2.includes("'matched_requirement_focus_keys'"));
  assert.ok(intakeV2.includes("'requirement_focus_match'"));
  assert.ok(intakeV2.includes("'requirement_focus_version','work-focus-v1'"));
});

test("production impact scoring groups governed contributions by routed impact area",()=>{
  assert.ok(impact.includes("from public.contribution_ledger l"));
  assert.ok(impact.includes("l.metadata->>'impact_area'"));
  assert.ok(impact.includes("'raw_activity_never_awards_points',true"));
  assert.ok(impact.includes("'source','public.contribution_ledger'"));
});


test("Development Command production runtime fix restores service-role memory access and avoids ambiguous contribution ids",()=>{
  assert.ok(runtimeFix.includes("grant select, insert, update"));
  assert.ok(runtimeFix.includes("on table public.development_command_working_memory"));
  assert.ok(runtimeFix.includes("on table public.development_command_turns"));
  assert.ok(runtimeFix.includes("to service_role"));
  assert.ok(runtimeFix.includes("v_contribution_id uuid"));
  assert.ok(runtimeFix.includes("returning id into v_contribution_id"));
  assert.ok(runtimeFix.includes("values(\n    v_contribution_id,"));
  assert.ok(runtimeFix.includes("where id=v_contribution_id"));
  assert.ok(runtimeFix.includes("return v_contribution_id"));
});
