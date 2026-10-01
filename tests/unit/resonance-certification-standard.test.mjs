import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const standard=fs.readFileSync("docs/certification/RESONANCE_CERTIFICATION_STANDARD.md","utf8");
const source=fs.readFileSync("src/lib/resonanceCertification.ts","utf8");

test("RCS defines internal certification boundaries and market claim controls",()=>{
  for(const token of [
    "Resonance Certification Standard",
    "RCS-GOV-01",
    "RCS-PROD-01",
    "RCS-AI-01",
    "RCS-DATA-01",
    "RCS-OPS-01",
    "RCS-MKT-01",
    "introductory pricing is published",
    "paid checkout is currently disabled",
    "does not by itself represent ISO certification",
    "third-party / accredited certification"
  ]) assert.equal(standard.includes(token),true,token);
});

test("certification source declares classes, services and no external accreditation claim",()=>{
  for(const token of [
    'id:"RCS"',
    'version:"1.0"',
    'externalAccreditationClaim:false',
    'code:"RCS-SVC-01"',
    'code:"RCS-SVC-05"',
    'billingEnabled:false'
  ]) assert.equal(source.includes(token),true,token);
});
