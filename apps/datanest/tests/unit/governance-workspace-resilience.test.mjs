import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const source=fs.readFileSync(path.join(root,"src/components/GovernanceWorkspace.tsx"),"utf8");

test("Governance workspace rejects non-object RPC payloads before rendering",()=>{
  assert.match(source,/function normalizeGovernanceWorkspace\(value:unknown\):Workspace\|null/);
  assert.match(source,/typeof value!=="object"\|\|Array\.isArray\(value\)\)return null/);
  assert.match(source,/const next=normalizeGovernanceWorkspace\(data\)/);
});

test("Governance workspace normalizes collection fields before filter and map use",()=>{
  for(const field of ["draft_protocols","proposals","decisions","disputes"]){
    assert.match(source,new RegExp(field+":Array\\.isArray\\(item\\."+field+"\\)\\?item\\."+field+":\\[\\]"));
  }
  assert.match(source,/boundaries:boundaries&&typeof boundaries==="object"&&!Array\.isArray\(boundaries\)/);
});


test("consequential governance surfaces use the shared governed-action lifecycle",()=>{
  const improvement=fs.readFileSync(path.join(root,"src/components/GovernanceImprovementPanel.tsx"),"utf8");
  const authority=fs.readFileSync(path.join(root,"src/components/ExecutionAuthorityPanel.tsx"),"utf8");
  const auditor=fs.readFileSync(path.join(root,"src/components/ExternalAuditor.tsx"),"utf8");
  const governed=fs.readFileSync(path.join(root,"src/components/platform/GovernedAction.tsx"),"utf8");

  assert.match(source,/import GovernedAction(?:,\s*\{[^}]+\})? from "@\/components\/platform\/GovernedAction"/);
  assert.match(improvement,/import GovernedAction(?:,\s*\{[^}]+\})? from "@\/components\/platform\/GovernedAction"/);
  assert.match(authority,/import GovernedAction(?:,\s*\{[^}]+\})? from "@\/components\/platform\/GovernedAction"/);
  assert.match(auditor,/import GovernedAction(?:,\s*\{[^}]+\})? from "@\/components\/platform\/GovernedAction"/);
  assert.match(governed,/data-governed-stage=\{stage\}/);
  assert.doesNotMatch(governed,/export\s+export/);
  assert.match(authority,/review-required/);
  assert.match(improvement,/review-required/);
  assert.match(auditor,/review-required/);
});
