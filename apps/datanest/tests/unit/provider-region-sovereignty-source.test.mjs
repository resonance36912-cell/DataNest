import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929190612_provider_region_sovereignty_enforcement.sql"),
  "utf8"
);
const manager=fs.readFileSync(
  path.join(root,"supabase/functions/manage-ai-provider-v2/index.ts"),
  "utf8"
);
const ai=fs.readFileSync(
  path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),
  "utf8"
);
const ui=fs.readFileSync(
  path.join(root,"src/components/AiOperationsDashboard.tsx"),
  "utf8"
);

test("provider region sovereignty is evaluated inside the existing Phase C authority path",()=>{
  assert.match(migration,/provider_processing_region text/);
  assert.match(migration,/metadata->>'processing_region'/);
  assert.match(migration,/cardinality\(profile\.allowed_regions\)>0/);
  assert.match(migration,/provider_region_unresolved/);
  assert.match(migration,/provider_region_denied/);
  assert.match(migration,/unnest\(profile\.allowed_regions\)/);
  assert.match(migration,/'provider_processing_region',provider_processing_region/);
  assert.match(migration,/'provider_allowed_regions',coalesce\(to_jsonb\(profile\.allowed_regions\),'\[\]'::jsonb\)/);
});

test("processing-region declarations remain service scoped and project/user bounded",()=>{
  assert.match(migration,/service_set_ai_provider_processing_region_v1/);
  assert.match(migration,/c\.project_id=target_project/);
  assert.match(migration,/c\.user_id=target_user/);
  assert.match(migration,/service_set_shared_ai_provider_processing_region_v1/);
  assert.match(migration,/pm\.role in \('owner','admin'\)/);
  assert.match(migration,/revoke all on function public\.service_set_ai_provider_processing_region_v1[\s\S]*from public,anon,authenticated/);
  assert.match(migration,/grant execute on function public\.service_set_ai_provider_processing_region_v1[\s\S]*to service_role/);
  assert.match(migration,/revoke all on function public\.service_set_shared_ai_provider_processing_region_v1[\s\S]*from public,anon,authenticated/);
  assert.doesNotMatch(migration,/delete from/i);
  assert.doesNotMatch(migration,/truncate\s+/i);
});

test("shared provider synchronization preserves explicit region evidence",()=>{
  const occurrences=(migration.match(/'processing_region'/g)||[]).length;
  assert.ok(occurrences>=6,"expected processing region in setters, shared sync update/insert, and policy evidence");
  assert.match(migration,/coalesce\(cfg\.metadata->>'processing_region',''\)/);
  assert.match(migration,/existing\.metadata->>'processing_region'/);
  assert.match(migration,/'processing_region',nullif\(lower\(btrim\(coalesce\(cfg\.metadata->>'processing_region',''\)/);
  assert.match(migration,/metadata-'processing_region'-'processing_region_declared_at'/);
});

test("provider management accepts explicit region declarations without inferring them",()=>{
  assert.match(manager,/function parseProcessingRegion/);
  assert.match(manager,/body\?\.processingRegion/);
  assert.match(manager,/service_set_ai_provider_processing_region_v1/);
  assert.match(manager,/service_set_shared_ai_provider_processing_region_v1/);
  assert.doesNotMatch(manager,/processingRegion\s*=\s*endpoint/i);
  assert.doesNotMatch(manager,/processingRegion\s*=\s*.*endpoint\.host/i);
});

test("Phase C region findings are report-only unless the Trust Manifest is enforced",()=>{
  assert.match(migration,/if enforcement_mode='enforced' then[\s\S]{0,180}outcome:='deny'/);
  assert.match(migration,/if outcome='allow' then\s*reason_code:='provider_region_unresolved'/);
  assert.match(migration,/if outcome='allow' then\s*reason_code:='provider_region_denied'/);
});

test("ILM preserves report-only Phase C findings while enforced findings stop routing",()=>{
  assert.match(ai,/const providerPolicyEnforced=String\(providerPolicy\.enforcement_mode\|\|"report_only"\)==="enforced"/);
  assert.match(ai,/if\(providerPolicyEnforced&&String\(providerPolicy\.outcome\|\|"deny"\)!=="allow"\)return null/);
  assert.match(ai,/provider_processing_region:providerPolicy\.provider_processing_region\|\|null/);
  assert.match(ai,/provider_allowed_regions:providerPolicy\.provider_allowed_regions\|\|\[\]/);
  assert.match(ai,/provider_reason_code:providerPolicy\.reason_code\|\|null/);
});

test("AI Administration shows and sends region declarations as reviewed evidence",()=>{
  assert.match(ui,/Declared processing region/);
  assert.match(ui,/processingRegion/);
  assert.match(ui,/sharedProcessingRegion/);
  assert.match(ui,/processingRegion:sharedProcessingRegion/);
  assert.match(ui,/apiKey,processingRegion/);
  assert.match(ui,/metadata\?\.processing_region/);
  assert.match(ui,/DataNest does not infer region from hostname/);
});
