import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  listWorktreeGateProfiles,
  proposeWorktreeGateTimeframe
} from "../../scripts/propose-worktree-gate-timeframe.mjs";

const workflowsDir=new URL("../../.github/workflows/",import.meta.url);
const profiles=listWorktreeGateProfiles();
const reusable="worktree-gate-timeframe.yml";

test("every active worktree workflow gate is covered by the shared timeframe registry",()=>{
  const files=readdirSync(workflowsDir)
    .filter((name)=>name.endsWith(".yml"))
    .filter((name)=>name!==reusable)
    .filter((name)=>{
      const source=readFileSync(new URL(`../../.github/workflows/${name}`,import.meta.url),"utf8");
      return !/^# worktree-gate:\s*false\s*$/m.test(source) && /\n  gate-timeframe:\n/.test(source);
    })
    .sort();
  assert.deepEqual(Object.keys(profiles).filter((name)=>name!=="pages.yml").sort(),files);
});

test("every worktree gate invokes the reusable DataNest AI timeframe policy",()=>{
  for(const [workflowFile,profile] of Object.entries(profiles)){
    if(workflowFile==="pages.yml") continue;
    const source=readFileSync(new URL(`../../.github/workflows/${workflowFile}`,import.meta.url),"utf8");
    assert.match(source,/\n  gate-timeframe:\n/,`${workflowFile} missing gate-timeframe job`);
    assert.match(source,/uses: \.\/\.github\/workflows\/worktree-gate-timeframe\.yml/);
    assert.match(source,new RegExp(`gate_id: ["']?${profile.gateId.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}["']?`));
  }
});

test("automated gates report machine ETA separately from human follow-up",()=>{
  const ci=proposeWorktreeGateTimeframe({gateId:"ci",changedFiles:3});
  assert.equal(ci.gateType,"automated_validation");
  assert.ok(ci.machine.estimatedMinutes<=60);
  assert.ok(ci.humanFollowup.recommendedHours>=6);
  assert.equal(ci.manualWindow,null);

  const security=proposeWorktreeGateTimeframe({gateId:"security-scan"});
  assert.equal(security.gateType,"automated_validation");
  assert.ok(security.machine.estimatedMinutes<=60);
  assert.equal(security.humanFollowup.recommendedHours,12);
});

test("manual mutating gates retain human response/evidence planning windows",()=>{
  const pages=proposeWorktreeGateTimeframe({gateId:"pages"});
  assert.equal(pages.gateType,"manual_mutation");
  assert.equal(pages.humanFollowup.baselineRawHours,66);
  assert.equal(pages.manualWindow.recommendedHours,12);

  const cleaner=proposeWorktreeGateTimeframe({gateId:"branch-cleaner"});
  assert.equal(cleaner.gateType,"manual_mutation");
  assert.equal(cleaner.manualWindow.recommendedHours,6);
});

test("change scope escalates complexity and machine ETA without weakening baseline risk",()=>{
  const small=proposeWorktreeGateTimeframe({gateId:"ci",changedFiles:1});
  const broad=proposeWorktreeGateTimeframe({gateId:"ci",changedFiles:40});
  assert.equal(small.taskComplexity,"complex");
  assert.equal(broad.taskComplexity,"cross_system");
  assert.ok(broad.machine.estimatedMinutes>=small.machine.estimatedMinutes);
  assert.ok(broad.humanFollowup.recommendedHours>=small.humanFollowup.recommendedHours);
});

test("Owner overrides are bounded, auditable, and limited to manual mutation gates",()=>{
  const override=proposeWorktreeGateTimeframe({gateId:"pages",overrideHours:48});
  assert.equal(override.manualWindow.recommendedHours,12);
  assert.equal(override.manualWindow.acceptedHours,48);
  assert.equal(override.manualWindow.ownerOverride,true);
  assert.equal(override.manualWindow.overrideDeltaHours,36);

  const exact=proposeWorktreeGateTimeframe({gateId:"branch-cleaner",overrideHours:6});
  assert.equal(exact.manualWindow.ownerOverride,false);

  assert.throws(()=>proposeWorktreeGateTimeframe({gateId:"pages",overrideHours:73}),/CALMER minimum 12 and 72/);
  assert.throws(()=>proposeWorktreeGateTimeframe({gateId:"pages",overrideHours:6}),/CALMER minimum 12 and 72/);
  assert.throws(()=>proposeWorktreeGateTimeframe({gateId:"ci",overrideHours:12}),/only valid for manual_mutation/);
});

test("shared workflow publishes summary and retained machine-readable evidence",()=>{
  const source=readFileSync(new URL("../../.github/workflows/worktree-gate-timeframe.yml",import.meta.url),"utf8");
  assert.match(source,/GITHUB_STEP_SUMMARY|propose-worktree-gate-timeframe\.mjs/);
  assert.match(source,/worktree-gate-timeframe-\$\{\{ inputs\.gate_id \}\}-\$\{\{ github\.run_id \}\}/);
  assert.match(source,/retention-days: 30/);
  assert.match(source,/override_hours:/);
});

test("manual workflows expose bounded Owner override inputs",()=>{
  for(const workflow of ["branch-cleaner.yml","datanest-ai-file-worker-deploy.yml","mirror-production-import.yml"]){
    const source=readFileSync(new URL(`../../.github/workflows/${workflow}`,import.meta.url),"utf8");
    assert.match(source,/gate_timeframe_override_hours:/,`${workflow} missing override input`);
    assert.match(source,/override_hours: \$\{\{ inputs\.gate_timeframe_override_hours \|\| '' \}\}/);
  }
});

test("CALMER applies the minimum pass planning floor without weakening automated checks",()=>{
  const pages=proposeWorktreeGateTimeframe({gateId:"pages"});
  assert.equal(pages.humanFollowup.baselineRecommendedHours,72);
  assert.equal(pages.humanFollowup.calmerMinimumPassHours,12);
  assert.equal(pages.humanFollowup.calmerSofteningHours,60);
  assert.equal(pages.calmer.hardControlsPreserved,true);

  const security=proposeWorktreeGateTimeframe({gateId:"security-scan"});
  assert.equal(security.humanFollowup.calmerMinimumPassHours,12);
  assert.equal(security.machine.baselineMinutes,30);
});
