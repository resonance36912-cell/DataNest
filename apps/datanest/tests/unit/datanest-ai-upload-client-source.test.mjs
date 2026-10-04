import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const domain=await import("../../supabase/functions/_shared/datanestFileDomain.ts");
const client=fs.readFileSync(path.join(root,"src/lib/datanestAiUpload.ts"),"utf8");
const picker=fs.readFileSync(path.join(root,"src/components/DataNestAiUploadComposer.tsx"),"utf8");

test("batch and size limits reject before upload orchestration can invoke the network",()=>{
  assert.throws(
    ()=>domain.validateBatch(Array.from({length:11},(_,index)=>({
      name:"file-"+index+".txt",size:1,type:"text/plain"
    }))),
    error=>error?.code==="BATCH_LIMIT_EXCEEDED"
  );
  assert.throws(
    ()=>domain.validateBatch([{name:"large.txt",size:25*1024*1024+1,type:"text/plain"}]),
    error=>error?.code==="FILE_TOO_LARGE"
  );

  const validateIndex=client.indexOf("validateBatch(input.files);");
  const invokeIndex=client.indexOf("const invoke=input.invoke||invokeUploadGateway;");
  const hashIndex=client.indexOf("const descriptors=await Promise.all");
  assert.ok(validateIndex>=0&&validateIndex<invokeIndex&&validateIndex<hashIndex);
});

test("client SHA-256 is sent only as a provisional upload hint",()=>{
  assert.match(client,/clientSha256:await sha256File\(file\)/);
  assert.doesNotMatch(client,/verifiedSha256:/);
  assert.doesNotMatch(client,/verified_sha256:/);
});

test("each successful TUS upload is finalized and file failures stay isolated",()=>{
  const uploadIndex=client.indexOf("await upload({");
  const finalizeIndex=client.indexOf('action:"finalize_item"');
  assert.ok(uploadIndex>=0&&finalizeIndex>uploadIndex);
  assert.match(client,/const results=await Promise\.all\(input\.files\.map/);
  assert.match(client,/catch\(error\)\{[\s\S]{0,500}status:"FAILED"/);
  assert.match(client,/status:"QUEUED",error:null/);
});

test("upload slots are matched to stable client indexes",()=>{
  assert.match(client,/created\.items\.find\(item=>item\.clientIndex===index\)/);
  assert.match(client,/itemId:slot\.itemId/);
  assert.match(client,/objectPath:slot\.path/);
});

test("picker supports only approved extensions and never auto-submits selection",()=>{
  assert.match(picker,/accept="\.pdf,\.docx,\.txt,\.csv,\.json"/);
  assert.match(picker,/multiple/);
  assert.match(picker,/Selection does not upload automatically\./);
  assert.match(picker,/onSubmit=\{submit\}/);
  assert.match(picker,/await onSubmit\(files\)/);
  assert.doesNotMatch(picker,/onChange=\{[^}]*onSubmit/);
});

test("picker exposes removal, batch count and visible validation errors",()=>{
  assert.match(picker,/files\.length\+" selected"/);
  assert.match(picker,/removeFile\(index\)/);
  assert.match(picker,/role="alert"/);
  assert.match(picker,/MAX_BATCH_FILES/);
  assert.match(picker,/MAX_FILE_BYTES/);
});
