import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const dual=fs.readFileSync(path.join(root,"supabase/functions/_shared/dualAdvocacy.ts"),"utf8");
const gateway=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),"utf8");
const products=fs.readFileSync(path.join(root,"src/components/ProductsWorkspace.tsx"),"utf8");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20260928223000_promote_legal_eagle_product.sql"),"utf8");

test("Legal Eagle uses the governed dual-advocacy contract",()=>{
  assert.match(dual,/export function buildLegalEaglePrompt/);
  assert.match(dual,/ANGEL'S ADVOCATE/);
  assert.match(dual,/DEVIL'S ADVOCATE/);
  assert.match(dual,/SYNTHESIS/);
  assert.match(dual,/Do not choose a legal winner or promise an outcome/);
  assert.match(gateway,/legalMode\s*\?buildLegalEaglePrompt/);
  assert.match(gateway,/legalMode\s*\?formatDualAdvocacyResponse\(parseDualAdvocacyResponse\(ext\.content\)\)/);
  assert.match(gateway,/dualAdvocacy:legalMode\|\|developmentMode/);
});

test("Legal Eagle stays matter-scoped and excluded from automatic learning",()=>{
  assert.match(gateway,/const reuseState=\(legalMode\|\|developmentMode\)\s*\?"session_context"/);
  assert.match(gateway,/const learningEligible=!legalMode&&!developmentMode&&reuseState==="project_learning_eligible"/);
  assert.match(gateway,/if\(legalMode\)\{\s*trendAnalysis=\{status:"not_applicable"\}/);
  assert.match(products,/datanest\.legalEagle\.session\."\+projectId\+"\."\+userId\+"\."\+jobId/);
  assert.match(products,/productMode:"legal_eagle"/);
  assert.doesNotMatch(products,/channelMode:"development_command"[\s\S]{0,240}productMode:"legal_eagle"/);
});

test("Legal Eagle renders Angel and Devil positions side by side",()=>{
  assert.match(products,/function parseLegalDualAdvocacy/);
  assert.match(products,/className="legalDualGrid"/);
  assert.match(products,/ANGEL&apos;S ADVOCATE/);
  assert.match(products,/DEVIL&apos;S ADVOCATE/);
  assert.match(products,/SYNTHESIS/);
});

test("Legal Eagle is promoted as a governed free-promotion product",()=>{
  assert.match(migration,/'legal-eagle'/);
  assert.match(migration,/'Resonance Assistance · Legal Eagle'/);
  assert.match(migration,/'free promotion \/ no billing until pricing is established'/);
  assert.match(migration,/false,\s*date '2026-09-28'/);
  assert.match(migration,/'reuse_state','session_context'/);
  assert.match(migration,/'automatic_project_learning',false/);
  assert.match(migration,/'LEGAL-EAGLE:DUAL'/);
  assert.match(migration,/'LEGAL-EAGLE:HUMAN'/);
});
