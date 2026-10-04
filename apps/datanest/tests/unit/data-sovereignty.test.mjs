import test from "node:test";
import assert from "node:assert/strict";
import {deriveDataSovereigntyModel} from "../../src/lib/dataSovereignty.ts";

function manifest(overrides={}){
  return {
    default_visibility_class:"project_restricted",
    default_reuse_state:"runtime_only",
    enforcement_mode:"report_only",
    approved_provider_keys:[],
    export_policy:"governed_only",
    evidence_state:"partial",
    retention_policy_id:null,
    ...overrides
  };
}

test("missing manifest fails closed without inventing residency claims",()=>{
  const model=deriveDataSovereigntyModel({
    manifest:null,
    providerProfiles:[],
    retentionPolicies:[],
    retentionHolds:[{status:"active"},{status:"released"}]
  });
  assert.equal(model.rollout,"unresolved");
  assert.equal(model.boundary,"unresolved");
  assert.equal(model.externalProcessing,"unresolved");
  assert.equal(model.authorityModel,"project_governed");
  assert.equal(model.platformOwnershipEffect,"none");
  assert.equal(model.activeHoldCount,1);
  assert.deepEqual(model.allowedRegions,[]);
});

test("local-only classification denies external and cross-border processing",()=>{
  const model=deriveDataSovereigntyModel({
    manifest:manifest({default_visibility_class:"local_only",approved_provider_keys:["vendor:a"]}),
    providerProfiles:[{provider_key:"vendor:a",status:"active",allowed_regions:["eu-central-1"]}],
    retentionPolicies:[],
    retentionHolds:[]
  });
  assert.equal(model.boundary,"local_only");
  assert.equal(model.externalProcessing,"denied");
  assert.equal(model.crossBorder,"denied");
});

test("region-constrained posture requires active approved profiles with explicit region allowlists",()=>{
  const model=deriveDataSovereigntyModel({
    manifest:manifest({enforcement_mode:"enforced",approved_provider_keys:["vendor:a","vendor:b"]}),
    providerProfiles:[
      {provider_key:"vendor:a",status:"active",allowed_regions:["eu-central-1"]},
      {provider_key:"vendor:b",status:"active",allowed_regions:["eu-central-1","af-south-1"]}
    ],
    retentionPolicies:[],
    retentionHolds:[]
  });
  assert.equal(model.boundary,"region_constrained");
  assert.equal(model.externalProcessing,"approved_profiles_only");
  assert.equal(model.crossBorder,"governed_by_region_allowlist");
  assert.deepEqual(model.allowedRegions,["af-south-1","eu-central-1"]);
});

test("missing or inactive approved routes require review rather than silently widening authority",()=>{
  const model=deriveDataSovereigntyModel({
    manifest:manifest({enforcement_mode:"enforced",approved_provider_keys:["vendor:a","vendor:b"]}),
    providerProfiles:[
      {provider_key:"vendor:a",status:"active",allowed_regions:["eu-central-1"]},
      {provider_key:"vendor:b",status:"suspended",allowed_regions:["eu-central-1"]}
    ],
    retentionPolicies:[],
    retentionHolds:[]
  });
  assert.equal(model.externalProcessing,"review_required");
  assert.deepEqual(model.unresolvedProviderKeys,["vendor:b"]);
});

test("report-only posture is never represented as enforced external processing",()=>{
  const model=deriveDataSovereigntyModel({
    manifest:manifest({approved_provider_keys:["vendor:a"]}),
    providerProfiles:[{provider_key:"vendor:a",status:"active",allowed_regions:["eu-central-1"]}],
    retentionPolicies:[],
    retentionHolds:[]
  });
  assert.equal(model.rollout,"report_only");
  assert.equal(model.externalProcessing,"report_only");
});

test("reuse authority remains separate from visibility and export authority",()=>{
  assert.equal(deriveDataSovereigntyModel({manifest:manifest({default_reuse_state:"runtime_only"}),providerProfiles:[],retentionPolicies:[],retentionHolds:[]}).reusePosture,"immediate_operation_only");
  assert.equal(deriveDataSovereigntyModel({manifest:manifest({default_reuse_state:"project_certified_memory"}),providerProfiles:[],retentionPolicies:[],retentionHolds:[]}).reusePosture,"project_governed");
  assert.equal(deriveDataSovereigntyModel({manifest:manifest({default_reuse_state:"datanest_certified_knowledge"}),providerProfiles:[],retentionPolicies:[],retentionHolds:[]}).reusePosture,"platform_governed");
});

test("referenced active retention policy and holds are surfaced without authorizing deletion",()=>{
  const model=deriveDataSovereigntyModel({
    manifest:manifest({retention_policy_id:"r1"}),
    providerProfiles:[],
    retentionPolicies:[{id:"r1",status:"active",policy_key:"project-default",default_disposition_intent:"review_due"}],
    retentionHolds:[{status:"active"},{status:"released"}]
  });
  assert.equal(model.retentionPolicyKey,"project-default");
  assert.equal(model.retentionDisposition,"review_due");
  assert.equal(model.activeHoldCount,1);
});
