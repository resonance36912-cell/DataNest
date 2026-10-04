import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const learningSource=fs.readFileSync(path.join(root,"supabase/functions/_shared/datanestAiLearning.ts"),"utf8");

test("navigation exposes DataNest AI and not the R&D Dashboard", () => {
  const source=fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");
  assert.match(source,/label:"DataNest AI"/);
  assert.doesNotMatch(source,/label:"R&D Dashboard"/);
});

test("DataNest AI workspace exposes chat, current job, certified memory and certification", () => {
  const source=fs.readFileSync(path.join(root,"src/components/DataNestAiWorkspace.tsx"),"utf8");
  assert.match(source,/DataNest AI/);
  assert.match(source,/Active Job context/);
  assert.match(source,/Job details/);
  assert.match(source,/Certified Memory/);
  assert.match(source,/Learning & Certification/);
});

test("old UNIFI Copilot identity is absent from runtime UI source", () => {
  const files=[
    "src/components/DataNestApp.tsx",
    "src/components/DataNestAiWorkspace.tsx",
    "src/components/DataNestAiChatPanel.tsx"
  ];
  for(const file of files){
    const source=fs.readFileSync(path.join(root,file),"utf8");
    assert.doesNotMatch(source,/UNIFI Copilot/);
  }
});


test("active client source no longer references contribution or stake scoring RPCs", () => {
  const files=[
    "src/components/DataNestApp.tsx",
    "src/components/AiOperationsDashboard.tsx",
    "src/components/AiReconciliationPanel.tsx",
    "src/components/ProductLab.tsx"
  ];
  const source=files.map(file=>fs.readFileSync(path.join(root,file),"utf8")).join("\n");
  for(const forbidden of [
    "contribution_ledger",
    "get_stakeholder_summary",
    "submit_external_ai_credit",
    "accept_contribution",
    "reject_contribution",
    "reverse_contribution",
    "suggested_product_stake"
  ]) assert.equal(source.includes(forbidden),false,forbidden+" must be retired from active client source");
});


test("DataNest AI governed E2E and stress harness is wired", () => {
  const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
  assert.equal(pkg.scripts["test:browser:datanest-ai"],"playwright test tests/browser/datanest-ai.spec.ts tests/browser/datanest-ai-return-safety.spec.ts");
  assert.equal(pkg.scripts["test:stress:datanest-ai"],"node tests/stress/datanest-ai-stress.mjs");
  assert.equal(pkg.scripts["seed:e2e:datanest-ai"],"node scripts/seed-datanest-ai-e2e.mjs");
  for(const file of [
    "scripts/seed-datanest-ai-e2e.mjs",
    "tests/browser/datanest-ai.spec.ts",
    "tests/browser/datanest-ai-return-safety.spec.ts",
    "tests/stress/datanest-ai-stress.mjs"
  ]) assert.equal(fs.existsSync(path.join(root,file)),true,file+" must exist");
});


