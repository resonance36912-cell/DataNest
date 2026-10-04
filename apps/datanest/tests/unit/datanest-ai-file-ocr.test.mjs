import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const ocr=await import("../../supabase/functions/_shared/datanestFileOcr.ts");
const provider=await import("../../supabase/functions/_shared/provider.ts");
const worker=fs.readFileSync(
  path.join(root,"supabase/functions/datanest-ai-file-worker/index.ts"),
  "utf8"
);

function connection(overrides={}){
  return {
    id:"00000000-0000-0000-0000-000000000001",
    provider:"test",
    label:"OCR test",
    api_base_url:"https://vision.example.com/chat",
    endpoint_host:"vision.example.com",
    model:"vision-1",
    secret:"test-secret",
    metadata:{
      capabilities:{ocr_pdf:true},
      ocr_endpoint:"https://vision.example.com/ocr"
    },
    ...overrides
  };
}

test("no explicit OCR capability fails closed as unavailable",async()=>{
  const conn=connection({metadata:{}});
  assert.equal(provider.resolveOcrPdfRoute(conn),null);
  await assert.rejects(
    ()=>ocr.runPdfOcr({
      connection:conn,
      pdfBytes:new Uint8Array([1,2,3]),
      pages:[1],
      fetchImpl:async()=>{throw new Error("must not call provider");}
    }),
    error=>error?.code==="OCR_REQUIRED_UNAVAILABLE"
  );
});

test("OCR endpoint must use HTTPS and the already-approved provider host",()=>{
  assert.throws(
    ()=>provider.resolveOcrPdfRoute(connection({
      metadata:{capabilities:{ocr_pdf:true},ocr_endpoint:"http://vision.example.com/ocr"}
    })),
    /provider_endpoint_rejected/
  );
  assert.throws(
    ()=>provider.resolveOcrPdfRoute(connection({
      metadata:{capabilities:{ocr_pdf:true},ocr_endpoint:"https://other.example.com/ocr"}
    })),
    /provider_endpoint_rejected/
  );
  assert.throws(
    ()=>provider.resolveOcrPdfRoute(connection({
      metadata:{capabilities:{ocr_pdf:true},ocr_endpoint:"https://user:pass@vision.example.com/ocr"}
    })),
    /provider_endpoint_rejected/
  );
});

test("adapter transmits only requested deficient pages",async()=>{
  let sent=null;
  const result=await ocr.runPdfOcr({
    connection:connection(),
    pdfBytes:new Uint8Array([37,80,68,70,45]),
    pages:[7,2,7],
    fetchImpl:async(_url,init)=>{
      sent=JSON.parse(String(init?.body||"{}"));
      return new Response(JSON.stringify({
        pages:[
          {page:2,text:"page two",confidence:0.91},
          {page:7,text:"page seven",confidence:0.87}
        ]
      }),{status:200,headers:{"Content-Type":"application/json"}});
    }
  });

  assert.deepEqual(sent.pages,[2,7]);
  assert.equal(sent.task,"ocr_pdf_pages");
  assert.equal(typeof sent.pdf_base64,"string");
  assert.deepEqual(result.map(item=>item.page),[2,7]);
  assert.ok(result.every(item=>item.extractionMethod==="ocr"));
  assert.ok(result.every(item=>item.extractionVersion==="datanest-ocr-v1"));
});

test("OCR response page set must match request exactly",async()=>{
  for(const pages of [
    [{page:1,text:"one"}],
    [{page:1,text:"one"},{page:2,text:"two"},{page:3,text:"extra"}],
    [{page:1,text:"one"},{page:1,text:"duplicate"}]
  ]){
    await assert.rejects(
      ()=>ocr.runPdfOcr({
        connection:connection(),
        pdfBytes:new Uint8Array([1]),
        pages:[1,2],
        fetchImpl:async()=>new Response(JSON.stringify({pages}),{
          status:200,headers:{"Content-Type":"application/json"}
        })
      }),
      error=>error?.code==="OCR_FAILED"
    );
  }
});

test("blank OCR page text fails instead of becoming successful extraction",async()=>{
  await assert.rejects(
    ()=>ocr.runPdfOcr({
      connection:connection(),
      pdfBytes:new Uint8Array([1]),
      pages:[1],
      fetchImpl:async()=>new Response(JSON.stringify({
        pages:[{page:1,text:"   ",confidence:0.5}]
      }),{status:200,headers:{"Content-Type":"application/json"}})
    }),
    error=>error?.code==="OCR_FAILED"
  );
});

test("worker sends only needs-OCR pages and persists OCR lineage",()=>{
  assert.match(worker,/status:Array\.isArray\(extracted\.ocrPages\)&&extracted\.ocrPages\.length\?"OCR":"CHUNKING"/);
  assert.ok(worker.includes('String(warning).match(/^PDF page (\\d+) needs OCR\\.$/)'));
  assert.match(worker,/runPdfOcr\(\{[\s\S]{0,220}pages:requestedPages/);
  assert.match(worker,/extraction_method:"pdfjs-native\+ocr"/);
  assert.match(worker,/ocr:chunk\.extractionMethod==="ocr"/);
  assert.match(worker,/confidence:chunk\.confidence\?\?null/);
  assert.match(worker,/OCR_REQUIRED_UNAVAILABLE/);
  assert.doesNotMatch(
    worker,
    /DETERMINISTIC_CODES=new Set\(\[[\s\S]{0,500}"OCR_FAILED"/
  );
});
