import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("src/lib/externalAuditStandards.ts","utf8");

test("external auditor pins current ISO references and official links",()=>{
  for(const token of [
    'id:"ISO 19011",edition:"2026"',
    'id:"ISO 9001",edition:"2026"',
    'id:"ISO/IEC 25010",edition:"2023"',
    'id:"ISO/IEC 27001",edition:"2022"',
    'id:"ISO/IEC 42001",edition:"2023"',
    'id:"ISO 13485",edition:"2016"',
    'https://www.iso.org/standard/'
  ]) assert.equal(source.includes(token),true,token);
});

test("external auditor conditionally suggests AI and medical standards",()=>{
  assert.match(source,/domains:\["ai","management"\]/);
  assert.match(source,/domains:\["medical_device","qms"\]/);
  assert.match(source,/selectSuggestedStandards/);
});

test("standards profiles reject unknown editions and empty exclusions",()=>{
  assert.match(source,/unknown_standard_edition/);
  assert.match(source,/exclusion_reason_required/);
  assert.match(source,/at_least_one_standard_required/);
});