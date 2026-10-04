import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script=fileURLToPath(new URL("../../scripts/forge-index-release-evidence.mjs",import.meta.url));
const envelope={
 schemaVersion:"release-evidence-envelope-v1",
 repository:{fullName:"DataNest-Supository/Mirror-DataNest",role:"mirror-rd"},
 commitSha:"a".repeat(40),releaseId:"mirror-test",environment:"staging",
 backend:{provider:"supabase",projectId:"qchttpcyqlqnhvahprhz",environment:"staging"},
 workflow:{provider:"github-actions",name:"Pages",runId:"123"},
 artifact:{type:"github-pages",identity:"Mirror@"+ "a".repeat(40)},
 verification:{tests:"pass",typecheck:"pass",security:"pass",live:"pass"},
 governance:{reviewed:false,humanAuthorized:false},
 authority:{productionAuthority:false,productionDeploymentAllowed:false}
};

test("Forge ingestion is read-only and preserves non-authoritative Mirror state",()=>{
 const dir=mkdtempSync(join(process.cwd(),"tmp-forge-index-"));
 const input=join(dir,"envelope.json"); const output=join(dir,"index.json");
 writeFileSync(input,JSON.stringify(envelope));
 const result=spawnSync(process.execPath,[script,input,output],{encoding:"utf8"});
 assert.equal(result.status,0,result.stderr);
 const index=JSON.parse(readFileSync(output,"utf8"));
 assert.equal(index.schemaVersion,"forge-evidence-index-v1");
 assert.equal(index.mode,"read-only");
 assert.equal(index.entries.length,1);
 assert.equal(index.entries[0].authority.productionAuthority,false);
 assert.equal(index.entries[0].authority.productionDeploymentAllowed,false);
 rmSync(dir,{recursive:true,force:true});
});

test("Forge ingestion deduplicates the same evidence key",()=>{
 const dir=mkdtempSync(join(process.cwd(),"tmp-forge-index-"));
 const input=join(dir,"envelope.json"); const output=join(dir,"index.json");
 writeFileSync(input,JSON.stringify(envelope));
 assert.equal(spawnSync(process.execPath,[script,input,output]).status,0);
 assert.equal(spawnSync(process.execPath,[script,input,output]).status,0);
 const index=JSON.parse(readFileSync(output,"utf8"));
 assert.equal(index.entries.length,1);
 rmSync(dir,{recursive:true,force:true});
});
