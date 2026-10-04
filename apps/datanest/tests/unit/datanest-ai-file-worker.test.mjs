import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const worker=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-file-worker/index.ts"),"utf8");
const upload=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-upload/index.ts"),"utf8");
const config=fs.readFileSync(path.join(root,"supabase/config.toml"),"utf8");
const deploymentWorkflow=fs.readFileSync(path.join(root,".github/workflows/datanest-ai-file-worker-deploy.yml"),"utf8");
const queueMigration=fs.readFileSync(
  path.join(root,"supabase/staging-migrations/20260925193503_datanest_ai_file_worker_queue_contract.sql"),
  "utf8"
);
const analysisQueueMigration=fs.readFileSync(
  path.join(root,"supabase/staging-migrations/20260925195653_datanest_ai_file_analysis_queue_contract.sql"),
  "utf8"
);
const analysisRuntime=fs.readFileSync(
  path.join(root,"supabase/functions/_shared/datanestFileAnalysisRuntime.ts"),
  "utf8"
);

test("worker stays out of batch deploy while preserving internal service authentication",()=>{
  assert.doesNotMatch(config,/\[functions\.datanest-ai-file-worker\]/);
  assert.match(deploymentWorkflow,/--no-verify-jwt/);
  assert.match(deploymentWorkflow,/--use-docker/);
  assert.match(worker,/x-datanest-worker-auth/);
  assert.match(worker,/request\.headers\.get\("x-datanest-worker-auth"\)!==workerToken/);
  assert.match(worker,/const workerToken=requireEnv\("DATANEST_FILE_WORKER_TOKEN"\);/);
});

test("server digest is authoritative even when client SHA differs",()=>{
  const digestIndex=worker.indexOf("const verifiedHash=await sha256Bytes(bytes);");
  const compareIndex=worker.indexOf("clientHash===verifiedHash");
  const canonicalIndex=worker.indexOf("canonicalize(storage,String(current.storage_object_path||\"\"),verifiedHash)");
  assert.ok(digestIndex>=0&&compareIndex>digestIndex&&canonicalIndex>digestIndex);
  assert.match(worker,/verified_sha256:verifiedHash/);
  assert.match(worker,/client_hash_matches:clientHashMatches/);
  assert.doesNotMatch(worker,/verified_sha256:clientHash/);
});

test("canonical storage reuses an existing verified blob and removes only the temporary path",()=>{
  assert.match(worker,/const exists=await objectExists\(storage,canonical\)/);
  assert.match(worker,/if\(!exists\)\{[\s\S]{0,300}storage\.copy\(tempPath,canonical\)/);
  assert.match(worker,/if\(tempPath!==canonical\)[\s\S]{0,150}storage\.remove\(\[tempPath\]\)/);
  assert.match(worker,/canonicalBlobPath\(hash\)/);
});

test("READY redelivery is a no-op and queue acknowledgement happens only after durable result",()=>{
  assert.match(worker,/if\(item\.status==="READY"\)\{[\s\S]{0,180}updateSubmissionState\(client,String\(item\.submission_id\)\)[\s\S]{0,120}idempotent:true/);
  const processIndex=worker.indexOf("const result=await processItem(client,itemId);");
  const ackIndex=worker.indexOf('service_ack_datanest_file_item",{target_message:message.msg_id}',processIndex);
  assert.ok(processIndex>=0&&ackIndex>processIndex);
  assert.match(queueMigration,/pgmq\.read\('datanest_file_ingestion',visibility_seconds,target_limit\)/);
  assert.match(queueMigration,/pgmq\.delete\('datanest_file_ingestion',target_message\)/);
});

test("chunk commit is redelivery-safe with stable artifact, ordinal and identity hashes",()=>{
  assert.match(worker,/externalId="file-sha256:"\+hash/);
  assert.match(worker,/identityHash=await sha256Text\(JSON\.stringify\(chunk\.locator\)\+"\\n"\+contentHash\)/);
  assert.match(worker,/upsert\(rows,\{onConflict:"artifact_id,ordinal"\}\)/);
  assert.match(worker,/identity_sha256:identityHash/);
  assert.match(worker,/extracted_chunks:extracted\.result\.chunks/);
  assert.match(worker,/if\(String\(current\.status\)==="CHUNKING"\)/);
});

test("deterministic failures stop immediately and transient failures stop after attempt three",()=>{
  for(const code of [
    "UNSUPPORTED_TYPE",
    "FILE_TOO_LARGE",
    "INVALID_FILE_SIGNATURE",
    "ENCRYPTED_FILE_UNSUPPORTED",
    "OCR_REQUIRED_UNAVAILABLE"
  ])assert.match(worker,new RegExp('"'+code+'"'));
  assert.match(worker,/const MAX_ATTEMPTS=3/);
  assert.match(worker,/const terminal=deterministic\|\|attempt>=MAX_ATTEMPTS/);
  assert.match(worker,/status:terminal\?"FAILED":"QUEUED"/);
  assert.match(worker,/RETRY_EXHAUSTED/);
});

test("upload finalize wakes the worker in a non-blocking background task",()=>{
  assert.match(upload,/EdgeRuntime\.waitUntil/);
  assert.match(upload,/functions\/v1\/datanest-ai-file-worker/);
  assert.match(upload,/"x-datanest-worker-auth":stagingKey/);
  assert.match(upload,/wakeFileWorker\(stagingEnv\.url,stagingEnv\.key\)/);
});


test("terminal file state queues durable batch analysis and the worker drains both queues",()=>{
  assert.match(worker,/service_enqueue_datanest_file_analysis/);
  assert.match(worker,/terminal&&String\(submission\.status\)!=="ANALYZING"/);
  assert.match(worker,/const analysis=await drainFileAnalysis\(client\)/);
  assert.match(analysisQueueMigration,/pgmq\.send\([\s\S]*'datanest_file_analysis'/);
  assert.match(analysisQueueMigration,/pgmq\.read\('datanest_file_analysis',visibility_seconds,target_limit\)/);
  assert.match(analysisQueueMigration,/pgmq\.delete\('datanest_file_analysis',target_message\)/);
});

test("file analysis uses frozen memory only and stages deterministic evidence/response traces",()=>{
  assert.match(analysisRuntime,/submission\.certified_memory_snapshot/);
  assert.match(analysisRuntime,/submission\.certified_memory_ids/);
  assert.doesNotMatch(analysisRuntime,/get_certified_memory_context/);
  assert.doesNotMatch(analysisRuntime,/from\("certified_memory"\)/);
  assert.match(analysisRuntime,/source_type:"file_upload"/);
  assert.match(analysisRuntime,/source_type:"document_evidence"/);
  assert.match(analysisRuntime,/independence_key:"file-sha256:"\+group\.fileHash/);
  assert.match(analysisRuntime,/responseTrace=String\(submission\.trace_id\)\+"-RESPONSE"/);
  assert.match(analysisRuntime,/response_event_id:response\.id/);
});

test("all-failed batches skip the provider while partial failures remain response warnings",()=>{
  const providerGate=analysisRuntime.indexOf("if(readyItems.length&&selected.length)");
  const providerCall=analysisRuntime.indexOf("callOpenAiCompatibleProvider",providerGate);
  assert.ok(providerGate>=0&&providerCall>providerGate);
  assert.match(analysisRuntime,/appendFileWarnings\(providerAnswer,failedFiles\)/);
  assert.match(analysisRuntime,/failedFiles\.length\?"RESPONDED_WITH_WARNINGS":"RESPONDED"/);
});
