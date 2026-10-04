import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const gateway=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),"utf8");
const panel=fs.readFileSync(path.join(root,"src/components/DataNestAiChatPanel.tsx"),"utf8");
const css=fs.readFileSync(path.join(root,"src/app/globals.css"),"utf8");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20260928190000_add_development_command_working_memory.sql"),"utf8");

test("Development Command is an explicit cumulative working-memory channel",()=>{
  assert.match(panel,/channelMode:"development_command"/);
  assert.match(gateway,/channelMode=String\(body\.channelMode\|\|""\)\.trim\(\)/);
  assert.match(gateway,/const developmentMode=channelMode==="development_command"&&!legalMode/);
  assert.match(gateway,/trustState:workingMemoryStatus==="recorded"\?"WORKING_MEMORY":"UNCERTIFIED"/);
  assert.match(gateway,/cumulativeWorkingMemory:workingMemoryStatus==="recorded"/);
  assert.match(gateway,/workingMemoryStatus=recordedTurn\?"recorded":"not_recorded"/);
});

test("Development Command responses expose both advocacy positions plus synthesis",()=>{
  assert.match(gateway,/buildDevelopmentCommandPrompt/);
  assert.match(gateway,/formatDualAdvocacyResponse/);
  assert.match(panel,/ANGEL&apos;S ADVOCATE/);
  assert.match(panel,/DEVIL&apos;S ADVOCATE/);
  assert.match(panel,/SYNTHESIS/);
  assert.match(css,/\.datanestAiAdvocacyGrid/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("cumulative working memory remains separated from Certified Memory and user-scoped",()=>{
  assert.match(migration,/create table if not exists public\.development_command_working_memory/);
  assert.match(migration,/memory_kind text not null check/);
  assert.match(gateway,/\.or\("user_id\.is\.null,user_id\.eq\."\+userId\)/);
  assert.match(gateway,/sha256Text\(input\.userId\+"\|"\+input\.command\)/);
  assert.match(gateway,/sha256Text\(input\.userId\+"\|"\+input\.dual\.synthesis\)/);
  assert.match(gateway,/const learningEligible=!legalMode&&!developmentMode&&reuseState==="project_learning_eligible"/);
  assert.match(gateway,/if\(developmentMode\)\{\s*learningPolicy=\{/);
  assert.match(gateway,/reason_code:"development_working_memory_lane"/);
  assert.match(gateway,/if\(developmentMode\)\{[\s\S]*?recordDevelopmentWorkingMemory/);
  assert.match(gateway,/target_purpose:"external_provider_processing"/);
  assert.match(gateway,/service_authorize_ai_request/);
  assert.match(gateway,/workingMemoryStatus="skipped_incomplete_response"/);
  assert.match(gateway,/workingMemoryStatus="failed"/);
});
