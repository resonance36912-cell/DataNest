import { expect, test, type Page } from "@playwright/test";

const appPath=process.env.DATANEST_APP_PATH||"/";
const projectId="00000000-0000-4000-8000-000000000010";
const userId="00000000-0000-4000-8000-000000000001";
const jobId="00000000-0000-4000-8000-000000000020";
const capabilityId="00000000-0000-4000-8000-000000000030";
const resourceId="00000000-0000-4000-8000-000000000040";
const localResourceId="00000000-0000-4000-8000-000000000041";

const job={
  id:jobId,job_number:42,title:"Fixture resource routing",description:"Phase E browser fixture",
  priority:70,status:"READY",required_capabilities:["chat"],acceptance:{},created_at:"2026-09-27T08:00:00Z",
  updated_at:"2026-09-27T09:00:00Z",deadline:"2026-09-28T09:00:00Z"
};

const capability={
  id:capabilityId,account_key:"fixture-runtime",connector_kind:"fixture",capability:"chat",state:"AVAILABLE",
  observed_at:"2026-09-27T10:00:00Z",next_check_at:null,confidence:1,concurrency_limit:2,running:0,metadata:{}
};

function resourceWorkspace(role:"viewer"|"operator"|"owner"){
  return {
    resources:[
      {
        binding:{id:"00000000-0000-4000-8000-000000000051",status:"active",resource_alias:"Fixture managed model",allowed_capabilities:["chat"],approved_at:"2026-09-27T09:00:00Z",updated_at:"2026-09-27T09:00:00Z"},
        resource:{
          id:resourceId,resource_key:"fixture:model",resource_kind:"model_endpoint",display_name:"Fixture managed model",
          owner_kind:"external",owner_user_id:null,owner_label:"Fixture provider",trust_level:"verified",
          location_class:"managed_cloud",region_hint:"EU Central",supported_visibility_classes:["public","project_restricted"],
          cost_profile:{mode:"informational"},limits:{max_concurrency:2},health_status:"healthy",
          health_summary:{source:"fixture"},enabled:true,last_seen_at:"2026-09-27T10:00:00Z",
          metadata:{fixture:true},created_source:"user",created_at:"2026-09-27T08:00:00Z",updated_at:"2026-09-27T10:00:00Z"
        },
        capabilities:[capability],
        latest_health:{id:"00000000-0000-4000-8000-000000000061",health_status:"healthy",source_kind:"provider",source_key:"fixture-provider",observed_at:"2026-09-27T10:00:00Z"},
        recent_health:[{id:"00000000-0000-4000-8000-000000000061",health_status:"healthy",observed_availability:"AVAILABLE",source_kind:"provider",source_key:"fixture-provider",metrics:{latency_ms:120},trace_id:"health-1",observed_at:"2026-09-27T10:00:00Z"}],
        sovereign_node_policy:null
      },
      {
        binding:{id:"00000000-0000-4000-8000-000000000052",status:"active",resource_alias:"Fixture sovereign node",allowed_capabilities:["chat"],approved_at:"2026-09-27T09:00:00Z",updated_at:"2026-09-27T09:00:00Z"},
        resource:{
          id:localResourceId,resource_key:"fixture:local-node",resource_kind:"local_node",display_name:"Fixture sovereign node",
          owner_kind:"project",owner_user_id:null,owner_label:"Fixture project",trust_level:"declared",
          location_class:"local_device",region_hint:null,supported_visibility_classes:["local_only"],
          cost_profile:{},limits:{max_concurrency:1},health_status:"degraded",
          health_summary:{source:"node_agent"},enabled:true,last_seen_at:"2026-09-27T09:55:00Z",
          metadata:{fixture:true},created_source:"user",created_at:"2026-09-27T08:00:00Z",updated_at:"2026-09-27T09:55:00Z"
        },
        capabilities:[{...capability,id:"00000000-0000-4000-8000-000000000031",account_key:"fixture-local",concurrency_limit:1}],
        latest_health:{id:"00000000-0000-4000-8000-000000000062",health_status:"degraded",source_kind:"node_agent",source_key:"fixture-node",observed_at:"2026-09-27T09:55:00Z"},
        recent_health:[{id:"00000000-0000-4000-8000-000000000062",health_status:"degraded",observed_availability:"AVAILABLE",source_kind:"node_agent",source_key:"fixture-node",metrics:{load:0.7},trace_id:"health-2",observed_at:"2026-09-27T09:55:00Z"}],
        sovereign_node_policy:{
          id:"00000000-0000-4000-8000-000000000071",version:1,status:"active",allowed_capabilities:["chat"],
          resource_ceiling:{max_concurrency:1},schedule_policy:{mode:"always"},allowed_visibility_classes:["local_only"],
          data_scope:{project:true},prohibited_operations:["destruct"],network_policy:{outbound:"restricted"},
          interactive_remote_control:false,approved_at:"2026-09-27T09:10:00Z",created_at:"2026-09-27T09:10:00Z"
        }
      }
    ],
    unbound_capabilities:[],
    caller_role:role,
    can_manage:role==="owner",
    boundaries:{
      registration_is_remote_control:false,
      resource_match_is_reservation:false,
      resource_match_is_authorization:false,
      local_node_is_required:false,
      health_client_mutable:false,
      phase_c_remains_independent:true,
      phase_d_remains_independent:true
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
    if(pathname.endsWith("/project_members"))body={project_id:projectId,user_id:userId,role,status:"active"};
    if(pathname.endsWith("/tool_registry"))body=[];
    if(pathname.endsWith("/capabilities"))body=[capability];
    if(pathname.endsWith("/jobs")){
      body=[job];
      headers["content-range"]="0-0/1";
    }
    if(pathname.endsWith("/rpc/get_project_dashboard_summary"))body={total_jobs:1,active_jobs:1,running_jobs:0,blocked_jobs:0,available_capabilities:1,registered_capabilities:1};
    if(pathname.endsWith("/rpc/get_resource_fabric_workspace_v1"))body=resourceWorkspace(role);
    if(pathname.includes("/rpc/")&&Array.isArray(body))body="00000000-0000-4000-8000-000000000999";

    return route.fulfill({headers,body:JSON.stringify(body)});
  });
}

