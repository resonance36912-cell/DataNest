import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const writer=fileURLToPath(new URL("../../scripts/emit-automation-x-annotation.mjs",import.meta.url));
const sha="a".repeat(40);
function runWriter(extraEnv={}){
  const dir=mkdtempSync(join(tmpdir(),"datanest-automation-x-"));
  const target=join(dir,"annotation.json");
  const env={...process.env,GITHUB_REPOSITORY:"DataNest-Supository/DataNest",GITHUB_WORKFLOW:"Automation X Test",GITHUB_RUN_ID:"12345",GITHUB_RUN_ATTEMPT:"1",GITHUB_EVENT_NAME:"pull_request",GITHUB_REF:"refs/pull/99/head",GITHUB_SHA:sha,GITHUB_SERVER_URL:"https://github.com",AUTOMATION_X_ID:"botsquad",AUTOMATION_X_CLASS:"analysis",AUTOMATION_X_ACTION:"recommend",AUTOMATION_X_TARGET:"botsquad/feeds/datanest.json",AUTOMATION_X_EFFECT:"proposal",AUTOMATION_X_ARTIFACT_PATH:target,...extraEnv};
  const result=spawnSync(process.execPath,[writer,target],{env,encoding:"utf8"});
  const json=result.status===0 ? JSON.parse(readFileSync(target,"utf8")) : null;
  rmSync(dir,{recursive:true,force:true});
  return {result,json};
}

test("builds a traceable non-authorizing annotation",()=>{
  const {result,json}=runWriter();
  assert.equal(result.status,0,result.stderr);
  assert.equal(json.schemaVersion,"automation-x-annotation-v1");
  assert.equal(json.annotationId,"ax-botsquad-12345-1");
  assert.equal(json.run.sha,sha);
  assert.equal(json.automation.effect,"proposal");
  assert.equal(json.authority.canonicalChange,false);
  assert.equal(json.authority.merge,false);
  assert.equal(json.authority.productionDeployment,false);
  assert.equal(json.humanReview.required,true);
});
test("read-only validation can remain review-free",()=>{
  const {result,json}=runWriter({AUTOMATION_X_ID:"ci",AUTOMATION_X_CLASS:"validation",AUTOMATION_X_ACTION:"validate",AUTOMATION_X_TARGET:"repository",AUTOMATION_X_EFFECT:"read_only",AUTOMATION_X_HUMAN_REVIEW_REQUIRED:"false"});
  assert.equal(result.status,0,result.stderr);
  assert.equal(json.automation.effect,"read_only");
  assert.equal(json.humanReview.required,false);
});
test("mutation and deployment annotations retain non-authorizing authority flags",()=>{
  for(const item of [["mutation","mutate","bounded_mutation"],["deployment","deploy","deployment"]]){
    const {result,json}=runWriter({AUTOMATION_X_ID:"test-"+item[0],AUTOMATION_X_CLASS:item[0],AUTOMATION_X_ACTION:item[1],AUTOMATION_X_TARGET:"test-target",AUTOMATION_X_EFFECT:item[2]});
    assert.equal(result.status,0,result.stderr);
    assert.equal(json.authority.productionSource,false);
    assert.equal(json.authority.canonicalChange,false);
    assert.equal(json.authority.merge,false);
    assert.equal(json.authority.productionDeployment,false);
    assert.equal(json.humanReview.required,true);
  }
});
test("non-read-only effects cannot disable human review",()=>{
  const {result}=runWriter({AUTOMATION_X_EFFECT:"bounded_mutation",AUTOMATION_X_HUMAN_REVIEW_REQUIRED:"false"});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/cannot be false for non-read_only/);
});

test("invalid automation metadata fails closed",()=>{
  const {result}=runWriter({AUTOMATION_X_CLASS:"not-valid"});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/AUTOMATION_X_CLASS/);
});
test("schema fixes all authority flags to false",()=>{
  const schema=JSON.parse(readFileSync(new URL("../../schemas/automation-x-annotation-v1.schema.json",import.meta.url),"utf8"));
  assert.equal(schema.properties.authority.properties.productionSource.const,false);
  assert.equal(schema.properties.authority.properties.canonicalChange.const,false);
  assert.equal(schema.properties.authority.properties.merge.const,false);
  assert.equal(schema.properties.authority.properties.productionDeployment.const,false);
});
test("specialized automation workflows are wired to the reusable annotation action",()=>{
  const workflows={
    "botsquad.yml":["botsquad/${{ matrix.bot }}","botsquad/orchestrator"],
    "environment-tree.yml":["environment-tree"],
    "enforcer.yml":["enforcer"],
    "guardian.yml":["guardian/monitor","guardian/heal"],
    "conductor.yml":["conductor"],
    "suggester.yml":["suggester"],
    "calmer.yml":["calmer"],
    "regulator.yml":["regulator"],
    "visibility-utility.yml":["visibility-utility"]
  };
  for(const [file,ids] of Object.entries(workflows)){
    const source=readFileSync(new URL("../../.github/workflows/"+file,import.meta.url),"utf8");
    assert.match(source,/uses:\s+\.\/\.github\/actions\/automation-x-annotation/);
    for(const id of ids) assert.ok(source.includes("automation_id: "+id),file+" missing "+id);
  }
});