import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const manifestScript=readFileSync(
  new URL("../../scripts/write-release-manifest.mjs",import.meta.url),
  "utf8"
);
const pagesWorkflow=readFileSync(
  new URL("../../.github/workflows/pages.yml",import.meta.url),
  "utf8"
);
const manifestWriter=fileURLToPath(
  new URL("../../scripts/write-release-manifest.mjs",import.meta.url)
);
const edgeAttestationScript=readFileSync(
  new URL("../../scripts/verify-production-edge-function-release-reference.mjs",import.meta.url),
  "utf8"
);
const edgeReleaseWorkflow=readFileSync(
  new URL("../../.github/workflows/production-edge-function-release.yml",import.meta.url),
  "utf8"
);

test("project invite Edge Function v2 is the enforced release version",()=>{
  assert.match(
    manifestScript,
    /projectInvitations:process\.env\.DATANEST_EDGE_PROJECT_INVITES \|\| "send-project-member-invite@3"/
  );
  assert.match(
    pagesWorkflow,
    /DATANEST_EDGE_PROJECT_INVITES: send-project-member-invite@3/
  );
  assert.match(
    manifestScript,
    /projectInvitations:process\.env\.DATANEST_EDGE_PROJECT_INVITES \|\| "send-project-member-invite@3"/
  );
  assert.doesNotMatch(manifestScript,/send-project-member-invite@1/);
  assert.doesNotMatch(pagesWorkflow,/send-project-member-invite@1/);
});

