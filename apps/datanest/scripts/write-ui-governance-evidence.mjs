import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { proposeOwnerTestModeWindow } from "./propose-owner-test-mode-window.mjs";

export const UI_GOVERNANCE_SCHEMA_VERSION="ui-governance-release-v2";
export const OWNER_TEST_MODE_MAX_HOURS=72;
export const PROGRESSIVE_LIVE_GAP_HOURS={
  mirrorPromotion:48,
  mirrorLiveEvidence:48,
  datanestAiCertification:48,
  auditOptimizer:72,
  prVerification:48,
  securityScan:48,
  ronsasValidation:48,
  visualReview:24,
  governanceReview:48,
  legalReview:72,
  externalReview:72,
  productionAuthorization:72
};
export const UI_GOVERNANCE_DESIGN_SPEC=
  "docs/superpowers/specs/2026-09-29-resonance-datanest-ui-governance-system-design.md";
export const UI_GOVERNANCE_IMPLEMENTATION_PLANS=[
  "docs/superpowers/plans/2026-09-29-resonance-datanest-ui-foundation-shell.md",
  "docs/superpowers/plans/2026-09-29-resonance-datanest-governance-legal-centre.md",
  "docs/superpowers/plans/2026-09-29-resonance-datanest-ronsas-ui-migration.md",
  "docs/superpowers/plans/2026-09-29-resonance-datanest-certification-production-gates.md"
];

const REVIEW_ENV=[
  ["mirrorPromotion","DATANEST_UI_MIRROR_PROMOTION_REF"],
  ["mirrorLiveEvidence","DATANEST_UI_MIRROR_LIVE_EVIDENCE_REF"],
  ["datanestAiCertification","DATANEST_UI_DATANEST_AI_CERTIFICATION_REF"],
  ["auditOptimizer","DATANEST_UI_AUDIT_OPTIMIZER_REF"],
  ["prVerification","DATANEST_UI_PR_VERIFICATION_REF"],
  ["securityScan","DATANEST_UI_SECURITY_REF"],
  ["ronsasValidation","DATANEST_UI_RONSAS_VALIDATION_REF"],
  ["visualReview","DATANEST_UI_VISUAL_REVIEW_REF"],
  ["governanceReview","DATANEST_UI_GOVERNANCE_REVIEW_REF"],
  ["legalReview","DATANEST_UI_LEGAL_REVIEW_REF"],
  ["externalReview","DATANEST_UI_EXTERNAL_REVIEW_REF"],
  ["productionAuthorization","DATANEST_UI_AUTHORIZATION_REF"]
];

const OWNER_TEST_MODE_REQUIRED_REVIEW_KEYS=new Set([
  "mirrorPromotion",
  "mirrorLiveEvidence",
  "datanestAiCertification",
  "auditOptimizer",
  "prVerification",
  "securityScan",
  "ronsasValidation"
]);

function parseIsoDate(value,label){
  const raw=clean(value);
  if (!raw) throw new Error(`${label} is required`);
  const millis=Date.parse(raw);
  if (!Number.isFinite(millis)) throw new Error(`${label} must be a valid ISO-8601 date/time`);
  return {raw,millis};
}

