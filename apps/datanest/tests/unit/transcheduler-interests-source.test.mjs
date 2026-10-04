import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../../src/components/DataNestApp.tsx", import.meta.url),"utf8");
const stakeholder = readFileSync(new URL("../../src/components/StakeholderWorkspace.tsx", import.meta.url),"utf8");
const taxonomy = readFileSync(new URL("../../src/lib/workFocus.ts", import.meta.url),"utf8");
const migration = readFileSync(
  new URL("../../supabase/migrations/20260929042816_link_transcheduler_job_requirements_user_interests.sql", import.meta.url),
  "utf8"
);

test("shared work taxonomy includes UI/UX and governed impact sections",()=>{
  for(const key of [
    "ui_ux","database_architecture","workflow_functionality","cost_saving","brand_promotion",
    "user_acquisition","datanest_ai_learning","governance_process","security_testing","documentation_mentoring"
  ]){
    assert.match(taxonomy,new RegExp('key:"'+key+'"'));
    assert.match(migration,new RegExp("'"+key+"'"));
  }
  assert.match(taxonomy,/label:"UI\/UX"/);
});

test("UNIFI persists Job requirement sections through the idempotent manifest RPC",()=>{
  assert.match(app,/Job requirement sections/);
  assert.match(app,/focusAreas:WorkFocusKey\[\]/);
  assert.match(app,/create_job_manifest_v3/);
  assert.match(app,/job_focus_areas:payload\.focusAreas/);
  assert.match(migration,/requirements->'focus_areas'/);
  assert.match(migration,/'focus_areas',to_jsonb\(normalized_focus_areas\)/);
});

test("Stakeholder interests persist as preferences and remain non-authoritative",()=>{
  assert.match(migration,/add column if not exists interest_keys text\[\]/);
  assert.match(stakeholder,/USER INTERESTS/);
  assert.match(stakeholder,/interest_keys:next/);
  assert.match(stakeholder,/do not change Job priority, execution authority, contribution scores, or access permissions/);
});

test("TranScheduler highlights and optionally filters Jobs by interest intersection",()=>{
  assert.match(app,/select\("interest_keys"\)/);
  assert.match(app,/workMatchesInterests\(item\.requirements,userInterests\)/);
  assert.match(app,/My interests/);
  assert.match(app,/INTEREST MATCH/);
  assert.match(app,/setInterestOnly\(false\)/);
  assert.match(app,/No Jobs on this page match your saved interests/);
});


test("TranScheduler can rank Jobs by interest overlap without changing Job priority",()=>{
  assert.match(taxonomy,/function workInterestOverlapCount/);
  assert.match(app,/sortMode==="interest"/);
  assert.match(app,/workInterestOverlapCount\(right\.requirements,userInterests\)-workInterestOverlapCount\(left\.requirements,userInterests\)/);
  assert.match(app,/<option value="interest">Interest relevance<\/option>/);
  assert.match(app,/return right\.priority-left\.priority\|\|left\.job_number-right\.job_number/);
});


test("interest-only scheduler state is shareable and Stakeholder can open it directly",()=>{
  assert.match(app,/operationalUrlStateKeys=\["page","mode","filter","sort","interests","focus"\]/);
  assert.match(app,/function schedulerInterestOnlyFromUrl/);
  assert.match(app,/url\.searchParams\.get\("interests"\)==="1"/);
  assert.match(app,/url\.searchParams\.set\("interests","1"\)/);
  assert.match(app,/interestOnly=\{schedulerInterestOnly\}/);
  assert.match(stakeholder,/Open matched Jobs/);
  assert.match(stakeholder,/onOpenMatchedJobs:\(\)=>void/);
});


test("TranScheduler explains why each Job matches the user's interests",()=>{
  assert.match(taxonomy,/function workInterestOverlapKeys/);
  assert.match(taxonomy,/workFocusKeysFromRequirements\(requirements\)\.filter\(key=>selected\.has\(key\)\)/);
  assert.match(app,/function JobInterestEvidence/);
  assert.match(app,/const matched=workInterestOverlapKeys\(job\.requirements,userInterests\)/);
  assert.match(app,/Matched interests:/);
  assert.match(app,/"Matched "\+matched\.length/);
  assert.match(app,/matched\.map\(workFocusLabel\)\.join\(" · "\)/);
  assert.match(app,/className="interestMatchDetail"/);
});


