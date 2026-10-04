import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildUiGovernanceEvidence } from "./write-ui-governance-evidence.mjs";

export const PROGRESSIVE_LIVE_TECHNICAL_GAP_HOURS = {
  databaseAttestation: 48,
  edgeFunctionRelease: 48
};

function clean(value){
  return typeof value==="string" ? value.trim() : "";
}

function makeDeadline(generatedAt,hours){
  return new Date(Date.parse(generatedAt)+hours*3_600_000).toISOString();
}

export function buildProgressiveLiveGapRegister(
  env=process.env,
  options={}
){
  const generatedAt=options.generatedAt || new Date().toISOString();
  const releaseSha=clean(env.DATANEST_UI_RELEASE_SHA);
  const releaseMode=clean(env.DATANEST_UI_RELEASE_STATE) || "candidate";
  const ui=buildUiGovernanceEvidence({
    ...env,
    DATANEST_UI_RELEASE_SHA:releaseSha,
    DATANEST_UI_RELEASE_STATE:releaseMode,
    DATANEST_UI_GENERATED_AT:generatedAt
  });

  const gaps=releaseMode==="progressive_live" ? [...(ui.gaps || [])] : [];
  const dbFile=resolve(env.DATANEST_DB_ATTESTATION_FILE || ".datanest/release-attestation.json");
  const edgeFile=resolve(env.DATANEST_EDGE_ATTESTATION_FILE || ".datanest/edge-function-attestation.json");

  if(releaseMode==="progressive_live" && !existsSync(dbFile)){
    gaps.push({
      id:"technical:database-attestation",
      domain:"production-database",
      status:"pending",
      remedy:"Collect and publish the live production database release attestation for the deployed release.",
      proposedDeadlineHours:PROGRESSIVE_LIVE_TECHNICAL_GAP_HOURS.databaseAttestation,
      proposedDeadline:makeDeadline(generatedAt,PROGRESSIVE_LIVE_TECHNICAL_GAP_HOURS.databaseAttestation),
      blocking:false
    });
  }

  if(releaseMode==="progressive_live" && !existsSync(edgeFile) && !clean(env.DATANEST_UI_EDGE_FUNCTION_RELEASE_REF || env.DATANEST_EDGE_FUNCTION_RELEASE_REFERENCE)){
    gaps.push({
      id:"technical:edge-function-release",
      domain:"production-edge-functions",
      status:"pending",
      remedy:"Collect and publish the exact-SHA governed Edge Function release evidence.",
      proposedDeadlineHours:PROGRESSIVE_LIVE_TECHNICAL_GAP_HOURS.edgeFunctionRelease,
      proposedDeadline:makeDeadline(generatedAt,PROGRESSIVE_LIVE_TECHNICAL_GAP_HOURS.edgeFunctionRelease),
      blocking:false
    });
  }

  return {
    schemaVersion:"datanest-progressive-live-gap-register-v1",
    project:"Resonance DataNest",
    releaseSha,
    releaseMode,
    deploymentAllowed:releaseMode==="progressive_live" || releaseMode==="owner_test_mode" || releaseMode==="authorized",
    gapCount:gaps.length,
    gaps,
    generatedAt,
    policy:{
      model:"progressive-live-assurance",
      humanApprovalRequiredToDeploy:false,
      evidenceCompletionRequiredToDeploy:false,
      openGapsAreNonBlocking:true,
      deadlineModel:"proposed-remedy-deadline",
      defaultTechnicalDeadlineHours:48,
      escalation:"Reassess overdue gaps; do not retroactively represent pending evidence as complete."
    }
  };
}

export function writeProgressiveLiveGapRegister(
  target=resolve("public/progressive-live-gap-register.json"),
  env=process.env
){
  const output=resolve(target);
  const register=buildProgressiveLiveGapRegister(env);
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify(register)+"\n","utf8");
  return register;
}

const directInvocation=
  process.argv[1] &&
  import.meta.url===pathToFileURL(resolve(process.argv[1])).href;

if(directInvocation){
  const target=process.argv[2] || "public/progressive-live-gap-register.json";
  const register=writeProgressiveLiveGapRegister(target);
  console.log("Wrote progressive-live gap register for",register.releaseSha,register.releaseMode);
}
