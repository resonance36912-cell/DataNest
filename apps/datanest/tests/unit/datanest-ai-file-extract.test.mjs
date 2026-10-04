import test from "node:test";
import assert from "node:assert/strict";

const extract=await import("../../supabase/functions/_shared/datanestFileExtract.ts");

test("TXT extraction uses exact one-based line ranges",()=>{
  const result=extract.extractTxt("alpha\nbeta\ngamma");
  assert.equal(result.chunks.length,1);
  assert.deepEqual(result.chunks[0].locator,{type:"lines",start:1,end:3});
  assert.equal(result.chunks[0].text,"alpha\nbeta\ngamma");
});

test("TXT chunks never exceed the semantic character budget",()=>{
  const line="x".repeat(extract.MAX_EXTRACT_CHARS+25);
  const result=extract.extractTxt(line);
  assert.equal(result.chunks.length,2);
  assert.ok(result.chunks.every(chunk=>chunk.text.length<=extract.MAX_EXTRACT_CHARS));
  assert.deepEqual(result.chunks[0].locator,{type:"lines",start:1,end:1});
});

test("CSV extraction preserves header names and one-based source rows",()=>{
  const result=extract.extractCsv("name,status\nAda,active\nBen,paused");
  assert.equal(result.chunks.length,1);
  assert.deepEqual(result.chunks[0].locator,{
    type:"csv_rows",startRow:2,endRow:3,columns:["name","status"]
  });
  assert.equal(result.chunks[0].text,"name,status\nAda,active\nBen,paused");
});

test("CSV state machine supports quoted commas, escaped quotes and embedded newlines",()=>{
  const rows=extract.parseCsv('name,note\n"Ada, A.","line 1\nline 2"\nBen,"said ""hello"""');
  assert.deepEqual(rows,[
    ["name","note"],
    ["Ada, A.","line 1\nline 2"],
    ["Ben",'said "hello"']
  ]);
});

test("CSV rejects malformed records and fields over one MiB",()=>{
  assert.throws(()=>extract.parseCsv('name,note\nAda,"unterminated'),/Malformed CSV/);
  assert.throws(
    ()=>extract.parseCsv("name\n"+"x".repeat(extract.MAX_CSV_FIELD_BYTES+1)),
    /1 MiB/
  );
});

test("JSON extraction emits RFC 6901 pointers",()=>{
  const result=extract.extractJson(JSON.stringify({
    providers:{openai:{model:"gpt"}},
    "a/b":{"c~d":true}
  }));
  assert.ok(result.chunks.some(chunk=>chunk.locator.path==="/providers/openai/model"));
  assert.ok(result.chunks.some(chunk=>chunk.locator.path==="/a~1b/c~0d"));
  assert.equal(extract.escapeJsonPointerToken("a/b~c"),"a~1b~0c");
});

test("JSON rejects malformed input and nesting deeper than 100",()=>{
  assert.throws(()=>extract.extractJson("{broken"),/Malformed JSON/);
  let value='"leaf"';
  for(let index=0;index<101;index++)value='{"next":'+value+"}";
  assert.throws(()=>extract.extractJson(value),/nesting depth of 100/);
});

test("JSON semantic chunks remain bounded",()=>{
  const result=extract.extractJson(JSON.stringify({large:"z".repeat(extract.MAX_EXTRACT_CHARS*2)}));
  assert.ok(result.chunks.length>=2);
  assert.ok(result.chunks.every(chunk=>chunk.text.length<=extract.MAX_EXTRACT_CHARS));
  assert.ok(result.chunks.every(chunk=>chunk.locator.path==="/large"));
});

test("source locator formatter supports structured and future document locators",()=>{
  assert.equal(extract.formatSourceLocator({type:"lines",start:4,end:7}),"lines 4-7");
  assert.equal(
    extract.formatSourceLocator({type:"csv_rows",startRow:2,endRow:3,columns:["name","status"]}),
    "CSV rows 2-3 · name, status"
  );
  assert.equal(extract.formatSourceLocator({type:"json_pointer",path:"/providers/0"}),"JSON /providers/0");
  assert.equal(extract.formatSourceLocator({type:"pdf_page",page:2}),"PDF page 2");
  assert.equal(
    extract.formatSourceLocator({type:"docx_block",block:3,kind:"paragraph",heading:"Scope"}),
    "DOCX Scope · paragraph 3"
  );
});
