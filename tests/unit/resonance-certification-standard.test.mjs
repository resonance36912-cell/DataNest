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
    "published introductory pricing is active",
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


const pricing=fs.readFileSync("src/lib/resonanceCertification.ts","utf8");

test("ZAR pricing and bank-transfer settlement are the active business payment model",()=>{
  for(const token of [
    'currency:"ZAR"',
    'amount:12500',
    'amount:58500',
    'displayPrice:"ZAR 12,500"',
    'displayPrice:"From ZAR 58,500"',
    'amount:25000',
    'amount:21000'
  ]) assert.equal(pricing.includes(token),true,token);
  assert.equal(pricing.includes("bank-transfer settlement"),true);
});
