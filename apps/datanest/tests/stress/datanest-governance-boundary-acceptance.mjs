import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const target=new URL(process.env.DATANEST_CERTIFICATION_URL || "https://invalid.invalid");
assert.equal(process.env.DATANEST_CERTIFICATION_TARGET,"local-canonical","SEC-01 acceptance must run on the isolated canonical certification target.");
assert.ok(["127.0.0.1","localhost"].includes(target.hostname),"SEC-01 acceptance must remain loopback-local.");
for(const name of ["DATANEST_CERTIFICATION_PUBLISHABLE_KEY","DATANEST_CERTIFICATION_SERVICE_ROLE_KEY","DATANEST_AI_E2E_PASSWORD"]){
  assert.ok(process.env[name],`${name} is required.`);
}

const {createClient}=await import("@supabase/supabase-js");
const options={auth:{persistSession:false,autoRefreshToken:false}};
const publishableKey=process.env.DATANEST_CERTIFICATION_PUBLISHABLE_KEY;
const admin=createClient(target.origin,process.env.DATANEST_CERTIFICATION_SERVICE_ROLE_KEY,options);
const anonymous=createClient(target.origin,publishableKey,options);
const password=process.env.DATANEST_AI_E2E_PASSWORD;
const marker=randomUUID().replaceAll("-","").slice(0,16);
const results=[];
const cleanup={projects:[],users:[],errors:[]};
const userRecords=[];
let projectA=null;
let projectB=null;
let failure=null;

