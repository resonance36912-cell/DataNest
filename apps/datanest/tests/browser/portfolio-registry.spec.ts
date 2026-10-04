import { expect, test, type Page } from "@playwright/test";

const appPath=process.env.DATANEST_APP_PATH||"/";
const projectId="00000000-0000-4000-8000-000000000010";
const userId="00000000-0000-4000-8000-000000000001";
const productId="24f2fa75-18b8-5b45-b624-b5dab381de9e";

const ids={
  ronsas:"00000000-0000-4000-8000-000000000101",
  sync:"00000000-0000-4000-8000-000000000102",
  shared:"00000000-0000-4000-8000-000000000103",
  external:"00000000-0000-4000-8000-000000000104",
  candidate:"00000000-0000-4000-8000-000000000105",
  deprecated:"00000000-0000-4000-8000-000000000106",
  retired:"00000000-0000-4000-8000-000000000107"
};

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

  const items=[
    {id:ids.ronsas,project_id:projectId,slug:"ronsas",name:"Resonance",item_kind:"governed_product",review_state:"classified",current_lifecycle:"maintained",linked_product_id:productId,source_authority:"products",source_reference:productId,metadata:{},active_classification_id:"c1",active_classification:"independent_datanest_product",target_product_id:null,target_product_slug:null,target_product_name:null,outgoing_relationship_count:2,incoming_relationship_count:0,product_lab_surface_count:0,product_lab_test_run_count:0},
    {id:ids.sync,project_id:projectId,slug:"sync-vision",name:"Sync Vision",item_kind:"application",review_state:"pending_review",current_lifecycle:null,linked_product_id:null,source_authority:"product_records",source_reference:"legacy-sync",metadata:{historical_catalog:{parent_product_id:productId,ownership_claim:"RONSAS"}},active_classification_id:null,active_classification:null,target_product_id:null,target_product_slug:null,target_product_name:null,outgoing_relationship_count:0,incoming_relationship_count:0,product_lab_surface_count:0,product_lab_test_run_count:0},
    {id:ids.shared,project_id:projectId,slug:"transcription",name:"Transcription Capability",item_kind:"capability",review_state:"classified",current_lifecycle:"active",linked_product_id:null,source_authority:"registry",source_reference:null,metadata:{},active_classification_id:"c3",active_classification:"shared_datanest_capability",target_product_id:null,target_product_slug:null,target_product_name:null,outgoing_relationship_count:0,incoming_relationship_count:1,product_lab_surface_count:0,product_lab_test_run_count:0},
    {id:ids.external,project_id:projectId,slug:"provider-x",name:"Provider X",item_kind:"external_capability",review_state:"classified",current_lifecycle:"active",linked_product_id:null,source_authority:"registry",source_reference:null,metadata:{},active_classification_id:"c4",active_classification:"registered_external_capability",target_product_id:null,target_product_slug:null,target_product_name:null,outgoing_relationship_count:0,incoming_relationship_count:1,product_lab_surface_count:0,product_lab_test_run_count:0},
    {id:ids.candidate,project_id:projectId,slug:"candidate-studio",name:"Candidate Studio",item_kind:"product_candidate",review_state:"classified",current_lifecycle:"candidate",linked_product_id:null,source_authority:"registry",source_reference:null,metadata:{},active_classification_id:"c5",active_classification:"independent_datanest_product",target_product_id:null,target_product_slug:null,target_product_name:null,outgoing_relationship_count:0,incoming_relationship_count:0,product_lab_surface_count:1,product_lab_test_run_count:2},
    {id:ids.deprecated,project_id:projectId,slug:"old-tool",name:"Old Tool",item_kind:"application",review_state:"deprecated",current_lifecycle:"deprecated",linked_product_id:null,source_authority:"registry",source_reference:null,metadata:{},active_classification_id:"c6",active_classification:"shared_datanest_capability",target_product_id:null,target_product_slug:null,target_product_name:null,outgoing_relationship_count:0,incoming_relationship_count:0,product_lab_surface_count:0,product_lab_test_run_count:0},
    {id:ids.retired,project_id:projectId,slug:"retired-tool",name:"Retired Tool",item_kind:"application",review_state:"retired",current_lifecycle:"retired",linked_product_id:null,source_authority:"registry",source_reference:null,metadata:{},active_classification_id:"c7",active_classification:"shared_datanest_capability",target_product_id:null,target_product_slug:null,target_product_name:null,outgoing_relationship_count:0,incoming_relationship_count:0,product_lab_surface_count:0,product_lab_test_run_count:0}
  ];

  await page.route("https://fixture.supabase.co/**",route=>{
    const request=route.request();
    const path=new URL(request.url()).pathname;
    let body:unknown=[];
    if(path.endsWith("/projects"))body={id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    if(path.endsWith("/project_members"))body={project_id:projectId,user_id:userId,role,status:"active"};
    if(path.endsWith("/products"))body=[{id:productId,slug:"ronsas",name:"RONSAS",full_name:"Resonance Application Suite",category:"sovereign application suite",lifecycle_status:"active",mission:"Governed suite.",operating_model:"governed",primary_runtime:"Windows local environment",commercial_mode:"free promotion / no billing until pricing is established",billing_enabled:false,as_of_date:"2026-09-26",metadata:{parent_platform:"Resonance DataNest",execution_authority:"DataNest"}}];
    if(path.endsWith("/product_records"))body=[];
    if(path.endsWith("/portfolio_registry_view"))body=items;
    if(path.endsWith("/portfolio_classifications"))body=[
      {id:"p-class",portfolio_item_id:ids.sync,classification:"product_owned",target_product_id:productId,status:"proposed",rationale:"Review historical placement.",evidence_reference:"fixture",created_at:"2026-09-27T00:00:00Z"}
    ];
    if(path.endsWith("/portfolio_relationships"))body=[
      {id:"r1",source_item_id:ids.ronsas,target_item_id:ids.shared,relationship_type:"uses",criticality:"normal",status:"active",rationale:null,evidence_reference:null,created_at:"2026-09-27T00:00:00Z"},
      {id:"r2",source_item_id:ids.ronsas,target_item_id:ids.external,relationship_type:"integrates_with",criticality:"normal",status:"active",rationale:null,evidence_reference:null,created_at:"2026-09-27T00:00:00Z"}
    ];
    if(path.endsWith("/portfolio_lifecycle_events"))body=[
      {id:"life-proposed",portfolio_item_id:ids.sync,from_state:null,to_state:"active",status:"proposed",reason:"Review activation.",evidence_reference:"fixture",created_at:"2026-09-27T00:00:00Z"}
    ];
    if(path.endsWith("/product_surfaces"))body=[
      {id:"surface-production",portfolio_item_id:ids.candidate,name:"Candidate production pilot",environment:"production",status:"active",build_commit:"abc123",release_id:"pilot-1"}
    ];
    if(path.endsWith("/get_project_dashboard_summary"))body={total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if(path.includes("/rpc/")){
      if(path.endsWith("/retire_portfolio_item_v1")){
        const payload=request.postDataJSON() as {target_item?:string};
        const message=payload?.target_item===ids.shared
          ?"Portfolio item has active critical dependants."
          :"Portfolio item has an active linked production surface.";
        return route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({message})});
      }
      return route.fulfill({contentType:"application/json",body:JSON.stringify("00000000-0000-4000-8000-000000000999")});
    }
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });
}