function buildOwnerTestMode(env,generatedAt){
  const ownerLogin=clean(env.DATANEST_UI_OWNER_TEST_MODE_OWNER_LOGIN);
  const actor=clean(env.DATANEST_UI_OWNER_TEST_MODE_ACTOR);
  const authorizationReference=clean(env.DATANEST_UI_OWNER_TEST_MODE_REF);
  const reason=clean(env.DATANEST_UI_OWNER_TEST_MODE_REASON);
  if (!ownerLogin) throw new Error("DATANEST_UI_OWNER_TEST_MODE_OWNER_LOGIN is required");
  if (!actor) throw new Error("DATANEST_UI_OWNER_TEST_MODE_ACTOR is required");
  if (ownerLogin.toLowerCase()!==actor.toLowerCase()) {
    throw new Error("Owner Test Mode actor must match the declared Owner login");
  }
  if (isPlaceholder(authorizationReference)) {
    throw new Error("DATANEST_UI_OWNER_TEST_MODE_REF must contain a non-placeholder Owner authorization reference");
  }
  if (reason.length<20) {
    throw new Error("DATANEST_UI_OWNER_TEST_MODE_REASON must explain the evidence-gathering purpose");
  }

  const now=Date.parse(generatedAt);
  const proposal=proposeOwnerTestModeWindow(env,new Date(generatedAt));
  const windowStrategy=clean(env.DATANEST_UI_OWNER_TEST_MODE_WINDOW_STRATEGY) || "ai_proposed";
  if (!["ai_proposed","explicit"].includes(windowStrategy)) {
    throw new Error("DATANEST_UI_OWNER_TEST_MODE_WINDOW_STRATEGY must be ai_proposed or explicit");
  }

  const expiry=windowStrategy==="ai_proposed"
    ? {raw:proposal.recommendedExpiresAt,millis:Date.parse(proposal.recommendedExpiresAt)}
    : parseIsoDate(env.DATANEST_UI_OWNER_TEST_MODE_EXPIRES_AT,"DATANEST_UI_OWNER_TEST_MODE_EXPIRES_AT");

  if (expiry.millis<=now) throw new Error("Owner Test Mode expiry must be in the future");
  const durationHours=(expiry.millis-now)/3_600_000;
  if (durationHours>OWNER_TEST_MODE_MAX_HOURS) {
    throw new Error(`Owner Test Mode cannot exceed ${OWNER_TEST_MODE_MAX_HOURS} hours`);
  }
  if (durationHours<0.5) {
    throw new Error("Owner Test Mode must allow at least 30 minutes for evidence gathering");
  }

  const acceptedHours=Number(durationHours.toFixed(3));
  const deltaHours=Number((acceptedHours-proposal.recommendedHours).toFixed(3));
  const boundedDeadline=(hours)=>{
    const desired=now+hours*3_600_000;
    return new Date(Math.min(desired,expiry.millis)).toISOString();
  };

  return {
    active:true,
    temporaryException:true,
    ownerAuthorized:true,
    ownerLogin,
    actor,
    authorizationReference,
    reason,
    startedAt:generatedAt,
    expiresAt:new Date(expiry.millis).toISOString(),
    maxHours:OWNER_TEST_MODE_MAX_HOURS,
    durationHours:acceptedHours,
    evidencePurpose:"Gather production evidence required to complete outstanding human governance review gates.",
    evidenceDeadlines:{
      visualReview:boundedDeadline(24),
      governanceReview:boundedDeadline(48),
      legalReview:new Date(expiry.millis).toISOString(),
      externalReview:new Date(expiry.millis).toISOString(),
      productionAuthorization:new Date(expiry.millis).toISOString()
    },
    automaticExpiryAction:"Replace live Pages site with an Owner Test Mode expired holding page unless a fully authorized release supersedes it.",
    timeframeProposal:{
      ...proposal,
      strategy:windowStrategy,
      acceptedHours,
      acceptedExpiresAt:new Date(expiry.millis).toISOString(),
      ownerOverride:windowStrategy==="explicit" && Math.abs(deltaHours)>0.01,
      overrideDeltaHours:deltaHours
    }
  };
}

function clean(value){
  return typeof value==="string" ? value.trim() : "";
}

function isPlaceholder(value){
  const normalized=clean(value).toLowerCase();
  return !normalized || normalized==="pending" || normalized==="todo" || normalized==="tbd";
}

export function hasUiGovernanceEnvironment(env=process.env){
  return [
    "DATANEST_UI_RELEASE_SHA",
    "DATANEST_UI_RELEASE_STATE",
    ...REVIEW_ENV.map(([,envName])=>envName)
  ].some((name)=>env[name]!==undefined);
}

