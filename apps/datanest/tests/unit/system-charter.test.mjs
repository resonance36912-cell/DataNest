import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const charter=readFileSync(new URL("../../docs/DATANEST_SYSTEM_CHARTER.md",import.meta.url),"utf8");
const page=readFileSync(new URL("../../src/app/system-charter/page.tsx",import.meta.url),"utf8");
const transparency=readFileSync(new URL("../../src/components/TransparencyWorkspace.tsx",import.meta.url),"utf8");
const legacy=readFileSync(new URL("../../public/transparency/index.html",import.meta.url),"utf8");
const charterIndex=JSON.parse(readFileSync(new URL("../../public/transparency/system-charter/index.json",import.meta.url),"utf8"));
const visibilityIndex=JSON.parse(readFileSync(new URL("../../public/transparency/visibility-utility/index.json",import.meta.url),"utf8"));
const auditRegistry=JSON.parse(readFileSync(new URL("../../public/transparency/audits/index.json",import.meta.url),"utf8"));
const sitemap=readFileSync(new URL("../../public/sitemap.xml",import.meta.url),"utf8");
const robots=readFileSync(new URL("../../public/robots.txt",import.meta.url),"utf8");

test("System Charter publishes core system scope",()=>{
  for(const heading of [
    "## 2. Scope intent","## 3. Mission","## 4. Vision","## 5. Core value proposition",
    "## 7. Governance model","## 8. Specialized-tree architecture","## 10. Infrastructure",
    "## 11. Products and services","## 23. Projection framework","## 24. Transparency model"
  ]) assert.ok(charter.includes(heading),heading);
});

test("standards crosswalk is explicit and does not claim certification",()=>{
  for(const standard of [
    "ISO 9001:2026","ISO/IEC 27001:2022","ISO/IEC 42001:2023","ISO/IEC 27701:2025",
    "ISO 37000:2021","ISO 37301:2021","ISO 31000:2018","ISO 22301:2019",
    "ISO/IEC 25010:2023","ISO 9241-210:2019","WCAG 2.2","NIST CSF 2.0","CIS Critical Security Controls v8.1","NIST AI RMF 1.0"
  ]) assert.ok(charter.includes(standard),standard);
  assert.match(charter,/not a claim of ISO certification/i);
  assert.equal(charterIndex.assurance.isoCertified,false);
  assert.equal(charterIndex.assurance.accreditationClaimed,false);
  assert.equal(charterIndex.assurance.guaranteedBusinessOutcomes,false);
});

test("System Charter is embedded in React and static transparency surfaces",()=>{
  assert.match(page,/DATANEST_SYSTEM_CHARTER\.md/);
  assert.match(transparency,/Open System Charter/);
  assert.match(legacy,/PUBLIC SYSTEM CHARTER/);
  assert.match(legacy,/VISIBILITY-UTILITY transparency/);
});

test("public discovery assets expose charter without granting market authority",()=>{
  assert.ok(sitemap.includes("/DataNest/system-charter/"));
  assert.ok(robots.includes("Sitemap: https://datanest-supository.github.io/DataNest/sitemap.xml"));
  assert.equal(visibilityIndex.authority.productionAuthorization,false);
  assert.equal(visibilityIndex.authority.marketingSpend,false);
  assert.equal(visibilityIndex.authority.bindingSales,false);
});

test("transparency registry includes charter and market intelligence limitations",()=>{
  const system=auditRegistry.documents.find(x=>x.id==="datanest-system-charter-v1");
  const visibility=auditRegistry.documents.find(x=>x.id==="visibility-utility-continuous-market-intelligence");
  assert.ok(system);
  assert.ok(visibility);
  assert.equal(system.assurance.iso_certified,false);
  assert.equal(system.assurance.guaranteed_business_outcomes,false);
  assert.equal(visibility.coverage.guaranteed_outcomes,false);
  assert.equal(visibility.coverage.marketing_spend_authority,false);
});