test("Portfolio Registry preserves pending ownership, composition, and product compatibility",async({page})=>{
  await setup(page,"viewer");
  await page.goto(appPath+"?view=products&section=portfolio&item=sync-vision");
  await expect(page.getByText("PENDING REVIEW",{exact:true})).toBeVisible();
  await expect(page.getByText("Architectural ownership has not yet been approved.",{exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Sync Vision",exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Governed Products",exact:true}).click();
  await expect(page.locator(".catalogProduct .catalogFullName")).toHaveText("Resonance Application Suite");
  await expect(page.getByText("FREE PROMOTION · BILLING OFF",{exact:true} )).toBeVisible();
  await expect(page.locator(".catalogProduct .productStatus")).toHaveText("MAINTAINED");
  await page.getByRole("button",{name:"Review governed detail",exact:true}).click();
  await expect(page.locator(".resonancePortfolioDetails")).toContainText("maintained");
  await expect(page.getByRole("region",{name:"Resonance Product Structure"})).toContainText("Transcription Capability");
  await expect(page.getByRole("region",{name:"Resonance Product Structure"})).toContainText("Provider X");
  await expect(page.getByRole("region",{name:"Resonance Product Structure"})).toContainText("Resonance Media Sync");

  await page.getByRole("button",{name:"Portfolio Registry",exact:true}).click();
  await page.getByRole("button",{name:/Candidate Studio/}).click();
  await expect(page.getByText("Candidate",{exact:true}).first()).toBeVisible();
  await expect(page.getByText(/production/i).first()).toBeVisible();

  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("Portfolio Registry role controls remain governed",async({page})=>{
  await setup(page,"operator");
  await page.goto(appPath+"?view=products&section=portfolio&item=sync-vision");
  await expect(page.getByRole("button",{name:"Create Portfolio Item"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Propose classification"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Approve classification"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Promote candidate"})).toHaveCount(0);
});

test("Owner approvals and retirement failures preserve displayed lifecycle",async({page})=>{
  await setup(page,"owner");
  await page.goto(appPath+"?view=products&section=portfolio&item=candidate-studio");
  await expect(page.getByRole("button",{name:"Create Portfolio Item"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Promote candidate"})).toBeVisible();

  await page.getByRole("button",{name:/Sync Vision/}).click();
  await expect(page.getByRole("button",{name:"Approve classification"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Approve lifecycle"})).toBeVisible();

  await page.getByRole("button",{name:/Candidate Studio/}).click();
  await page.getByLabel("Lifecycle reason").fill("Retirement guard fixture");
  await page.getByRole("button",{name:"Retire",exact:true}).click();
  await expect(page.locator(".catalogError").filter({hasText:"active linked production surface"})).toBeVisible();
  await expect(page.getByText("Candidate",{exact:true}).first()).toBeVisible();

  await page.getByRole("button",{name:/Transcription Capability/}).click();
  await page.getByLabel("Lifecycle reason").fill("Critical dependency guard fixture");
  await page.getByRole("button",{name:"Retire",exact:true}).click();
  await expect(page.locator(".catalogError[role=\"alert\"]")).toContainText("active critical dependants");
  await expect(page.getByText("Active",{exact:true}).first()).toBeVisible();
});