test("governed release wiring names the certified DataNest AI runtime", () => {
  const ci=fs.readFileSync(path.join(root,".github/workflows/ci.yml"),"utf8");
  const pages=fs.readFileSync(path.join(root,".github/workflows/pages.yml"),"utf8");
  const manifest=fs.readFileSync(path.join(root,"scripts/write-release-manifest.mjs"),"utf8");
  const certification=fs.readFileSync(path.join(root,".github/workflows/datanest-ai-certification.yml"),"utf8");
  const config=fs.readFileSync(path.join(root,"supabase/config.toml"),"utf8");

  assert.match(ci,/Retired Copilot\/contribution-scoring source remains active/);
  assert.match(certification,/DATANEST_AI_STAGING_SERVICE_ROLE_KEY/);
  assert.match(certification,/DATANEST_CERTIFICATION_URL/);
  assert.doesNotMatch(certification,/DATANEST_AI_STAGING_PUBLISHABLE_KEY/);
  assert.match(certification,/datanest-ai-return-safety\.spec\.ts/);
  assert.match(certification,/human input is traced\|AI Companion return/);
  assert.match(certification,/mirrorStagingSyntheticSignIn:false/);
  assert.match(certification,/test:stress:datanest-ai/);

  for(const fn of ["datanest-ai-chat","datanest-ai-intake","datanest-ai-certification","send-project-member-invite"]){
    assert.match(config,new RegExp("\\[functions\\."+fn.replaceAll("-","\\-")+"\\][\\s\\S]*?verify_jwt = true"));
  }

  assert.match(manifest,/validateProductionContract/);
  assert.match(manifest,/databaseRelease:canonicalDatabaseRelease/);
  assert.match(manifest,/productionInclusion:productionCatalog\.productionInclusion/);
  assert.doesNotMatch(manifest,/link-transcheduler-job-requirements-user-interests/);
  assert.match(manifest,/datanest-ai-chat@2/);
  assert.match(manifest,/datanest-ai-intake@1/);
  assert.match(manifest,/datanest-ai-certification@1/);
  assert.match(manifest,/send-project-member-invite@3/);
  assert.match(pages,/config\/production-contract\.json/);
  assert.doesNotMatch(pages,/DATANEST_DB_RELEASE:/);
});


test("External AI Companion uses certification language instead of scoring language", () => {
  const source=fs.readFileSync(path.join(root,"src/components/ExternalAiSidebar.tsx"),"utf8");
  assert.doesNotMatch(source,/contribution points|unscored/i);
  assert.match(source,/UNCERTIFIED evidence/);
  assert.match(source,/governed certification/);
});


test("certification workspace scopes evidence rows to project candidates", () => {
  const source=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-certification/index.ts"),"utf8");
  assert.match(source,/const candidateIds=.*candidates/);
  assert.match(source,/ai_validation_runs"\)[\s\S]*?\.in\("candidate_id",candidateIds\)/);
  assert.match(source,/ai_certification_decisions"\)[\s\S]*?\.in\("candidate_id",candidateIds\)/);
});

test("certification panel normalizes malformed workspace payloads before rendering", () => {
  const panel=fs.readFileSync(path.join(root,"src/components/DataNestAiCertificationPanel.tsx"),"utf8");
  assert.match(panel,/function normalizeWorkspaceResponse/);
  assert.match(panel,/Array\.isArray\(record\.candidates\)/);
  assert.match(panel,/Array\.isArray\(record\.validationRuns\)/);
  assert.match(panel,/setWorkspace\(normalizeWorkspaceResponse\(data,fallbackRole\)\)/);
});

test("browser certification console cannot self-pass the stress-test gate", () => {
  const panel=fs.readFileSync(path.join(root,"src/components/DataNestAiCertificationPanel.tsx"),"utf8");
  const gateway=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-certification/index.ts"),"utf8");
  assert.match(panel,/gate==="STRESS_TEST"/);
  assert.match(panel,/Recorded by governed stress suite/);
  assert.doesNotMatch(panel,/onClick=.*record_validation[\s\S]{0,900}STRESS_TEST/);
  assert.match(gateway,/gate==="STRESS_TEST"[\s\S]{0,300}governed stress suite/i);
});


test("certification retry reconciles candidate state after an existing decision", () => {
  const source=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-certification/index.ts"),"utf8");
  assert.match(source,/if\(existing\)\{[\s\S]{0,700}lifecycle_state:"CERTIFIED"[\s\S]{0,300}return existing/);
});

test("certification workspace orders validation runs oldest to newest for latest-state reduction", () => {
  const source=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-certification/index.ts"),"utf8");
  assert.match(source,/ai_validation_runs"\)[\s\S]{0,250}order\("created_at",\{ascending:true\}\)/);
});


test("embedded DataNest AI turns finalize usage requests", () => {
  const gateway=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),"utf8");
  const migration=fs.readFileSync(path.join(root,"supabase/migrations/20260924230805_datanest_ai_production.sql"),"utf8");
  assert.match(migration,/target_status not in \('succeeded','failed','unknown','denied','embedded'\)/);
  assert.match(
    gateway,
    /requestStatus==="pending"[\s\S]{0,700}target_status:"embedded"[\s\S]{0,400}requestStatus="embedded"/
  );
});

test("policy-denied provider requests are finalized as denied before embedded fallback", () => {
  const gateway=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),"utf8");
  assert.match(
    gateway,
    /requestStatus="denied"[\s\S]{0,700}target_status:"denied"/
  );
});