test("TranScheduler identifies requirement sections outside the user's saved interests",()=>{
  assert.match(taxonomy,/function workInterestGapKeys/);
  assert.match(taxonomy,/workFocusKeysFromRequirements\(requirements\)\.filter\(key=>!selected\.has\(key\)\)/);
  assert.match(app,/function JobInterestEvidence/);
  assert.match(app,/Requirement sections outside your interests:/);
  assert.match(app,/Outside your interests · /);
  assert.match(app,/className="interestGapDetail"/);
});


test("TranScheduler shows loaded-page saved-interest coverage and per-Job coverage ratios",()=>{
  assert.match(taxonomy,/function workInterestCoverage/);
  assert.match(taxonomy,/covered:selected\.filter\(key=>coveredSet\.has\(key\)\)/);
  assert.match(taxonomy,/gaps:selected\.filter\(key=>!coveredSet\.has\(key\)\)/);
  assert.match(app,/Interest coverage · current queue page/);
  assert.match(app,/Covered interest:/);
  assert.match(app,/No current Job interest:/);
  assert.match(app,/const requirementCount=workFocusKeysFromRequirements\(job\.requirements\)\.length/);
  assert.match(app,/Interest coverage /);
  assert.match(app,/"Coverage "\+matched\.length\+" of "\+requirementCount/);
  assert.match(app,/className="interestCoverageDetail"/);
});


test("Stakeholder shows current open Job demand for each interest area",()=>{
  assert.match(stakeholder,/supabase\.from\("jobs"\)\.select\("requirements,status"\)\.eq\("project_id",projectId\)/);
  assert.match(stakeholder,/const interestDemandFinalStates=new Set\(\["COMPLETED","FAILED","CANCELLED"\]\)/);
  assert.match(stakeholder,/workFocusKeysFromRequirements\(job\.requirements\)/);
  assert.match(stakeholder,/setInterestDemandJobCount\(openJobs\.length\)/);
  assert.match(stakeholder,/open Jobs mapped across requirement sections/);
  assert.match(stakeholder,/open Jobs require /);
  assert.match(stakeholder,/className="interestDemandBadge"/);
});


test("Stakeholder demand badges drill into a shareable open-Job requirement focus",()=>{
  assert.match(stakeholder,/onOpenRequirementJobs:\(key:WorkFocusKey\)=>void/);
  assert.match(stakeholder,/className="interestDemandBadge" type="button"/);
  assert.match(stakeholder,/disabled=\{interestDemand\[item\.key\]===0\}/);
  assert.match(stakeholder,/onOpenRequirementJobs\(item\.key\)/);
  assert.match(app,/function schedulerRequirementFocusFromUrl/);
  assert.match(app,/url\.searchParams\.get\("focus"\)/);
  assert.match(app,/url\.searchParams\.set\("focus",schedulerRequirementFocus\)/);
  assert.match(app,/!finalStates\.has\(item\.status\)&&workFocusKeysFromRequirements\(item\.requirements\)\.includes\(requirementFocus\)/);
  assert.match(app,/Requirement focus/);
  assert.match(app,/open Jobs only/);
  assert.match(app,/const requirementFocusBatchSize=200/);
  assert.match(app,/\.range\(offset,offset\+requirementFocusBatchSize-1\)/);
  assert.match(app,/const schedulerJobs=useMemo\(\(\)=>requirementFocus\?\(requirementJobs\?\?\[\]\):jobs,\[jobs,requirementFocus,requirementJobs\]\)/);
  assert.match(app,/setRequirementJobs\(allJobs\.filter\(item=>!finalStates\.has\(item\.status\)&&workFocusKeysFromRequirements\(item\.requirements\)\.includes\(requirementFocus\)\)\)/);
  assert.match(app,/!requirementFocus&&<Pagination page=\{page\} total=\{total\} onPage=\{onPage\}\/>/);
});
