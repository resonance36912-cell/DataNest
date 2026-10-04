import { expect, test, type Page } from "@playwright/test";

const appPath=process.env.DATANEST_APP_PATH||"/";
const projectId="00000000-0000-4000-8000-000000000010";
const userId="00000000-0000-4000-8000-000000000001";
const otherUserId="00000000-0000-4000-8000-000000000099";
const jobId="00000000-0000-4000-8000-000000000020";
const envelopeA3="00000000-0000-4000-8000-000000000101";
const envelopeProposedA3="00000000-0000-4000-8000-000000000102";
const envelopeA4="00000000-0000-4000-8000-000000000103";
const envelopeSelfA4="00000000-0000-4000-8000-000000000104";

const job={
  id:jobId,job_number:42,title:"Fixture governed execution",description:"Phase D browser fixture",
  priority:80,status:"READY",required_capabilities:["chat"],acceptance:{},created_at:"2026-09-27T08:00:00Z",
  updated_at:"2026-09-27T09:00:00Z",deadline:"2026-09-28T09:00:00Z"
};

function envelope(input:Record<string,unknown>){
  return {
    project_id:projectId,product_id:null,job_id:jobId,actor_type:"agent",actor_key:"agent:fixture",
    sponsor_user_id:userId,purpose:"job_execution",requested_autonomy:"A3",granted_autonomy:"A3",
    allowed_consequence_classes:["resource_execution"],allowed_operation_keys:["job_start"],
    permitted_capabilities:["chat"],allowed_target_types:["job"],allowed_target_references:[jobId],
    require_independent_approval:false,require_capability_lease:true,status:"active",version:1,
    proposed_by:otherUserId,effective_from:"2026-09-27T09:00:00Z",expires_at:"2099-09-27T11:00:00Z",
    created_at:"2026-09-27T08:50:00Z",...input
  };
}

function authorityWorkspace(role:"viewer"|"operator"|"admin"|"owner"){
  return {
    envelopes:[
      envelope({id:envelopeA3}),
      envelope({
        id:envelopeProposedA3,status:"proposed",actor_type:"workflow",actor_key:"workflow:fixture",
        granted_autonomy:null,proposed_by:otherUserId
      }),
      envelope({
        id:envelopeA4,status:"active",actor_type:"human",actor_key:"user:"+otherUserId,
        requested_autonomy:"A4",granted_autonomy:"A4",purpose:"production_review",
        allowed_consequence_classes:["production_change"],allowed_operation_keys:["promote_release"],
        allowed_target_types:["release"],allowed_target_references:["release-fixture"],
        require_independent_approval:true,require_capability_lease:false,proposed_by:otherUserId
      }),
      envelope({
        id:envelopeSelfA4,status:"proposed",actor_type:"human",actor_key:"user:"+userId,
        requested_autonomy:"A4",granted_autonomy:null,purpose:"production_review",
        allowed_consequence_classes:["production_change"],allowed_operation_keys:["promote_release"],
        require_independent_approval:true,require_capability_lease:false,proposed_by:userId
      })
    ],
    approvals:[{
      id:"00000000-0000-4000-8000-000000000150",project_id:projectId,authority_envelope_id:envelopeA4,
      approval_type:"independent",status:"approved",approver_user_id:userId,job_id:jobId,
      expires_at:"2099-09-27T10:30:00Z",created_at:"2026-09-27T09:01:00Z"
    }],
    leases:[
      {
        id:"00000000-0000-4000-8000-000000000201",project_id:projectId,authority_envelope_id:envelopeA3,
        job_id:jobId,actor_key:"agent:fixture",capability_key:"chat",allowed_operations:["job_start"],
        allowed_consequence_classes:["resource_execution"],allowed_target_types:["job"],allowed_target_references:[jobId],
        status:"active",max_operations:5,consumed_operation_count:2,expires_at:"2099-09-27T10:30:00Z",
        issued_by:userId,issued_at:"2026-09-27T09:05:00Z"
      },
      {
        id:"00000000-0000-4000-8000-000000000202",project_id:projectId,authority_envelope_id:envelopeA3,
        job_id:jobId,actor_key:"agent:fixture",capability_key:"external_ai:fixture",allowed_operations:["external_provider_call"],
        allowed_consequence_classes:["resource_execution"],allowed_target_types:["provider"],allowed_target_references:["fixture"],
        status:"expired",max_operations:1,consumed_operation_count:0,expires_at:"2026-09-27T09:30:00Z",
        issued_by:userId,issued_at:"2026-09-27T09:05:00Z"
      }
    ],
    circuit_breakers:[
      {id:"00000000-0000-4000-8000-000000000301",project_id:projectId,category:"resource_execution",state:"paused",reason:"Fixture emergency pause.",updated_by:userId,updated_at:"2026-09-27T09:20:00Z"},
      {id:"00000000-0000-4000-8000-000000000302",project_id:projectId,category:"autonomous_writes",state:"enabled",reason:"Reviewed.",updated_by:userId,updated_at:"2026-09-27T09:20:00Z"},
      {id:"00000000-0000-4000-8000-000000000303",project_id:projectId,category:"external_communications",state:"enabled",reason:"Reviewed.",updated_by:userId,updated_at:"2026-09-27T09:20:00Z"},
      {id:"00000000-0000-4000-8000-000000000304",project_id:projectId,category:"deployments",state:"blocked",reason:"Production deployment blocked.",updated_by:userId,updated_at:"2026-09-27T09:20:00Z"}
    ],
    route_modes:{external_ai_provider:"report_only",job_start:"enforced"},
    decisions:[{
      id:"00000000-0000-4000-8000-000000000401",project_id:projectId,job_id:jobId,
      route_key:"job_start",requested_operation:"job_start",outcome:"paused",reason_code:"breaker_paused",
      enforcement_mode:"enforced",created_at:"2026-09-27T09:25:00Z"
    }],
    jobs:[job],
    caller_role:role,
    can_propose:role!=="viewer",
    can_approve:role==="owner"||role==="admin",
    can_control:role==="owner"||role==="admin",
    boundaries:{
      capacity_reservation_is_authorization:false,
      legacy_v1_is_canonical_authority:false,
      phase_c_remains_independent:true,
      a4_requires_exact_action_approval:true
    }
  };
}

