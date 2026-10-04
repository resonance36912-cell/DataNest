import { expect, test } from "@playwright/test";

const appPath = process.env.DATANEST_APP_PATH || "/";

test("Products runs Legal Eagle through the governed DataNest AI route", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read","clipboard-write"]);
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const jobId = "00000000-0000-4000-8000-000000000020";
  let legalRequest:Record<string,unknown>={};

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));

  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token: "fixture",
      token_type: "bearer",
      expires_at: 4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const request=route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown = [];

    if(path.endsWith("/functions/v1/ronsas-status")){
      return route.fulfill({contentType:"application/json",body:JSON.stringify({
        contract:"ronsas-status@1",checkedAt:"2026-09-28T08:30:00Z",mode:"cloud",runtimeMode:"local-first",managedByDataNest:true,
        billingState:"free-promotion",independent:false,localInteractionRequired:false,
        authority:{owner:"DataNest-Supository",controlRepository:"DataNest-Supository/DataNest",hubRepository:"DataNest-Supository/DataNest",publicHub:"https://reson8.life/"},
        hub:{ok:true,status:200,latencyMs:42,origin:"https://reson8.life/"},
        delivery:{
          canonicalName:"reson8.datanest.life",
          brandedUrl:"https://reson8.datanest.life/",
          brandedState:"wire-ready",
          wire:{source:"https://reson8.datanest.life/",target:"https://reson8.life/",mode:"redirect",applicationLayer:"ready",networkState:"dns-pending"},
          provider:"GitHub Pages",
          operationalUrl:"https://datanest-supository.github.io/DataNest/",
          publicDelivery:{ok:true,status:200,latencyMs:42,origin:"https://datanest-supository.github.io"},
          railwayRequired:false,
          hubRegistration:{ok:true,status:200,latencyMs:42,endpoint:"https://reson8.life/api/public/app-status/health",listed:false},
          backupHost:{provider:"Dropbox",path:"/DataNest-AI-Backups",role:"artifact-recovery",status:"active",servesApplication:false,localPcBackupHosting:false}
        }
      })});
    }

    if(path.endsWith("/functions/v1/datanest-ai-chat")){
      const requestBody=(request.postDataJSON()||{}) as Record<string,unknown>;
      if(requestBody.action==="chat"){
        legalRequest=requestBody;
        body={
          assistant:"ANGEL'S ADVOCATE\nThe chronology supports a clear sequence: notice on 12 September and reply on 18 September.\n\nDEVIL'S ADVOCATE\nThe legal significance of either date is not established by the chronology alone; delivery method, governing procedure and any response period still need verification.\n\nSYNTHESIS\nOrganize both dates as user-supplied facts, preserve the underlying notice and reply, and have a qualified South African lawyer verify any legal deadline or procedural consequence.",
          sessionId:"00000000-0000-4000-8000-000000000099",
          outputTraceId:"DN-AI-legal-fixture",
          providerMode:"external",
          providerLabel:"Fixture governed provider",
          productMode:"legal_eagle",
          jurisdiction:"South Africa · Gauteng",
          learningEligible:false
        };
      }else{
        body={
          sessionId:String(requestBody.sessionId||"00000000-0000-4000-8000-000000000099"),
          job:{id:jobId,project_id:projectId,job_number:7,title:"Legal matter",status:"READY"},
          events:[],
          certifiedMemory:[]
        };
      }
      return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
    }

    if (path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    if (path.endsWith("/products")) body = [{
      id:"24f2fa75-18b8-5b45-b624-b5dab381de9e",slug:"ronsas",name:"Resonance",full_name:"Resonance Application Suite",
      category:"sovereign application suite",lifecycle_status:"active development and integration",
      mission:"Unify the Resonance application estate under governed local-first operations.",operating_model:"governed",
      primary_runtime:"Windows local environment",commercial_mode:"free promotion / no billing until pricing is established",
      billing_enabled:false,as_of_date:"2026-09-26",metadata:{parent_platform:"Resonance DataNest",product_role:"governed_product",execution_authority:"DataNest",promotion_authority:"DataNest",hosting_model:"replaceable_delivery_infrastructure"}
    }];
    if (path.endsWith("/portfolio_registry_view")) body = [
      {id:"00000000-0000-4000-8000-000000000401",project_id:projectId,slug:"ronsas",name:"Resonance",item_kind:"governed_product",review_state:"classified",current_lifecycle:"active",linked_product_id:"24f2fa75-18b8-5b45-b624-b5dab381de9e",source_authority:"products",source_reference:"24f2fa75-18b8-5b45-b624-b5dab381de9e",metadata:{},active_classification_id:"00000000-0000-4000-8000-000000000501",active_classification:"product_owned",target_product_id:"24f2fa75-18b8-5b45-b624-b5dab381de9e",target_product_slug:"ronsas",target_product_name:"Resonance",outgoing_relationship_count:0,incoming_relationship_count:0,product_lab_surface_count:0,product_lab_test_run_count:0},
      {id:"00000000-0000-4000-8000-000000000402",project_id:projectId,slug:"sync-vision",name:"Sync Vision",item_kind:"application",review_state:"pending_review",current_lifecycle:null,linked_product_id:null,source_authority:"product_records",source_reference:"00000000-0000-4000-8000-000000000303",metadata:{historical_catalog:{parent_product_id:"24f2fa75-18b8-5b45-b624-b5dab381de9e"}},active_classification_id:null,active_classification:null,target_product_id:null,target_product_slug:null,target_product_name:null,outgoing_relationship_count:0,incoming_relationship_count:0,product_lab_surface_count:0,product_lab_test_run_count:0}
    ];
    if (path.endsWith("/portfolio_relationships")) body = [];
    if (path.endsWith("/product_records")) body = [
      {id:"00000000-0000-4000-8000-000000000301",product_id:"24f2fa75-18b8-5b45-b624-b5dab381de9e",record_type:"application",code:"APP-01",name:"RONSAS Hub",status:"active",sort_order:1,payload:{description:"Primary application hub"}},
      {id:"00000000-0000-4000-8000-000000000303",product_id:"24f2fa75-18b8-5b45-b624-b5dab381de9e",record_type:"application",code:"APP-02",name:"Sync Vision",status:"active/integration",sort_order:2,payload:{description:"Video/audio synchronization and generation workflow"}},
      {id:"00000000-0000-4000-8000-000000000302",product_id:"24f2fa75-18b8-5b45-b624-b5dab381de9e",record_type:"risk",code:"RSK-01",name:"Runner capacity",status:"open",sort_order:3,payload:{description:"Runner capacity requires governed monitoring."}}
    ];
    if (path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if (path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:1,active_jobs:1,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if (path.endsWith("/jobs")) body = [{id:jobId,job_number:7,title:"Legal matter",status:"READY",updated_at:"2026-09-26T06:00:00Z"}];

    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=products&product=ronsas&recordType=risk&q=runner");

  await expect(page.getByRole("region",{name:"Products workspace overview"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Product evidence"})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Products that carry their architecture, evidence and decisions with them."})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Live ecosystem state, derived from governed DataNest records."})).toBeVisible();
  await expect(page.getByRole("region",{name:"Products that carry their architecture, evidence and decisions with them."}).getByRole("heading",{name:"Resonance",exact:true})).toBeVisible();
  await expect(page.locator(".catalogProduct .catalogFullName")).toHaveText("Resonance Application Suite");
  await expect(page.locator(".catalogProduct").getByText("RESONANCE DATANEST",{exact:true})).toBeVisible();
  await expect(page.locator(".catalogProduct").getByText("DataNest",{exact:true})).toBeVisible();
  await expect(page.getByText("DATANEST MANAGED",{exact:true})).toBeVisible();
  await expect(page.getByText("Windows local environment",{exact:true})).toBeVisible();
  await expect(page.getByText("FREE PROMOTION · BILLING OFF",{exact:true})).toBeVisible();
  const navRonsasLaunch=page.getByRole("link",{name:"Open Resonance from DataNest navigation"});
  await expect(navRonsasLaunch).toBeVisible();
  await expect(navRonsasLaunch).toHaveAttribute("href","https://reson8.life/");
  await page.keyboard.press("Control+K");
  await page.getByRole("searchbox",{name:"Search DataNest workspaces"}).fill("Resonance");
  await expect(page.locator(".commandResult").filter({hasText:"Resonance"}).first()).toBeVisible();
  await page.keyboard.press("Escape");
  const ronsasLaunch=page.getByRole("link",{name:"Open Resonance",exact:true});
  await expect(ronsasLaunch).toBeVisible();
  await expect(ronsasLaunch).toHaveAttribute("href","https://reson8.life/");
  await expect(page.getByLabel("Filter governed record type")).toHaveValue("risk");
  await expect(page.getByLabel("Search governed product records")).toHaveValue("runner");
  await expect(page.locator("details.catalogDetails")).toHaveAttribute("open","");
  await expect(page.getByText("Runner capacity",{exact:true})).toBeVisible();
  await expect(page).toHaveURL(/product=ronsas/);
  await expect(page).toHaveURL(/recordType=risk/);
  await expect(page).toHaveURL(/q=runner/);

  await page.getByRole("button",{name:"Copy view link",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"View link copied."})).toBeVisible();
  await expect(page).toHaveURL(/product=ronsas/);
  await expect(page).toHaveURL(/recordType=risk/);
  await expect(page).toHaveURL(/q=runner/);

  await page.getByLabel("Search governed product records").fill("");
  await page.getByLabel("Filter governed record type").selectOption("all");
  await expect(page).toHaveURL(/product=ronsas/);

  const ronsasHubRecord=page.locator(".catalogRecord").filter({hasText:"RONSAS Hub"}).getByRole("link",{name:"Open Resonance"});
  await expect(ronsasHubRecord).toBeVisible();
  await expect(ronsasHubRecord).toHaveAttribute("href","https://reson8.life/");

  const syncVisionLaunch=page.locator(".catalogRecord").getByRole("link",{name:"Open Sync Vision in DataNest"});
  await expect(syncVisionLaunch).toBeVisible();
  await expect(syncVisionLaunch).toHaveAttribute("href",/\/apps\/syncvision\/$/);

  const compositionLaunch=page.getByLabel("Resonance Product Structure").getByRole("link",{name:"Open Resonance Media Sync in DataNest"}).first();
  await expect(compositionLaunch).toBeVisible();
  await expect(compositionLaunch).toHaveAttribute("href",/\/apps\/syncvision\/$/);

  await expect(page.getByRole("heading", {name:"Products that carry their architecture, evidence and decisions with them."})).toBeVisible();
  await expect(page.getByText("Resonance Assistance Product Experience", {exact:true})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Assistance with a human at the centre."})).toBeHidden();
  await page.locator("details.conceptIncubator > summary").click();

  await expect(page.getByRole("heading", {name:"Assistance with a human at the centre."})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Resonance Assistance"}).first()).toBeVisible();
  await expect(page.getByRole("heading", {name:"Legal Eagle", exact:true})).toBeVisible();
  await expect(page.getByText("Designed to assist—not represent.")).toBeVisible();
  await expect(page.getByText("INFORMATION · PREPARATION · HUMAN REVIEW")).toBeVisible();

  await expect(page.getByLabel("Legal Eagle matter")).toHaveValue(jobId);
  await page.getByLabel("Legal jurisdiction").fill("South Africa · Gauteng");
  await page.getByRole("button", {name:"Build a matter timeline"}).click();

  const message="On 12 September I received a notice. On 18 September I replied. Please organize these dates and flag what a lawyer should verify.";
  await page.getByLabel("Question, facts, clause or document excerpt").fill(message);
  await page.getByRole("button", {name:"Ask Legal Eagle"}).click();

  await expect(page.getByText(message,{exact:true})).toBeVisible();
  await expect(page.getByText("ANGEL'S ADVOCATE",{exact:true})).toBeVisible();
  await expect(page.getByText(/chronology supports a clear sequence/i)).toBeVisible();
  await expect(page.getByText("DEVIL'S ADVOCATE",{exact:true})).toBeVisible();
  await expect(page.getByText(/legal significance of either date is not established/i)).toBeVisible();
  await expect(page.getByText("SYNTHESIS",{exact:true})).toBeVisible();
  await expect(page.locator(".legalDualGrid")).toBeVisible();
  await expect(page.getByRole("status").filter({hasText:/excluded from automatic project-wide learning/i})).toBeVisible();

  expect(legalRequest?.productMode).toBe("legal_eagle");
  expect(legalRequest?.jurisdiction).toBe("South Africa · Gauteng");
  expect(legalRequest?.legalTask).toBe("timeline");
  expect(legalRequest?.jobId).toBe(jobId);

  await page.setViewportSize({width:390,height:844});
  const overflowOffenders=await page.evaluate(() => {
    const viewportWidth=innerWidth;
    const isClipped=(element:Element)=>{
      let parent=element.parentElement;
      while(parent&&parent!==document.body){
        const overflowX=getComputedStyle(parent).overflowX;
        if(overflowX==="hidden"||overflowX==="auto"||overflowX==="scroll"||overflowX==="clip")return true;
        parent=parent.parentElement;
      }
      return false;
    };
    const isInsideOffscreenFixedShell=(element:Element)=>{
      let current:Element|null=element;
      while(current&&current!==document.body){
        const style=getComputedStyle(current);
        if(style.position==="fixed"){
          const rect=current.getBoundingClientRect();
          if(rect.right<=0||rect.left>=viewportWidth)return true;
        }
        current=current.parentElement;
      }
      return false;
    };
    return Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map(element=>{
        const rect=element.getBoundingClientRect();
        return {
          element,
          tag:element.tagName.toLowerCase(),
          className:typeof element.className==="string" ? element.className : "",
          text:(element.textContent||"").trim().replace(/\s+/g," ").slice(0,120),
          left:Math.round(rect.left),
          right:Math.round(rect.right),
          width:Math.round(rect.width)
        };
      })
      .filter(item=>item.right>viewportWidth+1||item.left< -1)
      .filter(item=>!isClipped(item.element))
      .filter(item=>!isInsideOffscreenFixedShell(item.element))
      .map(({element,...item})=>item)
      .slice(0,12);
  });
  expect(
    overflowOffenders,
    "Mobile Products overflow offenders: "+JSON.stringify(overflowOffenders)
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
