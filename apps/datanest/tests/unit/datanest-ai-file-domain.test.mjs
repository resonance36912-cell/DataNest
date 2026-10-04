import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const domain=await import("../../supabase/functions/_shared/datanestFileDomain.ts");

test("DataNest AI file limits are exact",()=>{
  assert.equal(domain.MAX_BATCH_FILES,10);
  assert.equal(domain.MAX_FILE_BYTES,25*1024*1024);
  assert.doesNotThrow(()=>domain.validateBatch(Array.from({length:10},(_,i)=>({
    name:`file-${i}.txt`,size:25*1024*1024,type:"text/plain"
  }))));
  assert.throws(()=>domain.validateBatch(Array.from({length:11},(_,i)=>({
    name:`file-${i}.txt`,size:1,type:"text/plain"
  }))),error=>error?.code==="BATCH_LIMIT_EXCEEDED");
  assert.throws(()=>domain.validateFileDescriptor({
    name:"too-large.pdf",size:25*1024*1024+1,type:"application/pdf"
  }),error=>error?.code==="FILE_TOO_LARGE");
});

test("supported MIME and extension pairs reject simple masquerades",()=>{
  const valid=[
    ["brief.pdf","application/pdf"],
    ["brief.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["notes.txt","text/plain"],
    ["data.csv","text/csv"],
    ["config.json","application/json"]
  ];
  for(const [name,type] of valid){
    assert.doesNotThrow(()=>domain.validateFileDescriptor({name,size:1,type}));
  }
  assert.throws(()=>domain.validateFileDescriptor({name:"payload.pdf",size:1,type:"application/json"}),error=>error?.code==="UNSUPPORTED_TYPE");
  assert.throws(()=>domain.validateFileDescriptor({name:"payload.exe",size:1,type:"application/octet-stream"}),error=>error?.code==="UNSUPPORTED_TYPE");
});

test("canonical blob path requires verified SHA-256",()=>{
  const hash="a".repeat(64);
  assert.equal(domain.canonicalBlobPath(hash),`sha256/aa/aa/${hash}`);
  assert.throws(()=>domain.canonicalBlobPath("client-hash"),/SHA-256/i);
});

test("retry classification separates transient from deterministic file errors",()=>{
  for(const value of [408,409,425,429,500,503,"UPLOAD_EXPIRED","OCR_FAILED","NETWORK_ERROR"]){
    assert.equal(domain.isRetryableFileError(value),true,String(value));
  }
  for(const value of [400,401,403,404,413,422,"UNSUPPORTED_TYPE","FILE_TOO_LARGE","INVALID_FILE_SIGNATURE","ENCRYPTED_FILE_UNSUPPORTED","JOB_ACCESS_DENIED"]){
    assert.equal(domain.isRetryableFileError(value),false,String(value));
  }
});

test("submission reduction preserves partial-success warning state",()=>{
  assert.equal(domain.reduceSubmissionStatus(["UPLOADING","UPLOADING"]),"UPLOADING");
  assert.equal(domain.reduceSubmissionStatus(["QUEUED","QUEUED"]),"QUEUED");
  assert.equal(domain.reduceSubmissionStatus(["VALIDATING","QUEUED"]),"PROCESSING");
  assert.equal(domain.reduceSubmissionStatus(["READY","READY"],true),"ANALYZING");
  assert.equal(domain.reduceSubmissionStatus(["READY","FAILED"],true,true),"RESPONDED_WITH_WARNINGS");
  assert.equal(domain.reduceSubmissionStatus(["READY","READY"],true,true),"RESPONDED");
  assert.equal(domain.reduceSubmissionStatus(["FAILED","FAILED"]),"FAILED");
});

test("browser upload helper pins signed Supabase TUS safety settings",()=>{
  const source=fs.readFileSync(path.join(root,"src/lib/datanestAiUpload.ts"),"utf8");
  assert.match(source,/from "tus-js-client"/);
  assert.match(source,/retryDelays:\[0,3000,5000,10000,20000\]/);
  assert.match(source,/chunkSize:6\*1024\*1024/);
  assert.match(source,/removeFingerprintOnSuccess:true/);
  assert.match(source,/"x-signature":token/);
  assert.match(source,/\\\.storage\\\.supabase\\\.co/);
  assert.match(source,/crypto\.subtle\.digest\("SHA-256"/);
});

test("TUS client dependency is pinned exactly",()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
  assert.equal(pkg.dependencies["tus-js-client"],"4.3.1");
});
