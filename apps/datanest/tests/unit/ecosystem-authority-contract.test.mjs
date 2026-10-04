import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const authorityPath=path.join(root,"src/lib/ecosystemAuthority.ts");
const products=fs.readFileSync(path.join(root,"src/components/ProductsWorkspace.tsx"),"utf8");
const app=fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");

test("canonical ecosystem authority constants are exported with exact approved values", async()=>{
  assert.equal(
    fs.existsSync(authorityPath),
    true,
    "src/lib/ecosystemAuthority.ts must define the canonical authority copy"
  );
  const authority=await import(pathToFileURL(authorityPath).href);
  assert.equal(authority.DATANEST_PLATFORM_NAME,"DataNest");
  assert.equal(authority.RONSAS_PRODUCT_NAME,"Resonance");
  assert.equal(authority.RONSAS_FULL_NAME,"Resonance Application Suite");
  assert.equal(authority.RONSAS_PRODUCT_PATH,"Resonance AppDev > DataNest > Products > Resonance");
  assert.equal(authority.FREE_PROMOTION_LABEL,"FREE PROMOTION · BILLING OFF");
  assert.equal(authority.SPARKS_WORKSPACE_DESCRIPTION,"Use earned contribution utility for approved project services.");
  assert.equal(authority.SPARKS_TASK_START,"Review earned Sparks and approved project services before reserving utility for a governed service.");
  assert.equal(authority.SPARKS_TASK_COMPLETE,"The intended Spark service is reserved, fulfilled, cancelled, or intentionally left unchanged.");
  assert.equal(authority.SPARKS_TASK_EVIDENCE,"Append-only Spark ledger, balances, reservations, and approved service records.");
});

test("Products consumes the canonical RONSAS and free-promotion authority copy",()=>{
  assert.match(products,/from "@\/lib\/ecosystemAuthority"/);
  assert.match(products,/RESONANCE_FULL_NAME/);
  assert.match(products,/FREE_PROMOTION_LABEL/);
  assert.doesNotMatch(products,/const RESONANCE_FULL_NAME=/);
});

test("Sparks workspace guidance consumes canonical internal-utility copy",()=>{
  for(const symbol of [
    "SPARKS_WORKSPACE_DESCRIPTION",
    "SPARKS_TASK_START",
    "SPARKS_TASK_COMPLETE",
    "SPARKS_TASK_EVIDENCE"
  ]){
    assert.match(app,new RegExp(symbol));
  }
});


test("authority documentation keeps target-state concepts honest and Sparks aligned",()=>{
  const readme=fs.readFileSync(path.join(root,"README.md"),"utf8");
  const architecture=fs.readFileSync(path.join(root,"docs/ARCHITECTURE.md"),"utf8");
  const ux=fs.readFileSync(path.join(root,"docs/UX_WORKFLOW_ARCHITECTURE.md"),"utf8");

  for(const source of [readme,architecture]){
    assert.match(source,/DataNest[\s\S]{0,120}(parent platform|control plane)/i);
    if(source===architecture){
      assert.match(source,/Resonance[\s\S]{0,240}governed customer application suite/i);
    }else{
      assert.match(source,/Customer suite[\s\S]{0,240}Resonance/i);
    }
    assert.match(source,/Cloud-Nest/);
    assert.match(source,/Supository/);
    assert.match(source,/\bILM\b/);
    assert.match(source,/(target-state|not yet live)/i);
    for(const concept of ["Cloud-Nest","Supository"]){
      const positiveClaim=source.split("\n").find(line=>
        line.includes(concept)
        && /\b(live|implemented)\b/i.test(line)
        && !/(not yet live|target-state|planned|later implementation|outside Phase)/i.test(line)
      );
      assert.equal(positiveClaim,undefined,concept+" must not be represented as a live/implemented capability.");
    }
  }

  assert.match(ux,/Sparks — earned contribution utility for approved project services\./);
  assert.doesNotMatch(ux,/Sparks — capture intent and raw ideas\./);

  assert.match(readme,/https:\/\/datanest-supository\.github\.io\/DataNest\//);
  assert.match(readme,/GitHub Pages.*current public delivery target/i);
  assert.match(readme,/Supabase/i);

  assert.match(architecture,/## Authority and Execution Controls/);
  assert.match(architecture,/external_ai_provider/);
  assert.match(architecture,/job_start/);
  assert.match(architecture,/report-only/i);
  assert.match(architecture,/exact-action approval/i);
  assert.match(architecture,/## Resource and Capability Fabric/);
  assert.match(architecture,/## Intelligence Fabric and ILM-1/);
  assert.match(architecture,/ILM-1 is an orchestration abstraction[\s\S]{0,260}\*\*not\*\* a trained proprietary foundation model/i);
  assert.match(architecture,/Cloud-Nest[\s\S]{0,220}target-state \/ not yet live/i);
  assert.match(architecture,/does not add a generic destructive, legal, financial, ownership or constitutional executor/i);
  assert.match(architecture,/does not invent a currency\/pricing unit/i);

  assert.match(ux,/## Governance and execution authority/);
  assert.match(ux,/Sovereign Governance/);
  assert.match(ux,/Trust & Data Policy/);
  assert.match(ux,/Authority & Execution/);
  assert.match(ux,/AVAILABLE != authorized/);
  assert.match(ux,/Capability Lease != capacity reservation/);
  assert.match(ux,/latest matching enforced decision is `allow`/);
});


test("governed-memory design records the 2026-09-27 retention supersession",()=>{
  const memoryDesign=fs.readFileSync(
    path.join(root,"docs/superpowers/specs/2026-09-24-datanest-ai-governed-memory-design.md"),
    "utf8"
  );
  const masterSpec=fs.readFileSync(
    path.join(root,"docs/superpowers/specs/2026-09-27-datanest-ecosystem-business-operating-architecture-design.md"),
    "utf8"
  );

  assert.match(memoryDesign,/## Retention Supersession Amendment — 2026-09-27/);
  assert.match(memoryDesign,/policy-driven retention/i);
  assert.match(memoryDesign,/classification/i);
  assert.match(memoryDesign,/declared purpose/i);
  assert.match(memoryDesign,/legal or contractual obligations/i);
  assert.match(memoryDesign,/does not authorize deletion/i);
  assert.match(memoryDesign,/existing records/i);

  assert.match(masterSpec,/Retention amendment/i);
  assert.match(masterSpec,/does not itself authorize implementation/i);
});
