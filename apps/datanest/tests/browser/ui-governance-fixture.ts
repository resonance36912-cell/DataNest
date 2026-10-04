import type { Page } from "@playwright/test";

export const uiGovernanceFixture={
  projectId:"00000000-0000-4000-8000-000000000010",
  userId:"00000000-0000-4000-8000-000000000001",
  job:{
    id:"00000000-0000-4000-8000-000000000099",
    job_number:99,
    title:"UI Governance Certification Fixture",
    description:"Deterministic fixture for UI governance certification.",
    priority:80,
    status:"RUNNING",
    required_capabilities:["chat"],
    acceptance:{},
    created_at:"2026-09-29T08:00:00Z",
    updated_at:"2026-09-29T09:00:00Z"
  }
} as const;

export async function setupUiGovernanceFixture(page:Page){
  const {projectId,userId,job}=uiGovernanceFixture;
  // Mirror keeps its owner-only entry gate; this changes only the mocked identity.
  const fixtureEmail=process.env.DATANEST_MIRROR_TEST_MODE==="true"?"iace1236912@gmail.com":"fixture@example.invalid";

  await page.route("**/runtime-config.js",route=>route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));

  await page.addInitScript(({userId,fixtureEmail})=>{
    const encode=(data:unknown)=>btoa(JSON.stringify(data))
      .replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    localStorage.setItem("sb-fixture-auth-token",JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture",
      token_type:"bearer",
      expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:fixtureEmail}
    }));
  },{userId,fixtureEmail});

  await page.route("https://fixture.supabase.co/**",route=>{
    const path=new URL(route.request().url()).pathname;
    let body:unknown=[];
    const headers:Record<string,string>={"content-type":"application/json"};

    if(path.endsWith("/projects")) body={
      id:projectId,slug:"resonance-datanest",name:"UI Governance Fixture",
      description:"Deterministic certification project.",status:"ACTIVE",
      created_at:"2026-09-29T08:00:00Z"
    };
    else if(path.endsWith("/project_members")) body={
      project_id:projectId,user_id:userId,role:"owner",status:"active"
    };
    else if(path.endsWith("/tool_registry")) body=[];
    else if(path.endsWith("/capabilities")) body=[];
    else if(path.endsWith("/scheduler_policies")) body=[];
    else if(path.endsWith("/jobs")){
      body=[job];
      headers["content-range"]="0-0/1";
    }
    else if(path.endsWith("/runs")||path.endsWith("/checkpoints")||path.endsWith("/events")){
      body=[];
      headers["content-range"]="*/0";
    }
    else if(path.endsWith("/rpc/get_project_dashboard_summary")) body={
      total_jobs:1,active_jobs:1,running_jobs:1,blocked_jobs:0,
      available_capabilities:0,registered_capabilities:0
    };
    else if(path.endsWith("/rpc/get_governance_workspace_v1")) body={
      ratified_protocol:null,
      draft_protocols:[],
      proposals:[],
      decisions:[],
      disputes:[],
      can_manage:true,
      can_vote:true,
      member_role:"owner",
      boundaries:{formal_vote_basis:"one_active_project_member_one_vote"}
    };
    else if(path.endsWith("/datanest-ai-chat")) body={
      sessionId:"ui-governance-session",
      job,
      events:[],
      certifiedMemory:[]
    };
    else if(path.endsWith("/datanest-ai-certification")) body={
      role:"owner",
      candidates:[],
      validationRuns:[]
    };
    else if(
      path.includes("/accept_pending_project_member_invites_v1")||
      path.includes("/accept_pending_job_invites")
    ) body=null;
    else if(path.includes("/rpc/")) body=[];

    return route.fulfill({headers,body:JSON.stringify(body)});
  });
}
