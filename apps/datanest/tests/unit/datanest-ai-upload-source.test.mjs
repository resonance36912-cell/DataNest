import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const source=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-upload/index.ts"),"utf8");
const config=fs.readFileSync(path.join(root,"supabase/config.toml"),"utf8");
const edgeValidation=fs.readFileSync(path.join(root,".github/workflows/edge-function-validation.yml"),"utf8");

test("DataNest AI upload gateway is JWT protected and uses explicit Job authorization",()=>{
  assert.match(config,/\[functions\.datanest-ai-upload\][\s\S]*verify_jwt\s*=\s*true/);
  assert.match(source,/auth\.getUser\(\)/);
  assert.match(source,/authorize_datanest_ai_file_access/);
  assert.match(source,/await authorizeJob\(userClient,jobId\)/);
});

test("upload slots are server generated on dedicated staging TUS",()=>{
  assert.match(source,/incoming\/"\+submissionId\+"\/"\+String\(item\.id\)\+"\/"/);
  assert.match(source,/qchttpcyqlqnhvahprhz\.storage\.supabase\.co\/storage\/v1\/upload\/resumable/);
  assert.match(source,/createSignedUploadUrl\(path,\{upsert:false\}\)/);
  assert.match(source,/validateBatch\(files\)/);
});

test("file queue wake-up sends only item identifiers through a service-only RPC",()=>{
  assert.match(source,/service_enqueue_datanest_file_item/);
  assert.match(source,/target_item:itemId/);
  assert.match(source,/target_queue:"datanest_file_ingestion"/);
});

test("all post-create actions reauthorize the selected Job before staging reads",()=>{
  const authorizationIndex=source.indexOf("await authorizeJob(userClient,jobId);");
  for(const action of ['if(action==="finalize_item")','if(action==="status")','if(action==="retry_item")','if(action==="source_link")']){
    const actionIndex=source.indexOf(action);
    assert.ok(actionIndex>authorizationIndex,action+" must run after authorization");
  }
});

test("source links require canonical server-verified SHA paths",()=>{
  assert.match(source,/verified_sha256/);
  assert.match(source,/sha256\/"\+hash\.slice\(0,2\)\+"\/"\+hash\.slice\(2,4\)\+"\/"\+hash/);
  assert.match(source,/createSignedUrl\(path,60\)/);
});

test("gateway never serializes service credentials",()=>{
  assert.match(source,/DATANEST_AI_STAGING_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source,/json\(\{[^}]*serviceKey/);
  assert.doesNotMatch(source,/json\(\{[^}]*stagingEnv\.key/);
});


test("submission creation freezes certified memory but status never serializes it",()=>{
  assert.match(source,/certifiedMemorySnapshot=memoryItems\.map/);
  assert.match(source,/certified_memory_snapshot:certifiedMemorySnapshot/);
  assert.match(source,/certified_memory_ids:certifiedMemoryIds/);
  const loadSubmission=source.slice(
    source.indexOf("async function loadSubmission"),
    source.indexOf("async function loadItemWithSubmission")
  );
  assert.doesNotMatch(loadSubmission,/select\("\*"\)/);
  assert.doesNotMatch(loadSubmission,/certified_memory_snapshot/);
  assert.doesNotMatch(loadSubmission,/certified_memory_ids/);
});


test("submission freezes the production project-learning policy for staging analysis",()=>{
  assert.match(source,/createClient\(supabaseUrl,serviceKey/);
  assert.match(source,/service_evaluate_data_policy_v1/);
  assert.match(source,/target_purpose:"project_learning"/);
  assert.match(source,/target_requested_operation:"reuse"/);
  assert.match(source,/learning_policy_outcome/);
  assert.match(source,/learning_reuse_state/);
  assert.match(source,/learning_policy_version/);
  assert.match(source,/learning_decision_record_id/);
});


test("edge validation type-checks the upload gateway and file worker",()=>{
  assert.match(edgeValidation,/\r?\n\s*- datanest-ai-upload\r?\n/);
  assert.match(edgeValidation,/\r?\n\s*- datanest-ai-file-worker\r?\n/);
});
