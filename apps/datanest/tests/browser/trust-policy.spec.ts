import { expect, test, type Page } from "@playwright/test";

const appPath=process.env.DATANEST_APP_PATH||"/";
const projectId="00000000-0000-4000-8000-000000000010";
const userId="00000000-0000-4000-8000-000000000001";

function trustWorkspace(role:"viewer"|"operator"|"owner"){
  return {
    active_manifest:{
      id:"00000000-0000-4000-8000-000000000101",project_id:projectId,scope_type:"project",product_id:null,
      version:1,status:"active",default_visibility_class:"project_restricted",default_reuse_state:"runtime_only",
      publication_policy:"governed_only",export_policy:"governed_only",certified_memory_policy:"existing_governed_pipeline",
      evidence_state:"verified",evidence_reference:"PR-133 + Phase C fixture",known_limitations:"Cloud-Nest, Supository and ILM remain target state.",
      policy_version:"phase-c-trust-v1",retention_policy_id:"00000000-0000-4000-8000-000000000301",effective_from:"2026-09-27T09:00:00Z"
    },
    manifests:[{
      id:"00000000-0000-4000-8000-000000000102",project_id:projectId,scope_type:"project",product_id:null,
      version:2,status:"draft",default_visibility_class:"project_restricted",default_reuse_state:"project_learning_eligible",
      evidence_state:"partial",evidence_reference:"fixture-review",policy_version:"phase-c-trust-v2",created_at:"2026-09-27T10:00:00Z"
    }],
    provider_profiles:[{
      id:"00000000-0000-4000-8000-000000000201",project_id:projectId,provider_key:"fixture-provider",provider_category:"ai_model",
      status:"suspended",allowed_visibility_classes:["project_restricted"],allowed_purposes:["external_provider_processing"],
      prohibited_purposes:["platform_learning"],allowed_regions:["ZA"],retention_posture:"Provider retention reviewed.",
      training_reuse_posture:"Provider training disabled by contract.",evidence_state:"partial",policy_version:"provider-v1",
      review_due_at:"2026-09-26T00:00:00Z",known_limitations:"Suspended pending review.",created_at:"2026-09-27T09:00:00Z"
    },{
      id:"00000000-0000-4000-8000-000000000202",project_id:projectId,provider_key:"candidate-provider",provider_category:"ai_model",
      status:"draft",allowed_visibility_classes:["project_restricted"],allowed_purposes:["external_provider_processing"],
      prohibited_purposes:[],allowed_regions:[],retention_posture:"Draft retention posture.",
      training_reuse_posture:"Draft training posture.",evidence_state:"planned",policy_version:"provider-v2",
      review_due_at:null,known_limitations:"Planned only.",created_at:"2026-09-27T10:00:00Z"
    }],
    bindings:[{
      id:"00000000-0000-4000-8000-000000000401",project_id:projectId,subject_type:"project",subject_id:projectId,
      subject_reference:null,visibility_class:"public",reuse_state:"publicly_reusable",publication_authorized:true,
      status:"proposed",rationale:"Fixture high-impact proposal.",evidence_reference:"fixture",created_at:"2026-09-27T10:00:00Z"
    }],
    retention_policies:[{
      id:"00000000-0000-4000-8000-000000000301",project_id:projectId,policy_key:"project-default",version:1,status:"active",
      default_disposition_intent:"retain",created_at:"2026-09-27T09:00:00Z"
    },{
      id:"00000000-0000-4000-8000-000000000302",project_id:projectId,policy_key:"project-default",version:2,status:"draft",
      default_disposition_intent:"delete_when_authorized",created_at:"2026-09-27T10:00:00Z"
    }],
    retention_holds:[{
      id:"00000000-0000-4000-8000-000000000501",project_id:projectId,subject_type:"project",subject_id:projectId,
      subject_reference:null,hold_type:"governance",reason:"Fixture governance hold.",status:"active",placed_at:"2026-09-27T10:00:00Z"
    }],
    retention_reviews:[{
      id:"00000000-0000-4000-8000-000000000601",project_id:projectId,subject_type:"project",subject_id:projectId,
      subject_reference:null,status:"pending",proposed_disposition:"delete_when_authorized",rationale:"Fixture future disposition review.",
      active_hold_count:1,active_lineage_count:0,future_disposition_blocked:true,created_at:"2026-09-27T10:00:00Z"
    }],
    can_propose:role!=="viewer",
    can_approve:role==="owner"
  };
}

