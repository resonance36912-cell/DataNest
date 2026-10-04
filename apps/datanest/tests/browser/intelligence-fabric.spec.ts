import { expect, test, type Page } from "@playwright/test";

const appPath=process.env.DATANEST_APP_PATH||"/";
const projectId="00000000-0000-4000-8000-000000000010";
const userId="00000000-0000-4000-8000-000000000001";
const jobId="00000000-0000-4000-8000-000000000020";
const profileId="00000000-0000-4000-8000-000000000030";
const routeId="00000000-0000-4000-8000-000000000031";
const resourceId="00000000-0000-4000-8000-000000000040";
const capabilityId="00000000-0000-4000-8000-000000000041";

const job={
  id:jobId,job_number:51,title:"Fixture ILM-1 routing",description:"Phase F browser fixture",
  priority:70,status:"READY",required_capabilities:["chat"],created_at:"2026-09-27T10:00:00Z",
  updated_at:"2026-09-27T11:00:00Z"
};

const memory={
  id:"00000000-0000-4000-8000-000000000050",
  normalized_knowledge:"Certified fixture knowledge remains governed memory.",
  category:"architecture",
  effective_version:1,
  certification_id:"00000000-0000-4000-8000-000000000051",
  source_job_ids:[jobId],
  source_trace_ids:["DN-AI-fixture"],
  certification_class:"admin_reviewed",
  confidence:0.9,
  policy_version:"fixture-policy-v1",
  content_hash:"fixture-hash",
  supersedes_memory_id:null,
  promoted_at:"2026-09-27T10:30:00Z"
};

function intelligenceWorkspace(role:"viewer"|"operator"|"owner"){
  return {
    profiles:[{
      id:profileId,project_id:projectId,version:1,status:"active",profile_key:"ilm-1",
      display_name:"ILM-1",allowed_purposes:["job_execution","user_requested_analysis"],
      default_capability:"chat",allowed_resource_kinds:["model_endpoint","external_service"],
      memory_policy:{source:"certified_memory"},routing_policy:{provider_agnostic:true},
      evaluation_policy:{require_provenance:true},metadata:{identity:"DataNest AI"},
      created_at:"2026-09-27T10:00:00Z"
    }],
    routes:[{
      id:routeId,project_id:projectId,job_id:jobId,trace_id:"DN-ILM-fixture",
      profile_id:profileId,profile_version:1,purpose:"job_execution",
      visibility_class:"project_restricted",requested_operation:"prepare",requested_capability:"chat",
      certified_memory_ids:[memory.id],resource_id:resourceId,capability_id:capabilityId,
      provider_connection_id:"00000000-0000-4000-8000-000000000060",
      provider_key:"fixture:provider.example",model_label:"fixture-model",
      route_kind:"provider_model",decision:"selected",reason_codes:["ilm_route_selected"],
      policy_evidence:{policy_version:"fixture"},resource_evidence:{health:"healthy"},
      created_at:"2026-09-27T11:00:00Z"
    }],
    evaluations:[{
      id:"00000000-0000-4000-8000-000000000070",project_id:projectId,route_decision_id:routeId,
      evaluation_key:"route-provenance",evaluation_version:"v1",evaluator_kind:"deterministic",
      status:"passed",dimensions:{provenance_complete:true},findings:{},trace_id:"DN-EVAL-fixture",
      evaluated_at:"2026-09-27T11:01:00Z",created_at:"2026-09-27T11:01:00Z"
    }],
    capability_evidence:[{
      id:"00000000-0000-4000-8000-000000000080",project_id:projectId,resource_id:resourceId,
      capability_id:capabilityId,route_decision_id:routeId,evaluation_run_id:null,
      purpose:"job_execution",evidence_kind:"route_result",status:"supported",
      metrics:{latency_ms:120},trace_id:"DN-CAP-fixture",observed_at:"2026-09-27T11:02:00Z",
      created_at:"2026-09-27T11:02:00Z"
    }],
    certified_memory:{active_count:1,latest_ids:[memory.id]},
    resource_fabric:{active_resource_count:1,linked_capability_count:1},
    caller_role:role,
    can_manage:role==="owner",
    boundaries:{
      ilm_is_trained_foundation_model:false,routing_is_authorization:false,
      evaluation_mutable_in_browser:false,certified_memory_promotion_separate:true,
      phase_c_policy_separate:true,phase_d_authority_separate:true,phase_e_health_separate:true
    }
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
    const pathname=new URL(request.url()).pathname;
    let body:unknown=[];
    const headers:Record<string,string>={"content-type":"application/json"};

    if(pathname.endsWith("/projects"))body={id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    else if(pathname.endsWith("/project_members"))body={project_id:projectId,user_id:userId,role,status:"active"};
    else if(pathname.endsWith("/tool_registry"))body=[];
    else if(pathname.endsWith("/capabilities"))body=[];
    else if(pathname.endsWith("/jobs")){
      body=[job];
      headers["content-range"]="0-0/1";
    }
    else if(pathname.endsWith("/rpc/get_project_dashboard_summary"))body={total_jobs:1,active_jobs:1,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    else if(pathname.endsWith("/rpc/get_intelligence_fabric_workspace_v1"))body=intelligenceWorkspace(role);
    else if(pathname.endsWith("/rpc/upsert_ilm_profile_v1"))body="00000000-0000-4000-8000-000000000099";
    else if(pathname.endsWith("/functions/v1/datanest-ai-chat")||pathname.endsWith("/datanest-ai-chat")){
      body={sessionId:"fixture-session",job,events:[],certifiedMemory:[memory]};
    }
    else if(pathname.endsWith("/functions/v1/datanest-ai-certification")||pathname.endsWith("/datanest-ai-certification")){
      body={role,candidates:[],validationRuns:[]};
    }
    else if(pathname.includes("/rpc/")&&Array.isArray(body))body=null;

    return route.fulfill({headers,body:JSON.stringify(body)});
  });
}
async function openGovernanceTools(page:Page){
  const disclosure=page.locator("#datanest-ai-governance-tools");
  await expect(disclosure).toBeVisible();
  await disclosure.locator("summary").first().click();
  await expect(disclosure).toHaveAttribute("open","");
}

test("ILM-1 is visibly governed orchestration while Certified Memory remains separate",async({page})=>{
  await setup(page,"viewer");
  await page.goto(appPath+"?view=ai");
  await openGovernanceTools(page);

  await expect(page.getByText("ILM-1 = governed orchestration, not a trained foundation model.",{exact:false})).toBeVisible();
  await expect(page.getByText("Routing ≠ authorization.",{exact:false})).toBeVisible();
  await expect(page.getByText("Evaluation evidence is read-only.",{exact:false})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Project-wide reusable knowledge",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Governed intelligence composition",exact:true})).toBeVisible();
  await expect(page.getByText("Certified fixture knowledge remains governed memory.",{exact:true})).toBeVisible();
});

