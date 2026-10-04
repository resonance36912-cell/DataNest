import { dirname, resolve } from "node:path";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { gitTrackedObjectTreeSha256 } from "./lib/git-tracked-object-tree-sha256.mjs";

const inventoryPath=resolve(process.argv[2] || ".datanest/connector-edge-inventory.json");
const target=resolve(process.argv[3] || "config/production-edge-function-connector-attestation.json");
const sourceCommit=(process.env.DATANEST_CONNECTOR_EDGE_SOURCE_COMMIT || "").trim();
const evidenceRef=(process.env.DATANEST_CONNECTOR_EDGE_EVIDENCE_REF || "").trim();
const observedAt=(process.env.DATANEST_CONNECTOR_EDGE_OBSERVED_AT || "").trim();
const repository=(process.env.GITHUB_REPOSITORY || "DataNest-Supository/DataNest").trim();
const project=(process.env.DATANEST_SUPABASE_PROJECT || "sgqdmfgjbprsoqsmgigi").trim();

const requiredFunctions=[
  "datanest-ai-chat",
  "datanest-ai-intake",
  "datanest-ai-certification",
  "manage-ai-provider-v2",
  "send-job-invite",
  "send-project-member-invite",
  "ronsas-status",
  "external-audit"
];

if(!/^[0-9a-f]{40}$/i.test(sourceCommit))throw new Error("DATANEST_CONNECTOR_EDGE_SOURCE_COMMIT must be an exact 40-character Git SHA.");
if(!evidenceRef)throw new Error("DATANEST_CONNECTOR_EDGE_EVIDENCE_REF is required.");
if(!Number.isFinite(Date.parse(observedAt)))throw new Error("DATANEST_CONNECTOR_EDGE_OBSERVED_AT must be a valid timestamp.");

const inventory=JSON.parse(readFileSync(inventoryPath,"utf8"));
const sourceTreeSha256=gitTrackedObjectTreeSha256("supabase/functions",sourceCommit);
const observedBySlug=new Map((Array.isArray(inventory.functions)?inventory.functions:[]).map(fn=>[String(fn.slug||""),fn]));
const functions={};

for(const slug of requiredFunctions){
  const fn=observedBySlug.get(slug);
  if(!fn)throw new Error("Connector inventory is missing "+slug+".");
  const version=Number(fn.version);
  const digest=String(fn.ezbr_sha256||"");
  if(String(fn.status||"")!=="ACTIVE")throw new Error(slug+" is not ACTIVE.");
  if(fn.verify_jwt!==true)throw new Error(slug+" JWT verification is not enabled.");
  if(!Number.isInteger(version)||version<=0)throw new Error(slug+" has an invalid version.");
  if(!/^[0-9a-f]{64}$/i.test(digest))throw new Error(slug+" has an invalid ezbr_sha256.");
  functions[slug]={
    version,
    ezbr_sha256:digest,
    status:"ACTIVE",
    verify_jwt:true,
    sourceTreeSha256
  };
}

const attestation={
  schemaVersion:"edge-function-connector-attestation-v1",
  status:"verified",
  source:"supabase-mcp-connector",
  repository,
  project,
  sourceCommit,
  releaseReference:"connector:"+sourceCommit,
  connectorEvidenceRef:evidenceRef,
  observedAt,
  sourceTreeSha256,
  functions,
  verifiedAt:new Date().toISOString()
};

mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(attestation,null,2)+"\n","utf8");
console.log("Wrote connector Edge Function attestation for",sourceCommit);