test("release manifest derives the canonical production database release",()=>{
  assert.match(manifestScript,/validateProductionContract/);
  assert.match(manifestScript,/const expectedMigration=productionContract\.supabase\.expectedMigration/);
  assert.match(manifestScript,/databaseRelease:canonicalDatabaseRelease/);
  assert.match(manifestScript,/databaseMigration:\{/);
  assert.doesNotMatch(manifestScript,/link-transcheduler-job-requirements-user-interests/);
  assert.doesNotMatch(pagesWorkflow,/DATANEST_DB_RELEASE:/);
  assert.doesNotMatch(pagesWorkflow,/link-transcheduler-job-requirements-user-interests/);
  assert.doesNotMatch(manifestScript,/add-mutation-recovery-observability/);
  assert.doesNotMatch(pagesWorkflow,/add-mutation-recovery-observability/);
});

function writeManifest(extraEnv={}){
  const dir=mkdtempSync(join(tmpdir(),"datanest-release-manifest-"));
  const target=join(dir,"release-manifest.json");
  const env={...process.env};
  for (const key of Object.keys(env)) {
    if (key.startsWith("DATANEST_UI_")) delete env[key];
  }
  Object.assign(env,extraEnv);
  const result=spawnSync(process.execPath,[manifestWriter,target],{
    env,
    encoding:"utf8"
  });
  const json=result.status===0 ? JSON.parse(readFileSync(target,"utf8")) : null;
  rmSync(dir,{recursive:true,force:true});
  return {result,json};
}

test("release manifest preserves legacy shape when no UI governance environment is supplied",()=>{
  const {result,json}=writeManifest();
  assert.equal(result.status,0,result.stderr);
  assert.equal("uiGovernance" in json,false);
});

test("release manifest publishes progressive-live readiness and non-blocking gaps",()=>{
  const {result,json}=writeManifest({
    DATANEST_UI_RELEASE_SHA:"d".repeat(40),
    DATANEST_UI_RELEASE_STATE:"progressive_live"
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(json.releaseReadiness.mode,"progressive_live");
  assert.equal(json.releaseReadiness.deploymentAllowed,true);
  assert.ok(json.releaseReadiness.gapCount>0);
  assert.ok(json.releaseReadiness.gaps.every((gap)=>gap.blocking===false));
});

test("release manifest embeds UI governance traceability when UI release environment is supplied",()=>{
  const {result,json}=writeManifest({
    DATANEST_UI_RELEASE_SHA:"b".repeat(40),
    DATANEST_UI_RELEASE_STATE:"candidate",
    DATANEST_UI_PR_VERIFICATION_REF:"PR Verification #1291"
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(json.uiGovernance.releaseSha,"b".repeat(40));
  assert.equal(json.uiGovernance.releaseState,"candidate");
  assert.equal(json.uiGovernance.authorized,false);
  assert.equal(
    json.uiGovernance.evidence.prVerification.reference,
    "PR Verification #1291"
  );
});


test("file worker production deployment is bound to an exact SHA and protected environment",()=>{
  const workflow=readFileSync(
    new URL("../../.github/workflows/datanest-ai-file-worker-deploy.yml",import.meta.url),
    "utf8"
  );
  assert.match(workflow,/release_sha:/);
  assert.match(workflow,/ref: \$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow,/git merge-base --is-ancestor/);
  assert.match(
    workflow,
    /environment:\n      name: \$\{\{ inputs\.release_mode == 'progressive_live' && 'github-pages-progressive-live' \|\| 'github-pages' \}\}/
  );
  assert.match(workflow,/--no-verify-jwt/);
  assert.match(workflow,/supabase\/setup-cli@3c2f5e2ae34c34e428e8e206e2c4d21fa2d20fbf/);
  assert.match(workflow,/version: 2\.118\.0/);
  assert.match(workflow,/needs: \[validate\]/);
  assert.match(workflow,/write-production-file-worker-release-attestation\.mjs/);
  assert.match(workflow,/name: datanest-ai-file-worker-release-\$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow,/retention-days: 90/);
  const writer=readFileSync(
    new URL("../../scripts/write-production-file-worker-release-attestation.mjs",import.meta.url),
    "utf8"
  );
  assert.match(writer,/const sourceRoot=resolve\("supabase\/functions"\);/);
  assert.match(writer,/sourceTreeScope:"supabase\/functions"/);
});

test("governed Edge Function deployment treats timeframe as advisory",()=>{
  const workflow=readFileSync(
    new URL("../../.github/workflows/production-edge-function-release.yml",import.meta.url),
    "utf8"
  );
  assert.match(workflow,/  deploy:\n    name: Deploy governed Edge Functions from exact release SHA/);
  assert.match(workflow,/release_mode:[\s\S]*default: progressive_live/);
});


test("Pages workflow has a simple protected-main release path",()=>{
  assert.match(pagesWorkflow,/push:\n    branches:\n      - main/);
  assert.match(pagesWorkflow,/workflow_dispatch:/);
  assert.match(pagesWorkflow,/github.event_name == 'push'/);
  assert.match(pagesWorkflow,/GITHUB_EVENT_NAME" = "push"/);
  assert.doesNotMatch(pagesWorkflow,/workflow_run:/);
  assert.doesNotMatch(pagesWorkflow,/CONDUCTOR Process Synchronization Tree/);
  assert.match(pagesWorkflow,/environment:\n      name: github-pages/);
  assert.doesNotMatch(pagesWorkflow,/mirror_promotion_reference/);
  assert.doesNotMatch(pagesWorkflow,/database_migration_reference:/);
  assert.doesNotMatch(pagesWorkflow,/DATANEST_DB_RELEASE:/);
});

test("Pages release wiring derives the database attestation from the canonical contract",()=>{
  assert.match(pagesWorkflow,/Validate canonical production contract/);
  assert.match(pagesWorkflow,/DATANEST_EXPECTED_DB_MIGRATION_REFERENCE/);
  assert.match(pagesWorkflow,/verify-production-release-attestation\.mjs/);
  assert.match(pagesWorkflow,/verify-production-edge-function-release-reference\.mjs/);
  assert.match(
    pagesWorkflow,
    /edge_function_release_reference:\s*\$\{\{\s*steps\.edge_attestation_reference\.outputs\.reference\s*\}\}/
  );
  assert.match(pagesWorkflow,/Resolve connector Edge Function source reference/);
  assert.match(pagesWorkflow,/reference=connector:\$SOURCE_SHA/);
  assert.match(pagesWorkflow,/Stage Supabase connector Edge Function evidence/);
  assert.match(pagesWorkflow,/DATANEST_DB_ATTESTATION_FILE: \.datanest\/release-attestation\.json/);
  assert.match(edgeAttestationScript,/api\.supabase\.com\/v1\/projects/);
  assert.match(edgeAttestationScript,/SUPABASE_ACCESS_TOKEN/);
  assert.match(edgeAttestationScript,/ezbr_sha256/);
  assert.match(edgeAttestationScript,/workflowRunId/);
  assert.match(edgeAttestationScript,/edge-function-connector-attestation-v1/);
  assert.match(edgeAttestationScript,/sha256Tree/);
  assert.match(edgeAttestationScript,/git.*merge-base|merge-base/);
  assert.match(edgeReleaseWorkflow,/environment:/);
  assert.match(edgeReleaseWorkflow,/DATANEST_RELEASE_SHA/);
  assert.match(edgeReleaseWorkflow,/supabase functions deploy/);
  assert.match(edgeReleaseWorkflow,/write-production-edge-function-release-attestation\.mjs/);
});

test("release manifest records verified database and Edge Function attestations",()=>{
  const dir=mkdtempSync(join(tmpdir(),"datanest-release-attestation-"));
  const target=join(dir,"release-manifest.json");
  const dbPath=join(dir,"db.json");
  const edgePath=join(dir,"edge.json");
  const env={...process.env,DATANEST_DB_ATTESTATION_FILE:dbPath,DATANEST_EDGE_ATTESTATION_FILE:edgePath};
  for (const key of Object.keys(env)) {
    if (key.startsWith("DATANEST_UI_")) delete env[key];
  }
  writeFileSync(dbPath,JSON.stringify({
    schemaVersion:"release-attestation-v1",
    status:"verified",
    source:"live-production-database",
    verifiedAt:"2026-09-30T10:54:23.000Z",
    fingerprint:"a".repeat(64)
  }));
  writeFileSync(edgePath,JSON.stringify({
    schemaVersion:"edge-function-release-attestation-v2",
    status:"verified",
    source:"governed-production-edge-function-release",
    verifiedAt:"2026-09-30T10:54:24.000Z",
    workflowRunId:12345,
    sourceCommit:"b".repeat(40),
    sourceTreeSha256:"b".repeat(64),
    functions:{"datanest-ai-chat":{version:258,ezbr_sha256:"c".repeat(64)}}
  }));
  const result=spawnSync(process.execPath,[manifestWriter,target],{env,encoding:"utf8"});
  const json=result.status===0?JSON.parse(readFileSync(target,"utf8")):null;
  assert.equal(result.status,0,result.stderr);
  assert.equal(json.releaseAttestation.database.status,"verified");
  assert.equal(json.releaseAttestation.database.fingerprint,"a".repeat(64));
  assert.equal(json.releaseAttestation.edgeFunctions.status,"verified");
  assert.equal(json.releaseAttestation.edgeFunctions.functionCount,1);
  assert.equal(json.releaseAttestation.edgeFunctions.releaseReference,12345);
  assert.equal(json.releaseAttestation.edgeFunctions.sourceCommit,"b".repeat(40));
  assert.equal(json.releaseAttestation.edgeFunctions.sourceTreeSha256,"b".repeat(64));
  rmSync(dir,{recursive:true,force:true});
});


test("release manifest declares the production-inclusive surface contract from the catalog",()=>{
  const catalog=JSON.parse(fs.readFileSync(
    new URL("../../config/supository.catalog.json",import.meta.url),
    "utf8"
  ));
  assert.match(manifestScript,/productionInclusion:productionCatalog\.productionInclusion/);
  assert.equal(catalog.productionInclusion?.inclusive,true);
  for(const id of [
    "datanest",
    "datanest-assurance",
    "ronsas-career-compass",
    "ronsas-creative-studio",
    "ronsas-epublisher",
    "ronsas-lyricsync-studio",
    "ronsas-scene-song-spark",
    "ronsas-sovereign-forge",
    "ronsas-syncvision"
  ]){
    assert.ok(catalog.productionInclusion.publicSurfaces.includes(id),id);
  }
  assert.ok(catalog.productionInclusion.externalProductionSurfaces.includes("ronsas-youtube-optimizer"));
  assert.ok(catalog.productionInclusion.productionSupportComponents.includes("ronsas-sovereign-backend"));
  assert.ok(catalog.productionInclusion.productionSupportComponents.includes("ronsas-shared"));
  assert.match(pagesWorkflow,/DataNest\/assurance\//);
});
