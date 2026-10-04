import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const extract=await import("../../supabase/functions/_shared/datanestFileExtract.ts");
const worker=fs.readFileSync(
  path.join(root,"supabase/functions/datanest-ai-file-worker/documentExtract.ts"),
  "utf8"
);
const deno=JSON.parse(fs.readFileSync(
  path.join(root,"supabase/functions/datanest-ai-file-worker/deno.json"),
  "utf8"
));

test("PDF page assessment keeps exact one-based pages and flags low text for OCR",()=>{
  const page1=extract.pdfPageAssessment(1,"This page contains enough native PDF text to remain above the OCR threshold comfortably.");
  const page2=extract.pdfPageAssessment(2,"tiny");
  assert.deepEqual(page1.locator,{type:"pdf_page",page:1});
  assert.equal(page1.needsOcr,false);
  assert.deepEqual(page2.locator,{type:"pdf_page",page:2});
  assert.equal(page2.needsOcr,true);
  assert.throws(()=>extract.pdfPageAssessment(0,"text"),/one-based/);
});

test("PDF native worker extracts page-by-page and never runs OCR itself",()=>{
  assert.match(worker,/for\(let pageNumber=1;pageNumber<=pdf\.numPages;pageNumber\+\+\)/);
  assert.match(worker,/await pdf\.getPage\(pageNumber\)/);
  assert.match(worker,/await page\.getTextContent\(\)/);
  assert.match(worker,/pdfPageAssessment\(pageNumber,text\)/);
  assert.doesNotMatch(worker,/tesseract|ocrspace|vision api|runOcr/i);
});

test("DOCX archive budget rejects excessive entries or expanded bytes before XML parsing",()=>{
  assert.throws(
    ()=>extract.assertDocxArchiveBudget({entryCount:10_001,expandedBytes:0,hasDocumentXml:true}),
    /10,000 entry/
  );
  assert.throws(
    ()=>extract.assertDocxArchiveBudget({entryCount:2,expandedBytes:100*1024*1024+1,hasDocumentXml:true}),
    /100 MiB/
  );
  assert.throws(
    ()=>extract.assertDocxArchiveBudget({entryCount:2,expandedBytes:10,hasDocumentXml:false}),
    /word\/document\.xml/
  );

  const parseIndex=worker.indexOf("const parser=new XMLParser");
  const budgetIndex=worker.indexOf("assertDocxArchiveBudget({");
  assert.ok(budgetIndex>=0&&parseIndex>budgetIndex);
});

test("DOCX locators are block based and never invent rendered page numbers",()=>{
  assert.deepEqual(
    extract.docxBlockChunk({block:3,kind:"paragraph",heading:"Scope",text:"Requirement"}),
    {
      text:"Requirement",
      locator:{type:"docx_block",block:3,kind:"paragraph",heading:"Scope"}
    }
  );
  const docxSource=worker.slice(worker.indexOf("export async function extractDocx"));
  assert.doesNotMatch(docxSource,/type:"pdf_page"/);
  assert.doesNotMatch(docxSource,/renderedPage|pageNumber.*docx/i);
});

test("DOCX worker preserves headings, paragraphs, lists and tables",()=>{
  assert.match(worker,/meta\.kind==="heading"/);
  assert.match(worker,/kind:"list"/);
  assert.match(worker,/kind:"paragraph"/);
  assert.match(worker,/kind:"table"/);
  assert.match(worker,/preserveOrder:true/);
});

test("worker parser packages are exact pinned versions",()=>{
  assert.equal(deno.imports["pdfjs-dist/legacy/build/pdf.mjs"],"npm:pdfjs-dist@6.3.289/legacy/build/pdf.mjs");
  assert.equal(deno.imports.jszip,"npm:jszip@3.10.2");
  assert.equal(deno.imports["fast-xml-parser"],"npm:fast-xml-parser@5.11.1");
});