async function setup(page:Page,role:"viewer"|"operator"|"owner"){
  await page.route("**/runtime-config.js",route=>route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId})=>{
    const encode=(data:unknown)=>btoa(JSON.stringify(data)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    localStorage.setItem("sb-fixture-auth-token",JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture",token_type:"bearer",expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  },{userId});

  await page.route("https://fixture.supabase.co/**",route=>{
    const request=route.request();
    const path=new URL(request.url()).pathname;
    let body:unknown=[];
    if(path.endsWith("/projects"))body={id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    if(path.endsWith("/project_members"))body={project_id:projectId,user_id:userId,role,status:"active"};
    if(path.endsWith("/get_project_dashboard_summary"))body={total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if(path.endsWith("/rpc/get_trust_policy_workspace_v1"))body=trustWorkspace(role);
    if(path.endsWith("/rpc/get_project_membership_workspace_v1"))body={
      members:[],invitations:[],active_formal_voter_count:0,
      can_invite:false,can_invite_admin:false,caller_role:role,
      boundaries:{self_invite:false,owner_invite:false,invitation_creates_vote:false}
    };
    if(path.endsWith("/rpc/get_governance_workspace_v1"))body={
      ratified_protocol:null,draft_protocols:[],proposals:[],decisions:[],disputes:[],
      can_manage:role==="owner",can_vote:role!=="viewer",member_role:role,
      boundaries:{
        formal_vote_basis:"one_active_project_member_one_vote",
        sparks_weight_votes:false,reputation_weight_votes:false,
        governance_amends_contracts:false,governance_changes_legal_ownership:false,
        governance_creates_royalty_entitlements:false,governance_grants_project_roles:false,
        dispute_resolution_mutates_source_records:false
      }
    };
    if(path.includes("/rpc/")&&Array.isArray(body))body="00000000-0000-4000-8000-000000000999";
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });
}

test("Trust & Data Policy deep link preserves Sovereign Governance as default",async({page})=>{
  await setup(page,"viewer");
  await page.goto(appPath+"?view=governance");
  await expect(page.getByRole("region",{name:"Governance workspace overview"})).toBeVisible();
  const governanceEvidence=page.getByRole("region",{name:"Governance evidence"});
  await expect(governanceEvidence).toBeVisible();
  await expect(governanceEvidence.getByText(/No ratified protocol, open proposal, or immutable decision is recorded yet/)).toBeVisible();
  await expect(governanceEvidence.getByText(/authorized project member/i)).toBeVisible();
  await expect(page.getByRole("heading",{name:"Project governance"})).toBeVisible();
  await expect(page.getByRole("tab",{name:"Sovereign Governance"})).toHaveAttribute("aria-selected","true");

  await page.getByRole("tab",{name:"Trust & Data Policy"}).click();
  await expect(page).toHaveURL(/section=trust/);
  await expect(page.getByRole("heading",{name:"Processing, reuse, provider trust and retention"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Trust policy boundaries"}).getByText("Processing permission does not grant learning or publication permission.",{exact:true})).toBeVisible();
  await expect(page.getByText("No destructive retention action is enabled in Phase C v1.",{exact:true})).toBeVisible();
});

test("viewer sees trust state but no mutation controls",async({page})=>{
  await setup(page,"viewer");
  await page.goto(appPath+"?view=governance&section=trust");
  await expect(page.getByText("Project Restricted",{exact:true}).first()).toBeVisible();
  await expect(page.getByText("Runtime Only",{exact:true}).first()).toBeVisible();
  await expect(page.getByText("fixture-provider",{exact:true})).toBeVisible();
  await expect(page.getByText("suspended",{exact:true})).toBeVisible();
  await expect(page.getByText(/evidence Planned \/ target state/)).toBeVisible();
  await expect(page.getByText("Create Trust Manifest draft",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Approve",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:/Delete data|Purge|Anonymize/i})).toHaveCount(0);
});

test("operator can propose but cannot activate high-impact policy",async({page})=>{
  await setup(page,"operator");
  await page.goto(appPath+"?view=governance&section=trust");
  await expect(page.getByText("Propose data policy",{exact:true})).toBeVisible();
  await expect(page.getByText("Create Trust Manifest draft",{exact:true})).toBeVisible();
  await expect(page.getByText("Create Provider Trust Profile draft",{exact:true})).toBeVisible();
  await expect(page.locator("summary").filter({hasText:"Propose retention policy"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Approve",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Activate",exact:true})).toHaveCount(0);
});

test("owner can review governed policy but blocked retention stays non-destructive",async({page})=>{
  await setup(page,"owner");
  await page.goto(appPath+"?view=governance&section=trust");
  await expect(page.getByRole("button",{name:"Approve",exact:true}).first()).toBeVisible();
  await expect(page.getByRole("button",{name:"Activate",exact:true}).first()).toBeVisible();
  await expect(page.getByText("Owner / admin",{exact:true}).first()).toBeVisible();
  await expect(page.getByRole("button",{name:"Approve future disposition"})).toBeDisabled();
  await expect(page.getByText("Fixture governance hold.",{exact:true})).toBeVisible();

  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