function governanceWorkspace(){
  return {
    ratified_protocol:null,draft_protocols:[],proposals:[],decisions:[],disputes:[],
    can_manage:true,can_vote:true,member_role:"owner",
    boundaries:{formal_vote_basis:"one_active_project_member_one_vote"}
  };
}

async function setup(page:Page,role:"viewer"|"operator"|"admin"|"owner"){
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
    const pathname=new URL(route.request().url()).pathname;
    let body:unknown=[];
    const headers:Record<string,string>={"content-type":"application/json"};

    if(pathname.endsWith("/projects"))body={id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    else if(pathname.endsWith("/project_members"))body={project_id:projectId,user_id:userId,role,status:"active"};
    else if(pathname.endsWith("/tool_registry"))body=[];
    else if(pathname.endsWith("/capabilities"))body=[{
      id:"00000000-0000-4000-8000-000000000030",account_key:"fixture-runtime",connector_kind:"fixture",
      capability:"chat",state:"AVAILABLE",enabled:true,observed_at:"2026-09-27T10:00:00Z",
      next_check_at:null,confidence:1,concurrency_limit:2,running:0,metadata:{}
    }];
    else if(pathname.endsWith("/jobs")){
      body=[job]; headers["content-range"]="0-0/1";
    }
    else if(pathname.endsWith("/rpc/get_project_dashboard_summary"))body={total_jobs:1,active_jobs:1,running_jobs:0,blocked_jobs:0,available_capabilities:1,registered_capabilities:1};
    else if(pathname.endsWith("/rpc/get_authority_execution_workspace_v1"))body=authorityWorkspace(role);
    else if(pathname.endsWith("/rpc/get_job_execution_authority_summary_v1"))body={
      [jobId]:{
        route_mode:"enforced",envelope_id:envelopeA3,envelope_status:"active",
        lease_states:{chat:"active"},breaker_state:"paused",
        decision_outcome:"paused",decision_reason_code:"breaker_paused",readiness:"paused"
      }
    };
    else if(pathname.endsWith("/rpc/get_governance_workspace_v1"))body=governanceWorkspace();
    else if(pathname.includes("/accept_pending_project_member_invites_v1")||pathname.includes("/accept_pending_job_invites"))body=null;
    else if(pathname.includes("/rpc/"))body="00000000-0000-4000-8000-000000000999";

    return route.fulfill({headers,body:JSON.stringify(body)});
  });
}

