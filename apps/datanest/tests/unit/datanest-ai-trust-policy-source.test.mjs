import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const aiPath=path.join(root,"supabase/functions/datanest-ai-chat/index.ts");
const learningPath=path.join(root,"supabase/functions/_shared/datanestAiLearning.ts");
const intakePath=path.join(root,"supabase/functions/datanest-ai-intake/index.ts");
const fileAccessPath=path.join(root,"supabase/migrations/20260925191008_datanest_ai_file_access_gateway.sql");

test("DataNest AI keeps visibility and reuse metadata independent while initial learning is fail closed",()=>{
  const source=fs.readFileSync(aiPath,"utf8");
  assert.match(source,/visibility_class:visibilityClass/);
  assert.match(source,/reuse_state:reuseState/);
  assert.match(source,/requested_learning_eligible:learningEligible/);
  assert.match(source,/learning_eligible:false/);
});

test("external provider routing records Phase C then Phase D before existing provider authorization",()=>{
  const source=fs.readFileSync(aiPath,"utf8");
  const phase=source.indexOf("service_evaluate_data_policy_v1");
  const authority=source.indexOf("service_evaluate_execution_authority_v1",phase);
  const authz=source.indexOf("service_authorize_ai_request",authority);
  const call=source.indexOf("callOpenAiCompatibleProvider({",source.indexOf("callProvider:async"));
  assert.ok(phase>=0,"Phase C evaluator must be called");
  assert.ok(authority>phase,"Phase D evaluator must remain after Phase C evaluation");
  assert.ok(authz>authority,"existing provider authorization must remain after Phase D evaluation");
  assert.ok(call>authz,"provider call must occur only after all gates");
  assert.match(source,/const providerKey=connection\.provider\.toLowerCase\(\)\+":"\+connection\.endpoint_host\.toLowerCase\(\)/);
  assert.match(source,/target_actor_user:user\.id/);
  assert.match(source,/target_subject_type:"job"/);
  assert.match(source,/target_subject_id:job\.id/);
  assert.match(source,/target_purpose:"external_provider_processing"/);
  assert.match(source,/target_requested_operation:"process"/);
  assert.match(source,/target_trace_id:stagedInputTraceId/);
  assert.match(source,/target_provider_connection:connection\.id/);
  assert.match(source,/target_provider_key:providerKey/);
});

test("report-only external findings do not override existing provider authorization",()=>{
  const source=fs.readFileSync(aiPath,"utf8");
  assert.match(source,/const providerPolicyEnforced=String\(providerPolicy\.enforcement_mode\|\|"report_only"\)==="enforced"/);
  assert.match(source,/providerPolicyEnforced&&String\(providerPolicy\.outcome\|\|"deny"\)!=="allow"/);
  assert.match(source,/String\(phaseCPolicy\.enforcement_mode\|\|"report_only"\)==="enforced"/);
  assert.match(source,/String\(phaseCPolicy\.outcome\|\|"deny"\)!=="allow"/);
  assert.match(source,/provider_trust_policy_denied/);
  assert.match(source,/service_authorize_ai_request/);
  assert.match(source,/embeddedResponse\(job,message,productMode,jurisdiction,clientTimeZone\)/);
});

test("project learning is fail closed and snapshots decision evidence before immutable intake trends",()=>{
  const source=fs.readFileSync(aiPath,"utf8");
  const learning=source.indexOf('target_purpose:"project_learning"');
  const stamp=source.indexOf("learning_eligible:finalLearningEligible");
  const trend=source.indexOf("updateTrendCandidate({");
  assert.ok(learning>=0,"project learning evaluator must exist");
  assert.ok(stamp>learning,"final learning stamp must follow evaluation");
  assert.ok(trend>stamp,"learning metadata must be stamped before trend extraction");
  assert.match(source,/target_actor_user:user\.id/);
  assert.match(source,/target_subject_type:"job"/);
  assert.match(source,/target_subject_id:job\.id/);
  assert.match(source,/target_requested_operation:"reuse"/);
  assert.match(source,/target_trace_id:traceId/);
  assert.match(source,/target_hard_learning_exclusion:!learningEligible/);
  assert.match(source,/finalLearningEligible=\s*!learningPolicyErrorMessage\s*&&\s*learningEligible\s*&&\s*String\(learningPolicy\.outcome\|\|"deny"\)==="allow"/);
  assert.match(source,/decision_record_id:learningPolicy\.decision_record_id/);
  assert.match(source,/effective_reuse_state:learningPolicy\.reuse_state/);
  assert.match(source,/policy_version:learningPolicy\.policy_version\|\|policyVersion/);
  assert.match(source,/if\(!finalLearningEligible\)\{[\s\S]{0,120}trendAnalysis=\{status:"not_applicable"\}/);
});

test("Legal Eagle remains a hard non-learning mode",()=>{
  const source=fs.readFileSync(aiPath,"utf8");
  assert.match(source,/const learningEligible=!legalMode&&!developmentMode&&reuseState==="project_learning_eligible"/);
  assert.match(source,/product_mode:legalMode\?"legal_eagle":"datanest_ai"/);
  assert.match(source,/target_hard_learning_exclusion:!learningEligible/);
  assert.match(source,/if\(legalMode\)\{\s*trendAnalysis=\{status:"not_applicable"\};\s*return;/);
});

test("automatic learning only admits explicitly authorized evidence",()=>{
  const source=fs.readFileSync(learningPath,"utf8");
  assert.match(source,/\.filter\(\(item:any\)=>item\.metadata\.learning_eligible===true\)/);
  assert.doesNotMatch(source,/item\.metadata\.learning_eligible!==false/);
  assert.match(source,/projectLearningReuseStates\.has\(reuseState\)/);
});

test("AI Companion intake uses the same Job-scoped project-learning policy",()=>{
  const source=fs.readFileSync(intakePath,"utf8");
  assert.match(source,/service_evaluate_data_policy_v1/);
  assert.match(source,/target_actor_user:user\.id/);
  assert.match(source,/target_subject_type:"job"/);
  assert.match(source,/target_subject_id:String\(session\.job_id\)/);
  assert.match(source,/target_purpose:"project_learning"/);
  assert.match(source,/target_requested_operation:"reuse"/);
  assert.match(source,/target_trace_id:traceKey/);
  assert.match(source,/learning_eligible:learningEligible/);
  assert.match(source,/decision_record_id:learningPolicy\.decision_record_id/);
  assert.match(source,/effective_reuse_state:learningPolicy\.reuse_state/);
  assert.match(source,/policy_version:learningPolicy\.policy_version/);
});

test("certified memory uses projection-aware retrieval and fails closed without a legacy downgrade",()=>{
  const source=fs.readFileSync(aiPath,"utf8");
  assert.match(source,/get_ranked_certified_memory_context_v3/);
  assert.match(source,/certified_memory_projection_unavailable/);
  assert.match(source,/if\(!missingV3\)throw rankedV3\.error/);
  assert.doesNotMatch(source,/get_certified_memory_context/);
  assert.doesNotMatch(source,/from\("trust_manifests"\)[\s\S]*normalized_knowledge/);
  assert.doesNotMatch(source,/from\("certified_memory"\)\s*\.insert\(/);
});

test("Phase C does not replace Job file authorization",()=>{
  const fileAccess=fs.readFileSync(fileAccessPath,"utf8");
  const source=fs.readFileSync(aiPath,"utf8");
  assert.match(fileAccess,/authorize_datanest_ai_file_access/);
  assert.doesNotMatch(source,/service_evaluate_data_policy_v1[\s\S]*bypass.*file/i);
});
