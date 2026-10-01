import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildUiGovernanceEvidence,
  hasUiGovernanceEnvironment
} from "./write-ui-governance-evidence.mjs";

const target=resolve(process.argv[2] || "public/release-manifest.json");
const uiGovernance=hasUiGovernanceEnvironment(process.env)
  ? buildUiGovernanceEvidence(process.env)
  : null;
const dbAttestationFile=resolve(process.env.DATANEST_DB_ATTESTATION_FILE || ".datanest/release-attestation.json");
const edgeAttestationFile=resolve(process.env.DATANEST_EDGE_ATTESTATION_FILE || ".datanest/edge-function-attestation.json");
const databaseAttestation=existsSync(dbAttestationFile)?JSON.parse(readFileSync(dbAttestationFile,"utf8")):null;
const edgeFunctionAttestation=existsSync(edgeAttestationFile)?JSON.parse(readFileSync(edgeAttestationFile,"utf8")):null;

const manifest={
  project:"Resonance DataNest",
  frontendCommit:process.env.DATANEST_RELEASE_SHA || process.env.GITHUB_SHA || "local",
  databaseRelease:process.env.DATANEST_DB_RELEASE || "link-transcheduler-job-requirements-user-interests",
  externalAuditRelease:process.env.DATANEST_EXTERNAL_AUDIT_DB_RELEASE || "external-audit-production-v1",
  baseline:{
    release:process.env.DATANEST_BASELINE_RELEASE || "reload-latest-v1",
    frontendCommit:process.env.DATANEST_BASELINE_SHA || "592149b0898f6703b28e9fa33e73bd0799cae3fd"
  },
  edgeFunctions:{
    aiChat:process.env.DATANEST_EDGE_AI || "datanest-ai-chat@2",
    externalIntake:process.env.DATANEST_EDGE_INTAKE || "datanest-ai-intake@1",
    certification:process.env.DATANEST_EDGE_CERTIFICATION || "datanest-ai-certification@1",
    providerManager:process.env.DATANEST_EDGE_PROVIDER || "manage-ai-provider-v2@1",
    invitations:process.env.DATANEST_EDGE_INVITES || "send-job-invite@1",
    projectInvitations:process.env.DATANEST_EDGE_PROJECT_INVITES || "send-project-member-invite@3",
    ronsasStatus:process.env.DATANEST_EDGE_RONSAS_STATUS || "ronsas-status@1",
    externalAudit:process.env.DATANEST_EDGE_EXTERNAL_AUDIT || "external-audit@1"
  },
  supabaseProject:process.env.DATANEST_SUPABASE_PROJECT || "sgqdmfgjbprsoqsmgigi",
  productionInclusion:{
    schemaVersion:"production-inclusion-v1",
    inclusive:true,
    canonicalAuthority:"DataNest-Supository/DataNest:main",
    publicSurfaces:[
      "datanest",
      "datanest-assurance",
      "ronsas-career-compass",
      "ronsas-creative-studio",
      "ronsas-epublisher",
      "ronsas-lyricsync-studio",
      "ronsas-scene-song-spark",
      "ronsas-sovereign-forge",
      "ronsas-syncvision"
    ],
    externalProductionSurfaces:["ronsas-youtube-optimizer"],
    productionSupportComponents:["ronsas-sovereign-backend","ronsas-shared"],
    excludedFromProductionAuthority:[
      "DataNest-Supository/Mirror-DataNest",
      "DataNest AI Staging",
      "DataNest-Supository/FREETREE",
      "automation/*",
      "mirror-promotion/*"
    ]
  },
  ...(uiGovernance ? {uiGovernance} : {}),
  releaseAttestation:{
    database:databaseAttestation
      ? {
          status:databaseAttestation.status,
          source:databaseAttestation.source,
          verifiedAt:databaseAttestation.verifiedAt,
          fingerprint:databaseAttestation.fingerprint
        }
      : {status:"not_collected",source:"live-production-database"},
    edgeFunctions:edgeFunctionAttestation
      ? {
          status:edgeFunctionAttestation.status,
          source:edgeFunctionAttestation.source,
          verifiedAt:edgeFunctionAttestation.verifiedAt,
          releaseReference:edgeFunctionAttestation.workflowRunId,
          sourceCommit:edgeFunctionAttestation.sourceCommit,
          sourceTreeSha256:edgeFunctionAttestation.sourceTreeSha256,
          functionCount:Object.keys(edgeFunctionAttestation.functions||{}).length
        }
      : {status:"not_collected",source:"governed-production-edge-function-release"}
  },
  generatedAt:new Date().toISOString()
};
mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(manifest)+"\n","utf8");
console.log("Wrote release manifest for",manifest.frontendCommit);
