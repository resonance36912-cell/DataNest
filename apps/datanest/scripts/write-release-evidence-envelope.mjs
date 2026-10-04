import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const manifestPath=resolve(process.argv[2] || "public/release-manifest.json");
const target=resolve(process.argv[3] || ".datanest/release-evidence-envelope.json");
const manifest=JSON.parse(readFileSync(manifestPath,"utf8"));
const bool=(value)=>String(value||"").toLowerCase()==="true";

const envelope={
  schemaVersion:"release-evidence-envelope-v1",
  repository:{
    fullName:process.env.DATANEST_EVIDENCE_REPOSITORY || "DataNest-Supository/DataNest",
    role:process.env.DATANEST_EVIDENCE_REPOSITORY_ROLE || "canonical"
  },
  commitSha:String(manifest.frontendCommit||""),
  releaseId:String(process.env.DATANEST_RELEASE_ID || manifest.frontendCommit || ""),
  environment:process.env.DATANEST_EVIDENCE_ENVIRONMENT || "production",
  backend:{
    provider:"supabase",
    projectId:String(manifest.supabaseProject||""),
    environment:process.env.DATANEST_EVIDENCE_BACKEND_ENVIRONMENT || process.env.DATANEST_EVIDENCE_ENVIRONMENT || "production"
  },
  workflow:{
    provider:"github-actions",
    name:process.env.GITHUB_WORKFLOW || "unknown",
    runId:String(process.env.GITHUB_RUN_ID || "unknown")
  },
  artifact:{
    type:process.env.DATANEST_ARTIFACT_TYPE || "github-pages",
    identity:String(process.env.DATANEST_ARTIFACT_IDENTITY || ("DataNest@"+manifest.frontendCommit)),
    ...(process.env.DATANEST_ARTIFACT_DIGEST ? {digest:process.env.DATANEST_ARTIFACT_DIGEST}: {})
  },
  verification:{
    tests:process.env.DATANEST_VERIFY_TESTS || "not_run",
    typecheck:process.env.DATANEST_VERIFY_TYPECHECK || "not_run",
    security:process.env.DATANEST_VERIFY_SECURITY || "not_run",
    live:process.env.DATANEST_VERIFY_LIVE || "not_run"
  },
  ...(process.env.DATANEST_CERTIFICATION_STATUS ? {certification:{status:process.env.DATANEST_CERTIFICATION_STATUS,reference:process.env.DATANEST_CERTIFICATION_REFERENCE || "unspecified"}} : {}),
  ...(process.env.DATANEST_AUDIT_STATUS ? {auditOptimizer:{status:process.env.DATANEST_AUDIT_STATUS,reference:process.env.DATANEST_AUDIT_REFERENCE || "unspecified"}} : {}),
  governance:{
    reviewed:bool(process.env.DATANEST_GOVERNANCE_REVIEWED),
    humanAuthorized:bool(process.env.DATANEST_HUMAN_AUTHORIZED),
    ...(process.env.DATANEST_GOVERNANCE_REFERENCE ? {reference:process.env.DATANEST_GOVERNANCE_REFERENCE}: {})
  },
  authority:{
    productionAuthority:bool(process.env.DATANEST_PRODUCTION_AUTHORITY),
    productionDeploymentAllowed:bool(process.env.DATANEST_PRODUCTION_DEPLOYMENT_ALLOWED)
  }
};

mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(envelope,null,2)+"\n","utf8");
console.log("Wrote release evidence envelope for",envelope.releaseId);