test("all AI usage finalization checks RPC errors", () => {
  const gateway=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),"utf8");
  assert.match(
    gateway,
    /async function finishUsageRequest\([\s\S]{0,900}service_finish_ai_request[\s\S]{0,500}if\(error\)throw error/
  );
  assert.doesNotMatch(
    gateway,
    /await serviceClient\.rpc\("service_finish_ai_request"/
  );
});


test("certified learning candidates are frozen against later trend evidence", () => {
  const gateway=learningSource;
  assert.match(gateway,/select\("id,lifecycle_state,evidence_count"\)/);
  assert.match(
    gateway,
    /const mutableLearningStates=new Set\(\[[\s\S]{0,220}"INTAKE"[\s\S]{0,220}"VALIDATED"[\s\S]{0,80}\]\)/
  );
  assert.doesNotMatch(
    gateway,
    /const mutableLearningStates=new Set\(\[[\s\S]{0,300}"CERTIFIED"/
  );
  assert.match(
    gateway,
    /if\(existing\?\.id\)[\s\S]{0,900}!mutableLearningStates\.has\(String\(existing\.lifecycle_state\)\)[\s\S]{0,450}return \{[\s\S]{0,180}candidateId/
  );
});

test("existing certification decisions must still match the candidate seal", () => {
  const source=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-certification/index.ts"),"utf8");
  assert.match(
    source,
    /if\(existing\)[\s\S]{0,650}assertCertificationDecisionCurrent\([\s\S]{0,160}existing,[\s\S]{0,120}input\.candidate,[\s\S]{0,120}input\.derivationReviewHash[\s\S]{0,40}\)/
  );
});


test("promotion revalidates certification seal and required authority", () => {
  const source=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-certification/index.ts"),"utf8");
  assert.match(
    source,
    /function assertCertificationDecisionCurrent\([\s\S]{0,1800}requiredCertificationAuthority[\s\S]{0,1200}stale/i
  );
  assert.match(
    source,
    /if\(action==="promote"\|\|action==="supersede"\)[\s\S]{0,2600}assertCertificationDecisionCurrent\([\s\S]{0,120}decision,[\s\S]{0,120}candidate,[\s\S]{0,120}promotionDerivationReview\.reviewHash[\s\S]{0,40}\)/
  );
});


test("AI Companion intake binds to the active governed DataNest AI session", () => {
  const app=fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");
  const workspace=fs.readFileSync(path.join(root,"src/components/DataNestAiWorkspace.tsx"),"utf8");
  const sidebar=fs.readFileSync(path.join(root,"src/components/ExternalAiSidebar.tsx"),"utf8");
  const intake=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-intake/index.ts"),"utf8");

  assert.match(app,/activeDataNestAiSession/);
  assert.match(workspace,/onActiveSessionChange/);
  assert.match(sidebar,/datanestAiSessionId/);
  assert.match(intake,/preferredSessionId/);
  assert.match(intake,/Active DataNest AI session does not match the authorized user and Job/);
});


test("AI administration is nested under Settings instead of primary navigation", () => {
  const app=fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");
  const admin=fs.readFileSync(path.join(root,"src/components/AiOperationsDashboard.tsx"),"utf8");

  assert.doesNotMatch(app,/label:"AI Operations"/);
  assert.doesNotMatch(app,/key:"aiops"/);
  assert.match(app,/aria-label="AI Administration"/);
  assert.match(app,/view==="settings"[\s\S]*<Settings/);
  assert.match(app,/<AiOperationsDashboard projectId=\{project\.id\}/);

  assert.match(admin,/AI ADMINISTRATION/);
  assert.match(admin,/Provider, usage & security controls/);
  assert.match(admin,/AiReconciliationPanel/);
  assert.match(admin,/manage-ai-provider-v2/);
  assert.match(admin,/set_ai_budget_policy/);
});


test("Overview omits capacity and Operations omits the Capabilities surface", () => {
  const source=fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");

  assert.doesNotMatch(source,/label:"Capabilities"/);
  assert.doesNotMatch(source,/key:"capabilities"/);
  assert.doesNotMatch(source,/view==="capabilities"/);
  assert.doesNotMatch(source,/Available capabilities/);
  assert.doesNotMatch(source,/>CAPACITY</);
  assert.doesNotMatch(source,/function Capabilities\(/);

  assert.match(source,/<Scheduler [^>]*jobs=\{jobs\} capabilities=\{capabilities\}/);
  assert.match(source,/<UnifiPlanner project=\{project\} currentUserId=\{session\.user\.id\} jobs=\{jobs\} capabilities=\{capabilities\}/);
});


test("TranScheduler groups jobs under the project identity with a priority gradient", () => {
  const source=fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");
  const css=fs.readFileSync(path.join(root,"src/app/globals.css"),"utf8");

  assert.match(source,/projectName=\{project\?\.name\|\|DATANEST_CANONICAL_NAME\}/);
  assert.match(source,/function ProjectGroupHeader\(/);
  assert.match(source,/function PriorityScale\(/);
  assert.match(source,/schedulerProjectGroupHead/);
  assert.match(css,/schedulerPriorityLegend/);
  assert.match(css,/priorityScaleGradient/);
  assert.match(css,/linear-gradient\(90deg,#58718f 0%,#4aaee0 34%,#7a70ed 66%,#e55ac8 100%\)/);
});


test("DataNest AI chat renders the submitted turn immediately and uses Enter to send", () => {
  const chat=fs.readFileSync(path.join(root,"src/components/DataNestAiChatPanel.tsx"),"utf8");
  assert.match(chat,/setOptimisticTurn\(\{/);
  assert.match(chat,/source_type:"human"/);
  assert.match(chat,/setDraft\(""\)/);
  assert.match(chat,/event\.key==="Enter"&&!event\.shiftKey/);
  assert.match(chat,/Shift\+Enter for a new line/);
  assert.match(chat,/clientTimeZone:Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
});

test("DataNest AI chat distinguishes pending human turns and localizes visible timestamps", () => {
  const chat=fs.readFileSync(path.join(root,"src/components/DataNestAiChatPanel.tsx"),"utf8");
  const workspace=fs.readFileSync(path.join(root,"src/components/DataNestAiWorkspace.tsx"),"utf8");
  const css=fs.readFileSync(path.join(root,"src/app/globals.css"),"utf8");
  assert.match(chat,/const \[displayTimeZone,setDisplayTimeZone\]=useState\("UTC"\)/);
  assert.match(chat,/resolvedOptions\(\)\.timeZone\|\|"UTC"/);
  assert.match(chat,/pending=roleClass==="human"&&item\.trace_id==="DN-AI-pending"/);
  assert.match(chat,/pending\?"SENDING":dual\?"WORKING MEMORY":"UNCERTIFIED"/);
  assert.match(workspace,/formatDate\(selectedJob\.updated_at,displayTimeZone\)/);
  assert.match(css,/\.datanestAiCommandConsole \.datanestAiTurn\.human\.pending\{/);
  assert.match(css,/flex-direction:row-reverse/);
});

test("embedded DataNest AI responds directly to basic conversational utility prompts", () => {
  const gateway=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),"utf8");
  assert.match(gateway,/Today is \$\{date\}/);
  assert.match(gateway,/The current time is \$\{time\}/);
  assert.match(gateway,/DataNest AI is online in \$\{code\}/);
  assert.match(gateway,/clientTimeZone/);
});

test("DataNest AI surfaces the returned assistant turn before refreshing the governed session", () => {
  const chat=fs.readFileSync(path.join(root,"src/components/DataNestAiChatPanel.tsx"),"utf8");
  const workspace=fs.readFileSync(path.join(root,"src/components/DataNestAiWorkspace.tsx"),"utf8");

  assert.match(chat,/payload\.assistant/);
  assert.match(chat,/source_type:"datanest_ai"/);
  assert.match(chat,/await onContextRefresh\(nextSession\)/);
  assert.ok(
    chat.indexOf("payload.assistant") < chat.indexOf("await onContextRefresh(nextSession)"),
    "the returned assistant payload must be surfaced before the server context refresh"
  );

  assert.match(
    workspace,
    /const refreshContext=useCallback\(async\(sessionOverride\?:string\)=>/
  );
  assert.match(
    workspace,
    /const requestedSessionKey=sessionKey\(requestedJobId\)/
  );
  assert.match(
    workspace,
    /typeof sessionOverride==="string"[\s\S]{0,160}sessionByJobRef\.current\[requestedSessionKey\]\|\|null/
  );
  assert.match(
    workspace,
    /body:\{action:"context",jobId:requestedJobId,sessionId:requestedSessionId\}/
  );
});


test("trend analysis reuses an existing intake candidate before creating a duplicate", () => {
  const gateway=learningSource;
  assert.match(gateway,/bestCandidateByEvidenceOverlap/);
  assert.match(
    gateway,
    /ai_candidate_evidence"\)[\s\S]{0,500}\.in\("event_id",candidate\.evidenceIds\)/
  );
  assert.match(
    gateway,
    /overlapCandidateId[\s\S]{0,1200}lifecycle_state[\s\S]{0,1200}normalized_knowledge:candidate\.normalizedKnowledge/
  );
});


test("trend candidate creation uses a deterministic project-scoped id for concurrent requests", () => {
  const gateway=learningSource;
  assert.match(gateway,/stableCandidateIdFromHash/);
  assert.match(gateway,/candidateIdentityHash/);
  assert.match(gateway,/input\.projectId[\s\S]{0,120}candidate\.trendKey/);
  assert.match(gateway,/id:stableCandidateId/);
  assert.match(gateway,/23505/);
});


test("low-risk learning validation is automated and candidate-sealed", () => {
  const gateway=learningSource;
  assert.match(gateway,/automatedLearningGateResults/);
  assert.match(gateway,/candidateValidationSeal/);
  assert.match(gateway,/from\("ai_validation_runs"\)[\s\S]{0,1200}actor_type:"automation"/);
  assert.match(gateway,/candidate_evidence[\s\S]{0,1400}delete\(\)[\s\S]{0,400}staleEvidence/);
});

test("certification accepts only validation runs for the current candidate evidence seal", () => {
  const source=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-certification/index.ts"),"utf8");
  assert.match(source,/async function currentValidationRuns[\s\S]{0,2200}validationRunMatchesSeal/);
  assert.match(source,/loadCandidateEvidenceIds[\s\S]{0,1800}sha256Text\(evidenceIds\.join\("\\n"\)\)/);
  assert.match(source,/results:\{\.\.\.governedResults,\.\.\.current\.seal\}/);
});


test("External AI handoff never places governed work context in a provider URL", () => {
  const source=fs.readFileSync(path.join(root,"src/components/ExternalAiSidebar.tsx"),"utf8");
  assert.doesNotMatch(source,/searchParams\.set\(["']q["']/);
  assert.match(source,/function providerLaunchUrl\(_promptText=""/);
  assert.match(source,/Never place the governed Job Manifest or other work context into a/);
  assert.match(source,/The tracked Job Manifest is copied for review\/paste/);
});
