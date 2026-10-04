import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root=fileURLToPath(new URL("../..",import.meta.url));
const writer=join(root,"scripts","write-connector-edge-function-attestation.mjs");
const verifier=join(root,"scripts","verify-production-edge-function-release-reference.mjs");

const functionInventory=[
  ["datanest-ai-chat",349,"f0250dcbb8a6203e7083103b1c2a86aada8d774e38912acbc552bdfbddb8a1a4"],
  ["datanest-ai-intake",309,"50c841f93c78318c9ae8e66c39cac7136cbe0fe50acad6c02504230da30c1cc4"],
  ["datanest-ai-certification",319,"bd829d7bb3da7673b9a84f112189b35e7230e1406608a3721f0a94c70f985cac"],
  ["manage-ai-provider-v2",109,"168e68fa8cd621c4e0608e410fa34ea77f98486b0159111636385b02461aff6d"],
  ["send-job-invite",5,"862ca3a43a2c8bb5a877955bbdb9a9ac59de388ac7e31bd2ff8cab0606353aaf"],
  ["send-project-member-invite",313,"b40fe1631279b5fd760c52d893890d2299c6a8b49ced8eb65a158f483cb81c68"],
  ["ronsas-status",324,"9f846841694dd332eda5f441968e61cee83bf364508662ce3b1b42f099037513"],
  ["external-audit",95,"38ec410b2641b5e7411816229b1cb9f618a6ec6cbc5a6ff63e741426135094b7"]
];

function baseEnv(extra={}){
  return {
    ...process.env,
    GITHUB_REPOSITORY:"DataNest-Supository/DataNest",
    DATANEST_SUPABASE_PROJECT:"sgqdmfgjbprsoqsmgigi",
    ...extra
  };
}

test("connector attestation writer and verifier round-trip source integrity",()=>{
  const dir=mkdtempSync(join(tmpdir(),"datanest-edge-attestation-"));
  try{
    const inventoryPath=join(dir,"inventory.json");
    const attestationPath=join(dir,"connector.json");
    const verifiedPath=join(dir,"verified.json");
    const releaseSha=spawnSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).stdout.trim();
    const observedAt=new Date().toISOString();
    writeFileSync(inventoryPath,JSON.stringify({
      functions:functionInventory.map(([slug,version,ezbr_sha256])=>({
        slug,version,ezbr_sha256,status:"ACTIVE",verify_jwt:true
      }))
    })+"\n");

    const writeResult=spawnSync(process.execPath,[writer,inventoryPath,attestationPath],{
      cwd:root,
      env:baseEnv({
        DATANEST_CONNECTOR_EDGE_SOURCE_COMMIT:releaseSha,
        DATANEST_CONNECTOR_EDGE_EVIDENCE_REF:"test://connector-edge-evidence/round-trip",
        DATANEST_CONNECTOR_EDGE_OBSERVED_AT:observedAt
      }),
      encoding:"utf8"
    });
    assert.equal(writeResult.status,0,writeResult.stderr);
    const attestation=JSON.parse(readFileSync(attestationPath,"utf8"));
    assert.equal(attestation.schemaVersion,"edge-function-connector-attestation-v1");
    assert.equal(attestation.source,"supabase-mcp-connector");
    assert.equal(attestation.sourceCommit,releaseSha);
    assert.equal(attestation.connectorEvidenceRef,"test://connector-edge-evidence/round-trip");
    assert.match(attestation.sourceTreeSha256,/^[0-9a-f]{64}$/i);
    assert.equal(attestation.functions["send-job-invite"].sourceTreeSha256,attestation.sourceTreeSha256);

    const verifyResult=spawnSync(process.execPath,[verifier,attestationPath,verifiedPath],{
      cwd:root,
      env:baseEnv({
        DATANEST_RELEASE_SHA:releaseSha,
        DATANEST_EDGE_FUNCTION_RELEASE_REFERENCE:"connector:"+releaseSha
      }),
      encoding:"utf8"
    });
    assert.equal(verifyResult.status,0,verifyResult.stderr);
    const verified=JSON.parse(readFileSync(verifiedPath,"utf8"));
    assert.equal(verified.status,"verified");
    assert.equal(verified.releaseReference,"connector:"+releaseSha);
    assert.equal(verified.deploymentSourceCommit,releaseSha);
    assert.equal(verified.sourceTreeSha256,attestation.sourceTreeSha256);
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
});

test("connector verifier rejects a stale or altered source-tree fingerprint",()=>{
  const dir=mkdtempSync(join(tmpdir(),"datanest-edge-attestation-negative-"));
  try{
    const inventoryPath=join(dir,"inventory.json");
    const attestationPath=join(dir,"connector.json");
    const badPath=join(dir,"connector-bad.json");
    const outputPath=join(dir,"verified.json");
    const releaseSha=spawnSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).stdout.trim();
    writeFileSync(inventoryPath,JSON.stringify({
      functions:functionInventory.map(([slug,version,ezbr_sha256])=>({
        slug,version,ezbr_sha256,status:"ACTIVE",verify_jwt:true
      }))
    })+"\n");

    const writeResult=spawnSync(process.execPath,[writer,inventoryPath,attestationPath],{
      cwd:root,
      env:baseEnv({
        DATANEST_CONNECTOR_EDGE_SOURCE_COMMIT:releaseSha,
        DATANEST_CONNECTOR_EDGE_EVIDENCE_REF:"test://connector-edge-evidence/negative",
        DATANEST_CONNECTOR_EDGE_OBSERVED_AT:new Date().toISOString()
      }),
      encoding:"utf8"
    });
    assert.equal(writeResult.status,0,writeResult.stderr);
    const attestation=JSON.parse(readFileSync(attestationPath,"utf8"));
    attestation.sourceTreeSha256="0".repeat(64);
    writeFileSync(badPath,JSON.stringify(attestation,null,2)+"\n");

    const verifyResult=spawnSync(process.execPath,[verifier,badPath,outputPath],{
      cwd:root,
      env:baseEnv({
        DATANEST_RELEASE_SHA:releaseSha,
        DATANEST_EDGE_FUNCTION_RELEASE_REFERENCE:"connector:"+releaseSha
      }),
      encoding:"utf8"
    });
    assert.notEqual(verifyResult.status,0);
    assert.match(verifyResult.stderr+verifyResult.stdout,/sourceTreeSha256/i);
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
});