test("TranScheduler keeps Gantt default and exposes Resource Fabric as a sibling mode",async({page})=>{
  await setup(page,"operator");
  await page.goto(appPath+"?view=scheduler");
  await expect(page.getByRole("button",{name:"Gantt chart",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"Resource Fabric",exact:true})).toBeVisible();
});

test("viewer can inspect Resource Fabric health and sovereignty without mutation controls",async({page})=>{
  await setup(page,"viewer");
  await page.goto(appPath+"?view=scheduler");
  await page.getByRole("button",{name:"Resource Fabric",exact:true}).click();

  await expect(page.getByText("Registration ≠ remote control.",{exact:false})).toBeVisible();
  await expect(page.getByText("Resource match ≠ reservation ≠ Capability Lease.",{exact:false})).toBeVisible();
  await expect(page.getByText("Fixture managed model",{exact:true})).toBeVisible();
  await expect(page.getByText("Fixture sovereign node",{exact:true})).toBeVisible();
  await expect(page.getByText("Healthy",{exact:true}).first()).toBeVisible();
  await expect(page.locator("summary").filter({hasText:"Register Resource"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Suspend",exact:true})).toHaveCount(0);
});

test("operator sees Resource Fabric but cannot create supply-side trust or node policy",async({page})=>{
  await setup(page,"operator");
  await page.goto(appPath+"?view=scheduler");
  await page.getByRole("button",{name:"Resource Fabric",exact:true}).click();

  await expect(page.getByText("Fixture managed model",{exact:true})).toBeVisible();
  await expect(page.locator("summary").filter({hasText:"Register Resource"})).toHaveCount(0);
  await expect(page.locator("summary").filter({hasText:"Sovereign node policy"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Retire",exact:true})).toHaveCount(0);
});

test("owner can register Resources and manage project binding state",async({page})=>{
  await setup(page,"owner");
  await page.goto(appPath+"?view=scheduler");
  await page.getByRole("button",{name:"Resource Fabric",exact:true}).click();

  const registration=page.locator("details").filter({hasText:"Register Resource · Owner / admin"});
  await registration.locator("summary").click();
  await registration.getByLabel("Resource key").fill("fixture:new-resource");
  await registration.getByLabel("Display name").fill("New fixture Resource");
  await registration.getByRole("button",{name:"Register Resource",exact:true}).click();
  await expect(page.getByText("Resource registered and bound to this project.",{exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Suspend",exact:true}).first().click();
  await expect(page.getByText("Resource binding suspended.",{exact:true})).toBeVisible();
});

test("sovereign node policy is visibly bounded and health remains read-only",async({page})=>{
  await setup(page,"owner");
  await page.goto(appPath+"?view=scheduler");
  await page.getByRole("button",{name:"Resource Fabric",exact:true}).click();

  await expect(page.getByText("Interactive remote control: disabled.",{exact:true})).toBeVisible();
  await expect(page.getByText("Health evidence is service-recorded and read-only.",{exact:false})).toBeVisible();
  await expect(page.getByRole("button",{name:/Mark healthy|Set healthy|Update health/i})).toHaveCount(0);
  await expect(page.locator("summary").filter({hasText:"Sovereign node policy · Owner / admin"})).toBeVisible();
});

test("mobile Resource Fabric has no horizontal page overflow",async({page})=>{
  await setup(page,"owner");
  await page.setViewportSize({width:390,height:844});
  await page.goto(appPath+"?view=scheduler");
  await page.getByRole("button",{name:"Resource Fabric",exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
