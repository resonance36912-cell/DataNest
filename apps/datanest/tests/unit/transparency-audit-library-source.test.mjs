import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../../src/components/DataNestApp.tsx",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../../src/components/TransparencyWorkspace.tsx",import.meta.url),"utf8");
const registry=JSON.parse(readFileSync(new URL("../../public/transparency/audits/index.json",import.meta.url),"utf8"));
const auditReturn=readFileSync(new URL("../../public/transparency/audits/external-full-system-audit-return-2026-09-25/report.md",import.meta.url),"utf8");
const findings=JSON.parse(readFileSync(new URL("../../public/transparency/audits/external-full-system-audit-return-2026-09-25/findings.json",import.meta.url),"utf8"));
const backlog=JSON.parse(readFileSync(new URL("../../public/transparency/audits/external-full-system-audit-return-2026-09-25/remediation-backlog.json",import.meta.url),"utf8"));
const libertyDescriptor=JSON.parse(readFileSync(new URL("../../public/transparency/liberty-in-all/index.json",import.meta.url),"utf8"));

const fullBrief=Array.from({length:8},(_,index)=>
  readFileSync(
    new URL(`../../public/transparency/audits/external-full-system-audit-brief/part-${String(index+1).padStart(2,"0")}.txt`,import.meta.url),
    "utf8"
  )
).join("");

test("Transparency is a first-class DataNest continuity surface",()=>{
  assert.match(app,/label:"Transparency"/);
  assert.match(app,/view==="transparency"/);
  assert.match(workspace,/Audit library \+ public accountability record/);
});

test("audit library preserves the original accessible brief",()=>{
  assert.match(fullBrief,/External Full-System Audit Brief/);
  assert.match(fullBrief,/# 1\. How to Use This Audit Brief/);
  assert.match(fullBrief,/# 21\. Required End-to-End Audit Journeys/);
  assert.match(fullBrief,/# 27\. Copy\/Paste Return Format/);
  assert.match(fullBrief,/END OF EXTERNAL AUDIT BRIEF\s*$/);
  assert.ok(fullBrief.length>40000,"full accessible audit brief should not be shortened");
});

test("external audit return is preserved as the complete source artifact",()=>{
  assert.match(auditReturn,/RESONANCE DATANEST \/ RONSAS - EXTERNAL AUDIT RETURN/);
  assert.match(auditReturn,/## 1\. Executive Summary/);
  assert.match(auditReturn,/### AUD-001/);
  assert.match(auditReturn,/### AUD-014/);
  assert.match(auditReturn,/## 13\. Prioritized Optimization Backlog/);
  assert.match(auditReturn,/Final assessment:/);
  assert.ok(auditReturn.length>50000,"external audit return should remain the complete uploaded source artifact");
});

test("structured findings preserve every stable audit ID without upgrading validation state",()=>{
  assert.equal(findings.audit_id,"external-full-system-audit-return-2026-09-25");
  assert.equal(findings.certification_status,"not_a_full_production_certification");
  assert.equal(findings.validation_state,"pending_datanest_validation");
  assert.equal(findings.findings.length,14);

  const ids=findings.findings.map(item=>item.id);
  assert.deepEqual(ids,Array.from({length:14},(_,index)=>`AUD-${String(index+1).padStart(3,"0")}`));
  assert.ok(findings.findings.every(item=>item.validation_state==="pending"));
  assert.equal(findings.findings.filter(item=>item.severity.startsWith("HIGH")).length,9);
  assert.equal(findings.findings.filter(item=>item.severity.startsWith("MEDIUM")).length,5);
});

test("reported remediation backlog remains proposed until DataNest validation",()=>{
  assert.equal(backlog.status,"reported_proposals_pending_datanest_validation");
  assert.equal(backlog.items.length,13);
  assert.ok(backlog.items.some(item=>item.finding_ids.includes("AUD-013")&&item.priority==="P1 verify"));
  assert.ok(backlog.items.some(item=>item.finding_ids.includes("AUD-014")&&item.priority==="P2"));
});

test("transparency registry links methodology and audit return without granting authority",()=>{
  assert.equal(registry.schema_version,1);
  const brief=registry.documents.find(item=>item.id==="external-full-system-audit-brief-v1");
  const result=registry.documents.find(item=>item.id==="external-full-system-audit-return-2026-09-25");
  assert.ok(brief);
  assert.ok(result);
  assert.equal(brief.audit_result_status,"external_audit_return_received");
  assert.equal(result.document_type,"audit_return");
  assert.equal(result.audit_result_status,"published_pending_datanest_validation");
  assert.equal(result.findings.total,14);
  assert.equal(result.findings.high_or_verification_priority,9);
  assert.equal(result.findings.medium,5);
  assert.equal(result.remediation.validated_or_closed,0);
  assert.equal(result.authority.certification_effect,false);
  assert.equal(result.authority.governance_effect,false);
  assert.equal(result.authority.financial_effect,false);
});

test("transparency UI distinguishes reported findings from DataNest validation",()=>{
  assert.match(workspace,/Read external audit return/);
  assert.match(workspace,/View 14 findings/);
  assert.match(workspace,/DataNest validation pending/);
  assert.match(workspace,/not a full production certification/i);
  assert.match(workspace,/exact uploaded Markdown/i);
  assert.match(workspace,/Structured findings and backlog files are derived indexes/);
  assert.match(workspace,/aria-label="Complete external audit return source artifact"/);
  assert.doesNotMatch(workspace,/dangerouslySetInnerHTML/);
});

test("public transparency index publishes the result with explicit limitations",()=>{
  const html=readFileSync(new URL("../../public/transparency/index.html",import.meta.url),"utf8");
  assert.match(html,/Transparency and Audit Library/);
  assert.match(html,/EXTERNAL AUDIT RETURN PUBLISHED/);
  assert.match(html,/14 findings/);
  assert.match(html,/not a full production certification/);
  assert.match(html,/Structured findings \(JSON\)/);
  assert.match(html,/Reported remediation backlog \(JSON\)/);
  assert.match(html,/External audit return received 25 Sep 2026/);
});


test("LIBERTY-IN-ALL is embedded with live sanitized traceability",()=>{
  const html=readFileSync(new URL("../../public/transparency/index.html",import.meta.url),"utf8");
  assert.match(workspace,/LIBERTY-IN-ALL · CONTINUOUS TRACEABILITY/);
  assert.match(workspace,/raw\.githubusercontent\.com\/DataNest-Supository\/DataNest\/automation\/liberty-in-all/);
  assert.match(workspace,/Indexed evidence/);
  assert.match(html,/LIBERTY-IN-ALL · CONTINUOUS TRACEABILITY/);
  assert.match(html,/Current traceability snapshot/);
  assert.match(String(libertyDescriptor.latest),/automation\/liberty-in-all/);
  assert.equal(libertyDescriptor.disclosure.recordContents,false);
  assert.equal(libertyDescriptor.disclosure.secrets,false);
  assert.equal(libertyDescriptor.assurance.productionAuthorization,false);
});
