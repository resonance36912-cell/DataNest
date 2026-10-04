import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const validator=fileURLToPath(new URL("../../scripts/validate-release-evidence-envelope.mjs",import.meta.url));

const base={
  schemaVersion:"release-evidence-envelope-v1",
  repository:{fullName:"DataNest-Supository/DataNest",role:"canonical"},
  commitSha:"a".repeat(40),
  releaseId:"release-2026-09-30T12:00:00Z",
  environment:"production",
  backend:{provider:"supabase",projectId:"sgqdmfgjbprsoqsmgigi",environment:"production"},
  workflow:{provider:"github-actions",name:"Pages",runId:"123456"},
  artifact:{type:"github-pages",identity:"DataNest@"+ "a".repeat(40),digest:"sha256:"+"b".repeat(64)},
  verification:{tests:"pass",typecheck:"pass",security:"pass",live:"pass"},
  certification:{status:"pass",reference:"certification-123"},
  auditOptimizer:{status:"pass",reference:"audit-123"},
  governance:{reviewed:true,humanAuthorized:true,reference:"governance-123"},
  authority:{productionAuthority:true,productionDeploymentAllowed:true}
};

function run(value){
  const dir=mkdtempSync(join(process.cwd(),"tmp-envelope-"));
  const file=join(dir,"envelope.json");
  writeFileSync(file,JSON.stringify(value));
  const result=spawnSync(process.execPath,[validator,file],{encoding:"utf8"});
  rmSync(dir,{recursive:true,force:true});
  return result;
}

test("accepts a fully evidenced canonical production envelope",()=>{
  const result=run(base);
  assert.equal(result.status,0,result.stderr);
});

test("rejects mirror production authority",()=>{
  const value=structuredClone(base);
  value.repository={fullName:"DataNest-Supository/Mirror-DataNest",role:"mirror-rd"};
  value.authority={productionAuthority:true,productionDeploymentAllowed:true};
  const result=run(value);
  assert.notEqual(result.status,0);
});

test("rejects production authorization without certification and audit evidence",()=>{
  const value=structuredClone(base);
  delete value.certification;
  delete value.auditOptimizer;
  const result=run(value);
  assert.notEqual(result.status,0);
});

test("rejects deployment authority without human authorization",()=>{
  const value=structuredClone(base);
  value.governance.humanAuthorized=false;
  const result=run(value);
  assert.notEqual(result.status,0);
});

test("accepts a Mirror candidate only as non-authoritative evidence",()=>{
  const value=structuredClone(base);
  value.repository={fullName:"DataNest-Supository/Mirror-DataNest",role:"mirror-rd"};
  value.environment="staging";
  value.backend={provider:"supabase",projectId:"qchttpcyqlqnhvahprhz",environment:"staging"};
  value.certification={status:"not_run"};
  value.auditOptimizer={status:"not_run"};
  value.governance={reviewed:false,humanAuthorized:false};
  value.authority={productionAuthority:false,productionDeploymentAllowed:false};
  const result=run(value);
  assert.equal(result.status,0,result.stderr);
});