function dataOf(result,label){
  if(result.error)throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function runCase(id,fn){
  try{
    await fn();
    results.push({id,status:"passed"});
  }catch(error){
    results.push({id,status:"failed",message:error instanceof Error?error.message:"Acceptance check failed."});
    throw error;
  }
}
async function expectDenied(result,label){
  assert.ok(result.error,`${label} must be denied.`);
  return result.error;
}
async function createIdentity(role){
  const email=`datanest-sec01-${role}-${marker}@resonance.invalid`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(created.error)throw new Error(`Create ${role} identity: ${created.error.message}`);
  const user=created.data.user;
  userRecords.push({role,email,id:user.id});
  const client=createClient(target.origin,publishableKey,options);
  const signed=await client.auth.signInWithPassword({email,password});
  if(signed.error||!signed.data.session?.access_token)throw new Error(`Sign in ${role} identity failed.`);
  return {role,email,user,client};
}
async function insertProject(slug,name){
  const inserted=await admin.from("projects").insert({
    slug,name,
    description:"SEC-01 isolated canonical authorization-boundary fixture.",
    status:"ACTIVE"
  }).select("id,slug").single();
  if(inserted.error)throw new Error(`Create fixture project: ${inserted.error.message}`);
  return inserted.data;
}
async function addMember(projectId,identity,role){
  const inserted=await admin.from("project_members").insert({
    project_id:projectId,
    user_id:identity.user.id,
    role,
    status:"active",
    updated_at:new Date().toISOString()
  });
  if(inserted.error)throw new Error(`Add ${role} member: ${inserted.error.message}`);
}
async function workspace(identity,projectId){
  return identity.client.rpc("get_governance_workspace_v1",{target_project:projectId});
}
async function directProjectRoles(projectId){
  const rows=dataOf(await admin.from("project_members")
    .select("user_id,role,status")
    .eq("project_id",projectId)
    .order("role"),"Role snapshot");
  return rows.map(row=>({user_id:row.user_id,role:row.role,status:row.status}));
}

let owner,projectAdmin,operator,viewer,outsider;
let draftId,proposalId,decisionId,protocolId,disputeId,resolutionId,selfReviewProposalId,selfReviewDecisionId;

try{
  owner=await createIdentity("owner");
  projectAdmin=await createIdentity("admin");
  operator=await createIdentity("operator");
  viewer=await createIdentity("viewer");
  outsider=await createIdentity("outsider");

  projectA=await insertProject(`sec01-a-${marker}`,`SEC-01 Project A ${marker}`);
  projectB=await insertProject(`sec01-b-${marker}`,`SEC-01 Project B ${marker}`);
  await addMember(projectA.id,owner,"owner");
  await addMember(projectA.id,projectAdmin,"admin");
  await addMember(projectA.id,operator,"operator");
  await addMember(projectA.id,viewer,"viewer");
  await addMember(projectB.id,outsider,"owner");

  await runCase("SEC-01-role-and-cross-project-matrix",async()=>{
    const matrix=[
      [owner,"owner",true,true],
      [projectAdmin,"admin",true,true],
      [operator,"operator",false,true],
      [viewer,"viewer",false,true]
    ];
    for(const [identity,role,canManage,canVote] of matrix){
      const result=await workspace(identity,projectA.id);
      const value=dataOf(result,`${role} governance workspace`);
      assert.equal(value.member_role,role);
      assert.equal(value.can_manage,canManage);
      assert.equal(value.can_vote,canVote);
    }

    await expectDenied(await workspace(outsider,projectA.id),"Outsider project-A workspace");
    await expectDenied(
      await outsider.client.rpc("create_governance_proposal_v1",{
        target_project:projectA.id,
        target_type:"advisory",
        target_title:"Outsider attempt",
        target_summary:"Must be denied",
        target_body:"No cross-project governance authority.",
        target_protocol:null,
        target_closes_at:null
      }),
      "Outsider proposal"
    );
    await expectDenied(await anonymous.rpc("get_governance_workspace_v1",{target_project:projectA.id}),"Anonymous governance workspace");

    const outsiderRows=dataOf(await outsider.client.from("governance_proposals")
      .select("id,project_id").eq("project_id",projectA.id),"Outsider direct proposal read");
    assert.deepEqual(outsiderRows,[],"Outsider must not see project-A governance rows.");

    await expectDenied(await workspace(viewer,projectB.id),"Project-A viewer accessing project B");
  });

  await runCase("SEC-01-role-escalation-and-direct-history-denial",async()=>{
    await expectDenied(
      await viewer.client.from("project_members")
        .update({role:"owner"})
        .eq("project_id",projectA.id)
        .eq("user_id",viewer.user.id),
      "Viewer direct role escalation"
    );
    const viewerMember=dataOf(await admin.from("project_members")
      .select("role,status").eq("project_id",projectA.id).eq("user_id",viewer.user.id).single(),"Viewer role verification");
    assert.equal(viewerMember.role,"viewer");
    assert.equal(viewerMember.status,"active");

    await expectDenied(
      await viewer.client.from("governance_proposals").insert({
        project_id:projectA.id,
        trace_key:`DN-GOV-DIRECT-${marker}`,
        proposal_type:"advisory",
        title:"Direct write attempt",
        summary:"Must fail",
        body:"Must fail",
        proposed_by:viewer.user.id
      }),
      "Viewer direct governance history insert"
    );
  });

  await runCase("SEC-01-self-review-cannot-self-approve",async()=>{
    selfReviewProposalId=dataOf(await viewer.client.rpc("create_governance_proposal_v1",{
      target_project:projectA.id,
      target_type:"advisory",
      target_title:"Independent support acceptance check",
      target_summary:"Proposer-only support must not qualify as independent.",
      target_body:"A proposal must not become accepted from proposer-only support.",
      target_protocol:null,
      target_closes_at:null
    }),"Create self-review proposal");

    dataOf(await viewer.client.rpc("cast_governance_vote_v1",{
      target_proposal:selfReviewProposalId,
      target_choice:"support",
      target_rationale:"Proposer self-support fixture"
    }),"Self-review proposal vote");

    selfReviewDecisionId=dataOf(await owner.client.rpc("close_governance_proposal_v1",{
      target_proposal:selfReviewProposalId,
      target_summary:"SEC-01 proposer-only close"
    }),"Close self-review proposal");

    const decision=dataOf(await admin.from("governance_decisions")
      .select("outcome,independent_support,quorum_met")
      .eq("id",selfReviewDecisionId).single(),"Self-review decision inspection");
    assert.equal(decision.outcome,"rejected");
    assert.equal(decision.independent_support,false);
    assert.equal(decision.quorum_met,true);

    await expectDenied(
      await viewer.client.from("governance_decisions")
        .update({outcome:"accepted"})
        .eq("id",selfReviewDecisionId),
      "Viewer direct decision rewrite"
    );
    const unchanged=dataOf(await admin.from("governance_decisions")
      .select("outcome,independent_support")
      .eq("id",selfReviewDecisionId).single(),"Decision immutability verification");
    assert.equal(unchanged.outcome,"rejected");
    assert.equal(unchanged.independent_support,false);
  });

  await runCase("SEC-01-full-governance-lifecycle",async()=>{
    draftId=dataOf(await owner.client.rpc("create_governance_protocol_draft_v1",{
      target_project:projectA.id,
      target_title:"SEC-01 Protocol",
      target_mission:"Exercise canonical multi-collaborator authorization boundaries.",
      target_vision:"Independently supported and reviewable governance.",
      target_body:"SEC-01 synthetic protocol body.",
      target_principles:["authorization","independence","append-only evidence"]
    }),"Create protocol draft");

    await expectDenied(
      await viewer.client.rpc("create_governance_protocol_draft_v1",{
        target_project:projectA.id,
        target_title:"Viewer draft attempt",
        target_mission:"",
        target_vision:"",
        target_body:"Must be denied.",
        target_principles:[]
      }),
      "Viewer protocol drafting"
    );

    proposalId=dataOf(await viewer.client.rpc("create_governance_proposal_v1",{
      target_project:projectA.id,
      target_type:"protocol_change",
      target_title:"Ratify SEC-01 Protocol",
      target_summary:"Exercise independent voting and authority separation.",
      target_body:"Request ratification of the SEC-01 synthetic protocol.",
      target_protocol:draftId,
      target_closes_at:null
    }),"Create protocol proposal");

    dataOf(await viewer.client.rpc("cast_governance_vote_v1",{
      target_proposal:proposalId,
      target_choice:"support",
      target_rationale:"Proposer support"
    }),"Proposer vote");
    dataOf(await operator.client.rpc("cast_governance_vote_v1",{
      target_proposal:proposalId,
      target_choice:"support",
      target_rationale:"Independent operator support"
    }),"Independent vote");

    await expectDenied(
      await viewer.client.rpc("close_governance_proposal_v1",{
        target_proposal:proposalId,
        target_summary:"Viewer close attempt"
      }),
      "Viewer proposal close"
    );

    decisionId=dataOf(await projectAdmin.client.rpc("close_governance_proposal_v1",{
      target_proposal:proposalId,
      target_summary:"SEC-01 accepted with independent support"
    }),"Admin close proposal");

    await expectDenied(
      await operator.client.rpc("ratify_governance_protocol_v1",{
        target_protocol:draftId,
        target_proposal:proposalId
      }),
      "Operator protocol ratification"
    );

    protocolId=dataOf(await owner.client.rpc("ratify_governance_protocol_v1",{
      target_protocol:draftId,
      target_proposal:proposalId
    }),"Owner ratify protocol");
    assert.equal(protocolId,draftId);

    const decision=dataOf(await admin.from("governance_decisions")
      .select("outcome,independent_support,quorum_met").eq("id",decisionId).single(),"Accepted decision inspection");
    assert.equal(decision.outcome,"accepted");
    assert.equal(decision.independent_support,true);
    assert.equal(decision.quorum_met,true);
  });

  await runCase("SEC-01-dispute-independent-resolution-and-source-preservation",async()=>{
    disputeId=dataOf(await projectAdmin.client.rpc("file_governance_dispute_v1",{
      target_project:projectA.id,
      target_type:"decision",
      target_id:decisionId,
      target_title:"SEC-01 independent dispute review",
      target_grounds:"Synthetic dispute for independent-resolution acceptance.",
      target_requested_remedy:"Clarify without mutating source decision."
    }),"Admin file dispute");

    await expectDenied(
      await projectAdmin.client.rpc("resolve_governance_dispute_v1",{
        target_dispute:disputeId,
        target_outcome:"clarified",
        target_resolution:"Self-resolution must fail.",
        target_replacement_proposal:null
      }),
      "Dispute filer self-resolution"
    );

    resolutionId=dataOf(await owner.client.rpc("resolve_governance_dispute_v1",{
      target_dispute:disputeId,
      target_outcome:"clarified",
      target_resolution:"Independent owner clarification; source decision remains unchanged.",
      target_replacement_proposal:null
    }),"Independent dispute resolution");

    const resolution=dataOf(await admin.from("governance_dispute_resolutions")
      .select("source_record_mutated,resolved_by,outcome").eq("id",resolutionId).single(),"Resolution inspection");
    assert.equal(resolution.source_record_mutated,false);
    assert.equal(resolution.resolved_by,owner.user.id);
    assert.equal(resolution.outcome,"clarified");

    const sourceDecision=dataOf(await admin.from("governance_decisions")
      .select("outcome,proposal_id").eq("id",decisionId).single(),"Source decision after dispute");
    assert.equal(sourceDecision.outcome,"accepted");
    assert.equal(sourceDecision.proposal_id,proposalId);

    const sourceProposal=dataOf(await admin.from("governance_proposals")
      .select("status,target_protocol_id").eq("id",proposalId).single(),"Source proposal after dispute");
    assert.equal(sourceProposal.status,"accepted");
    assert.equal(sourceProposal.target_protocol_id,draftId);

    const sourceProtocol=dataOf(await admin.from("governance_protocol_versions")
      .select("status").eq("id",draftId).single(),"Source protocol after dispute");
    assert.equal(sourceProtocol.status,"ratified");
  });

  await runCase("SEC-01-membership-authority-unchanged",async()=>{
    const roles=await directProjectRoles(projectA.id);
    const expected=new Map([
      [owner.user.id,"owner"],
      [projectAdmin.user.id,"admin"],
      [operator.user.id,"operator"],
      [viewer.user.id,"viewer"]
    ]);
    assert.equal(roles.length,4);
    for(const row of roles){
      assert.equal(row.status,"active");
      assert.equal(row.role,expected.get(row.user_id));
    }
  });
}catch(error){
  failure=error;
}finally{
  if(projectA||projectB){
    const ids=[projectA?.id,projectB?.id].filter(Boolean);
    const deleted=await admin.from("projects").delete().in("id",ids);
    if(deleted.error)cleanup.errors.push("Project cleanup: "+deleted.error.message);
    else cleanup.projects=ids;
  }
  for(const record of userRecords){
    const deleted=await admin.auth.admin.deleteUser(record.id);
    if(deleted.error)cleanup.errors.push(`User cleanup ${record.role}: ${deleted.error.message}`);
    else cleanup.users.push(record.id);
  }

  const status=!failure&&cleanup.errors.length===0&&results.every(item=>item.status==="passed")?"passed":"failed";
  const evidence={
    suite:"datanest-governance-boundary-acceptance-v1",
    auditFinding:"SEC-01",
    certificationTarget:"local-canonical",
    candidateCommit:process.env.DATANEST_CANDIDATE_SHA||null,
    checkoutCommit:process.env.GITHUB_SHA||null,
    fixtureMarker:marker,
    testedRoles:["anonymous","viewer","operator","admin","owner","outsider"],
    testedBoundaries:[
      "project access and cross-project isolation",
      "role-gated governance management",
      "direct role escalation denial",
      "direct governance-history write denial",
      "proposer-only support cannot satisfy independent support",
      "full draft-proposal-independent-vote-close-ratify lifecycle",
      "dispute filer cannot self-resolve",
      "dispute resolution preserves source records",
      "governance operations do not alter membership roles"
    ],
    productionParityReference:"docs/reviews/2026-09-30-sec01-runtime-acceptance.md",
    mirrorStagingUsed:false,
    productionMutated:false,
    cleanup,
    completedAt:new Date().toISOString(),
    results,
    status
  };
  await mkdir("certification-artifacts",{recursive:true});
  await writeFile("certification-artifacts/datanest-governance-boundary-acceptance.json",JSON.stringify(evidence,null,2)+"\n");
  console.log(JSON.stringify(evidence));
}

if(failure)throw failure;
if(cleanup.errors.length)throw new Error("SEC-01 cleanup failed: "+cleanup.errors.join("; "));