test("TranScheduler keeps Gantt default and shows readiness without equating AVAILABLE with authority",async({page})=>{
  await setup(page,"operator");
  await page.goto(appPath+"?view=scheduler");

  await expect(page.getByRole("button",{name:"Gantt chart",exact:true})).toHaveAttribute("aria-pressed","true");
  const authorityButton=page.getByRole("button",{name:"Authority & Execution",exact:true});
  await expect(authorityButton).toBeVisible();
  await authorityButton.click();
  await expect(page.getByRole("heading",{name:"Governed execution sequence",exact:true})).toBeVisible();
  await expect(page.getByText("Intent → Plan → Dependencies → Authorization → Execution → Live status → Evidence",{exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Queue",exact:true}).click();
  await expect(page.getByText("Paused by policy",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Pause",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Cancel",exact:true})).toBeVisible();
  await expect(page.getByText("Authorized",{exact:true})).toHaveCount(0);
});

test("Governance deep-links to the shared Authority and Execution surface",async({page})=>{
  await setup(page,"owner");
  await page.goto(appPath+"?view=governance&section=authority");

  await expect(page.getByRole("tab",{name:"Authority & Execution",exact:true})).toHaveAttribute("aria-selected","true");
  await expect(page.getByText("Capacity reservation ≠ authorization lease.",{exact:false})).toBeVisible();
  await expect(page.getByText("AVAILABLE does not mean authorized.",{exact:false})).toBeVisible();
});

test("viewer can inspect canonical Phase D state without mutation controls",async({page})=>{
  await setup(page,"viewer");
  await page.goto(appPath+"?view=scheduler");
  await page.getByRole("button",{name:"Authority & Execution",exact:true}).click();

  await expect(page.getByText("Fixture emergency pause.",{exact:true})).toBeVisible();
  await expect(page.getByText("Report only",{exact:true}).first()).toBeVisible();
  await expect(page.getByText(/expired leases are non-authorizing/i)).toBeVisible();
  await expect(page.locator("summary").filter({hasText:"Propose Authority Envelope"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Approve",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Enforced",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Blocked",exact:true})).toHaveCount(0);
});

test("operator can propose A0-A3 but cannot approve control routes breakers or issue leases",async({page})=>{
  await setup(page,"operator");
  await page.goto(appPath+"?view=scheduler");
  await page.getByRole("button",{name:"Authority & Execution",exact:true}).click();

  const proposal=page.locator("details").filter({hasText:"Propose Authority Envelope"});
  await proposal.locator("summary").click();
  await expect(proposal.locator('option[value="A4"]')).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Approve",exact:true})).toHaveCount(0);
  await expect(page.locator("summary").filter({hasText:"Issue Capability Lease"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Enforced",exact:true})).toHaveCount(0);
});

test("owner sees independent review lease route breaker and exact-action controls",async({page})=>{
  await setup(page,"owner");
  await page.goto(appPath+"?view=scheduler");
  await page.getByRole("button",{name:"Authority & Execution",exact:true}).click();

  await expect(page.getByText("A3 · workflow:fixture",{exact:true})).toBeVisible();
  const proposedEnvelope=page.locator(".manifestCard").filter({hasText:"A3 · workflow:fixture"});
  const proposedGoverned=proposedEnvelope.locator(".platformGovernedAction");
  await expect(proposedGoverned).toHaveAttribute("data-governed-stage","review-required");
  await expect(proposedGoverned.getByText("Human / external review required",{exact:true})).toBeVisible();
  await expect(proposedGoverned.getByText("Authorized",{exact:true})).toHaveCount(0);

  const approvedA4=page.locator(".manifestCard").filter({hasText:"A4 · user:"+otherUserId});
  const approvedGoverned=approvedA4.locator(".platformGovernedAction");
  await expect(approvedGoverned).toHaveAttribute("data-governed-stage","authorized");
  await expect(approvedGoverned.getByText("REVIEWER",{exact:true})).toBeVisible();
  await expect(approvedGoverned.getByText(userId,{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Approve",exact:true}).first()).toBeVisible();
  await expect(page.getByText(/Independent review required: the proposer cannot approve/i)).toBeVisible();
  await expect(page.locator("summary").filter({hasText:"Issue Capability Lease · Owner / admin"})).toBeVisible();
  await expect(page.locator("summary").filter({hasText:"Exact-action approval · A4 human control"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Enforced",exact:true}).first()).toBeVisible();
  await expect(page.getByRole("button",{name:"Blocked",exact:true}).first()).toBeVisible();

  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("report-only route is explicitly observational rather than enforced authorization",async({page})=>{
  await setup(page,"owner");
  await page.goto(appPath+"?view=scheduler");
  await page.getByRole("button",{name:"Authority & Execution",exact:true}).click();

  const routeCard=page.locator(".manifestCard").filter({hasText:"External Ai Provider"});
  await expect(routeCard.locator(".badge").filter({hasText:/^Report only$/})).toBeVisible();
  await expect(routeCard.getByText(/records the decision but does not block/i)).toBeVisible();
});
