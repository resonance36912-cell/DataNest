import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const readSource=(relativePath)=>{
  const absolutePath=path.join(repoRoot,relativePath);
  return fs.existsSync(absolutePath)?fs.readFileSync(absolutePath,"utf8"):"";
};

const legalRegistrySource=readSource("src/lib/legalRegistry.ts");

test("legal registry defines review-gated metadata for every required policy surface",()=>{
  assert.notEqual(legalRegistrySource,"","legalRegistry.ts must exist");
  for(const id of ["terms","privacy","disclaimers","acceptable-use","intellectual-property","governance","accessibility"]){
    assert.match(legalRegistrySource,new RegExp(`id:\\s*"${id.replace("-","\\-")}"`));
  }
  assert.match(legalRegistrySource,/export type LegalApprovalStatus\s*=\s*\|?\s*"draft-review-required"\s*\|\s*"approved"\s*\|\s*"superseded"/);
  assert.match(legalRegistrySource,/effectiveDate:\s*string\s*\|\s*null/);
  assert.doesNotMatch(legalRegistrySource,/new Date\s*\(/);
  assert.match(legalRegistrySource,/RESONANCE_BUSINESS_IDENTITY/);
  assert.match(legalRegistrySource,/RSGP_GOVERNANCE_LABEL/);
  assert.match(legalRegistrySource,/status:\s*"draft-review-required"/);
  assert.match(legalRegistrySource,/effectiveDate:\s*null/);
});


test("public governance disclosures keep RSGP descriptive and human-authorized",()=>{
  const governanceSource=readSource("src/components/legal/GovernanceDisclosure.tsx");
  const accessibilitySource=readSource("src/app/accessibility/page.tsx");
  const trustSource=readSource("src/components/platform/GovernanceTrustMark.tsx");

  assert.match(trustSource,/href="\/governance"/);
  assert.match(governanceSource,/Human authority remains final for consequential actions\./);
  for(const step of ["Self-audit","Automated verification","Security validation","Visual \/ UX review","Governance-impact review","Legal review where applicable","External \/ human review","Production authorization","Deployment","Post-deployment verification","Dossier \/ evidence update"]){
    assert.match(governanceSource,new RegExp(step.replaceAll("/","\\/")));
  }
  assert.doesNotMatch(governanceSource,/RSGP\s+(?:means|stands for|is short for)/i);
  assert.doesNotMatch(governanceSource,/(?:externally certified|certified by|accredited by|regulator[- ]approved)/i);
  assert.doesNotMatch(accessibilitySource,/WCAG\s*(?:2\.2)?\s*(?:AA)?\s*compliant/i);
});


test("review-gated policy routes avoid generated dates and unverified guarantees",()=>{
  const noticeSource=readSource("src/components/legal/LegalDraftNotice.tsx");
  const routeSources=[
    "src/app/terms/page.tsx",
    "src/app/privacy/page.tsx",
    "src/app/disclaimers/page.tsx",
    "src/app/acceptable-use/page.tsx",
    "src/app/intellectual-property/page.tsx"
  ].map(readSource);
  assert.notEqual(noticeSource,"","LegalDraftNotice.tsx must exist");
  assert.match(noticeSource,/Governed draft — not production policy/);
  assert.match(noticeSource,/Pending authorized human \/ legal review/);
  for(const source of routeSources){
    assert.notEqual(source,"","every governed draft route must exist");
    assert.doesNotMatch(source,/new Date\s*\(|Date\.now\s*\(|toLocaleDateString\s*\(/);
  }
  const combined=[noticeSource,...routeSources].join("\n");
  assert.doesNotMatch(combined,/industry[- ]standard encryption|not retained beyond|fully compliant|guaranteed secure|all data (?:is )?encrypted/i);
});


test("cross-app legal contract is structural and review-gated",()=>{
  const contractSource=readSource("apps/ronsas/shared/legal-contract.json");
  assert.notEqual(contractSource,"","apps/ronsas/shared/legal-contract.json must exist");
  const contract=JSON.parse(contractSource);
  assert.equal(contract.legalOperator,"Resonance Sole Proprietorship");
  assert.equal(contract.businessBrand,"Resonance App Development");
  assert.equal(contract.platform,"Resonance DataNest");
  assert.equal(contract.governanceLabel,"RSGP Governed");
  assert.equal(contract.policyState,"review-gated");
  assert.deepEqual(contract.routes,{
    legal:"/legal",
    governance:"/governance",
    privacy:"/privacy",
    terms:"/terms",
    disclaimers:"/disclaimers",
    acceptableUse:"/acceptable-use",
    intellectualProperty:"/intellectual-property",
    accessibility:"/accessibility"
  });
  assert.doesNotMatch(contractSource,/RSGP\s+(?:means|stands for|is short for)/i);
  assert.doesNotMatch(contractSource,/"policyState"\s*:\s*"approved"/i);
  assert.doesNotMatch(contractSource,/encryption|retention|jurisdiction|waiver|indemnif|liabilit/i);
});


test("legal review checklist cannot fabricate production approval",()=>{
  const checklist=readSource("docs/governance/legal-review/RESONANCE_DATANEST_LEGAL_REVIEW_CHECKLIST.md");
  assert.notEqual(checklist,"","legal review checklist must exist");
  for(const token of ["Document ID","Draft version","Evidence required","Review owner","Decision","Effective date","Approval reference"]){
    assert.match(checklist,new RegExp(token,"i"));
  }
  assert.match(checklist,/production legal approval is a human\/legal decision/i);
  assert.match(checklist,/blank[^\n]{0,80}review-required[^\n]{0,80}(?:not|never)[^\n]{0,80}approval/i);
  assert.doesNotMatch(checklist,/Approved by:\s*[A-Z][a-z]+\s+[A-Z][a-z]+/);
});


test("Legal Centre policy cards derive review labels from registry status",()=>{
  const centre=readSource("src/components/legal/GovernanceLegalCentre.tsx");
  assert.match(legalRegistrySource,/export function legalApprovalLabel\(/);
  assert.match(centre,/legalApprovalLabel\(document\.status\)/);
  assert.doesNotMatch(centre,/<strong>Human \/ legal review required<\/strong>/);
});