test("viewer and operator cannot mutate ILM profiles or service evidence",async({page})=>{
  for(const role of ["viewer","operator"] as const){
    await setup(page,role);
    await page.goto(appPath+"?view=ai");
    await openGovernanceTools(page);
    await expect(page.locator("summary").filter({hasText:"Version ILM-1 profile"})).toHaveCount(0);
    await expect(page.getByRole("button",{name:/record route|record evaluation|mark supported|mark unsupported/i})).toHaveCount(0);
    await expect(page.getByText("Provider Model",{exact:true})).toBeVisible();
  }
});

test("owner can version the governed ILM-1 profile without credential fields",async({page})=>{
  await setup(page,"owner");
  await page.goto(appPath+"?view=ai");
  await openGovernanceTools(page);

  const profile=page.locator("details.quietDisclosure").filter({hasText:"Version ILM-1 profile · Owner / admin"});
  await profile.locator("summary").click();
  await expect(profile.getByLabel("Profile key")).toHaveValue("ilm-1");
  await expect(profile.getByLabel(/Password|API key|Access token|Refresh token/i)).toHaveCount(0);
  await profile.getByRole("button",{name:"Record profile version",exact:true}).click();
  await expect(page.getByText("A new governed ILM-1 profile version was recorded.",{exact:true})).toBeVisible();
});

test("route evaluation and capability evidence are visible but read-only",async({page})=>{
  await setup(page,"owner");
  await page.goto(appPath+"?view=ai");
  await openGovernanceTools(page);

  await expect(page.getByText("fixture-model",{exact:true})).toBeVisible();
  await expect(page.getByText("route-provenance",{exact:true})).toBeVisible();
  await expect(page.getByText("Route Result",{exact:true})).toBeVisible();
  await expect(page.getByText("Supported",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:/Mark healthy|Set healthy|Update health|Record evaluation/i})).toHaveCount(0);
});

test("mobile Intelligence Fabric has no horizontal page overflow",async({page})=>{
  await setup(page,"owner");
  await page.setViewportSize({width:390,height:844});
  await page.goto(appPath+"?view=ai");
  await openGovernanceTools(page);
  await expect(page.getByRole("heading",{name:"Governed intelligence composition",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
