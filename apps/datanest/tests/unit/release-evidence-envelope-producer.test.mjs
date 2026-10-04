import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const producer=fileURLToPath(new URL("../../scripts/write-release-evidence-envelope.mjs",import.meta.url));
test("producer creates a non-authoritative Mirror envelope by default when explicitly configured",()=>{
  const dir=mkdtempSync(join(process.cwd(),"tmp-producer-"));
  const manifest=join(dir,"manifest.json"); const output=join(dir,"envelope.json");
  writeFileSync(manifest,JSON.stringify({frontendCommit:"a".repeat(40),supabaseProject:"qchttpcyqlqnhvahprhz"}));
  const env={...process.env,DATANEST_EVIDENCE_REPOSITORY:"DataNest-Supository/Mirror-DataNest",DATANEST_EVIDENCE_REPOSITORY_ROLE:"mirror-rd",DATANEST_EVIDENCE_ENVIRONMENT:"staging",DATANEST_VERIFY_TESTS:"pass",DATANEST_VERIFY_TYPECHECK:"pass",DATANEST_VERIFY_SECURITY:"pass",DATANEST_VERIFY_LIVE:"pass"};
  const result=spawnSync(process.execPath,[producer,manifest,output],{env,encoding:"utf8"});
  const json=JSON.parse(readFileSync(output,"utf8"));
  assert.equal(result.status,0,result.stderr);
  assert.equal(json.schemaVersion,"release-evidence-envelope-v1");
  assert.equal(json.authority.productionAuthority,false);
  assert.equal(json.authority.productionDeploymentAllowed,false);
  rmSync(dir,{recursive:true,force:true});
});