export function buildUiGovernanceEvidence(env=process.env){
  const releaseState=clean(env.DATANEST_UI_RELEASE_STATE) || "candidate";
  if (!["candidate","authorized","progressive_live","owner_test_mode"].includes(releaseState)) {
    throw new Error("DATANEST_UI_RELEASE_STATE must be candidate, authorized, progressive_live, or owner_test_mode");
  }

  const releaseSha=clean(env.DATANEST_UI_RELEASE_SHA);
  if (!releaseSha) {
    throw new Error("DATANEST_UI_RELEASE_SHA is required");
  }

  if (releaseState==="authorized") {
    for (const [,envName] of REVIEW_ENV) {
      if (isPlaceholder(env[envName])) {
        throw new Error(`${envName} must contain a non-placeholder review reference for an authorized release`);
      }
    }
  }

  if (releaseState==="owner_test_mode") {
    for (const [key,envName] of REVIEW_ENV) {
      if (OWNER_TEST_MODE_REQUIRED_REVIEW_KEYS.has(key) && isPlaceholder(env[envName])) {
        throw new Error(`${envName} must contain a non-placeholder reference for Owner Test Mode`);
      }
    }
  }

  const generatedAtRaw=clean(env.DATANEST_UI_GENERATED_AT);
  if(generatedAtRaw && !Number.isFinite(Date.parse(generatedAtRaw))){
    throw new Error("DATANEST_UI_GENERATED_AT must be a valid ISO-8601 date/time");
  }
  const generatedAt=generatedAtRaw
    ? new Date(Date.parse(generatedAtRaw)).toISOString()
    : new Date().toISOString();
  const ownerTestMode=releaseState==="owner_test_mode" ? buildOwnerTestMode(env,generatedAt) : null;
  const evidence={};
  for (const [key,envName] of REVIEW_ENV) {
    const raw=clean(env[envName]);
    const supplied=!isPlaceholder(raw);
    const candidateAuthorization=releaseState==="candidate" && key==="productionAuthorization";
    evidence[key]={
      status:supplied && !candidateAuthorization ? "supplied" : "pending",
      reference:supplied && !candidateAuthorization ? raw : null
    };
  }

  const gaps=releaseState==="progressive_live"
    ? Object.entries(evidence)
        .filter(([,item])=>item.status==="pending")
        .map(([key])=>{
          const hours=PROGRESSIVE_LIVE_GAP_HOURS[key] || 72;
          return {
            id:`human-evidence:${key}`,
            domain:key,
            status:"pending",
            remedy:`Supply or complete the ${key} assurance item and attach the relevant review/evidence reference.`,
            proposedDeadlineHours:hours,
            proposedDeadline:new Date(Date.parse(generatedAt)+hours*3_600_000).toISOString(),
            blocking:false
          };
        })
    : [];

  return {
    schemaVersion:UI_GOVERNANCE_SCHEMA_VERSION,
    project:"Resonance DataNest",
    releaseSha,
    releaseState,
    authorized:releaseState==="authorized",
    fullyGoverned:releaseState==="authorized",
    productionDeploymentAllowed:
      releaseState==="authorized" ||
      releaseState==="progressive_live" ||
      releaseState==="owner_test_mode",
    deploymentBasis:releaseState==="progressive_live"
      ? "Manual workflow dispatch plus automated technical validation; human approval and evidence completion are advisory."
      : null,
    ownerTestMode,
    designSpec:UI_GOVERNANCE_DESIGN_SPEC,
    implementationPlans:UI_GOVERNANCE_IMPLEMENTATION_PLANS,
    evidence,
    gaps,
    generatedAt
  };
}

export function writeUiGovernanceEvidence(
  target=resolve("public/ui-governance-release.json"),
  env=process.env
){
  const output=resolve(target);
  const evidence=buildUiGovernanceEvidence(env);
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify(evidence)+"\n","utf8");
  return evidence;
}

const directInvocation=
  process.argv[1] &&
  import.meta.url===pathToFileURL(resolve(process.argv[1])).href;

if (directInvocation) {
  const target=process.argv[2] || "public/ui-governance-release.json";
  const evidence=writeUiGovernanceEvidence(target);
  console.log("Wrote UI governance evidence for",evidence.releaseSha,evidence.releaseState);
}
