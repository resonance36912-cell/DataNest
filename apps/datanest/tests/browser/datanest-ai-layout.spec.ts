import { expect, test } from "@playwright/test";
import { setupUiGovernanceFixture } from "./ui-governance-fixture";

const appPath = process.env.DATANEST_APP_PATH || "/";

test("DataNest AI keeps the animated hero and a compact command-first workspace", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const otherUserId = "00000000-0000-4000-8000-000000000002";
  const job = {
    id:"00000000-0000-4000-8000-000000000099",
    job_number:99,
    title:"AI Hero Layout Fixture",
    description:"Fixture Job used to protect the DataNest AI Hero-to-Command-Console layout.",
    priority:80,
    status:"RUNNING",
    required_capabilities:["chat"],
    acceptance:{},
    created_at:"2026-09-26T00:15:00Z",
    updated_at:"2026-09-26T00:20:00Z"
  };
  const secondJob = {
    ...job,
    id:"00000000-0000-4000-8000-000000000100",
    job_number:100,
    title:"Second AI Job Fixture",
    description:"Second fixture Job used to verify command drafts never leak across governed Job context.",
    priority:60,
    status:"READY",
    updated_at:"2026-09-26T00:10:00Z"
  };
  const contextRequests:Array<{action?:string;jobId?:string;sessionId?:string|null}>=[];

  await page.setViewportSize({width:1440,height:1000});
  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));

  await page.addInitScript(({userId}) => {
    const encode = (data:unknown) => btoa(JSON.stringify(data)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    const activeUserId=localStorage.getItem("fixture-user-override")||userId;
    localStorage.setItem("sb-fixture-auth-token",JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:activeUserId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture",
      token_type:"bearer",
      expires_at:4102444800,
      user:{id:activeUserId,aud:"authenticated",role:"authenticated",email:activeUserId===userId?"fixture@example.invalid":"second@example.invalid"}
    }));
  },{userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const path=new URL(route.request().url()).pathname;
    let body:unknown=[];

    if(path.endsWith("/projects")) body={id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-25T00:00:00Z"};
    else if(path.endsWith("/project_members")) body={project_id:projectId,user_id:userId,role:"owner",status:"active"};
    else if(path.endsWith("/tool_registry")) body=[];
    else if(path.endsWith("/capabilities")) body=[];
    else if(path.endsWith("/get_project_dashboard_summary")) body={total_jobs:2,active_jobs:2,running_jobs:1,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    else if(path.endsWith("/jobs")) body=[job,secondJob];
    else if(path.endsWith("/datanest-ai-chat")){
      const requestBody=route.request().postDataJSON() as {action?:string;jobId?:string;sessionId?:string|null}|null;
      if(requestBody?.action==="context")contextRequests.push({...requestBody});
      const activeJob=requestBody?.jobId===secondJob.id?secondJob:job;
      body={
        sessionId:activeJob.id===secondJob.id?"fixture-session-002":"fixture-session-001",
        job:activeJob,
        events:[],
        certifiedMemory:[]
      };
    }
    else if(path.endsWith("/datanest-ai-certification")) body={
      role:"owner",
      candidates:[],
      validationRuns:[]
    };
    else if(path.includes("/accept_pending_project_member_invites_v1")||path.includes("/accept_pending_job_invites")) body=null;

    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  const core=page.locator(".aiReactor");
  await page.goto(appPath);
  await expect(page.getByRole("heading",{name:"Find your next meaningful step."})).toBeVisible({timeout:20000});
  await page.goto(appPath+"?view=ai");
  await expect(core).toHaveAttribute("data-core-state","ready",{timeout:20000});
  await expect(page.getByRole("heading",{name:"DataNest AI",exact:true}).first()).toBeVisible({timeout:20000});
  await expect(page.getByRole("heading",{name:"DEVELOPMENT COMMAND CHANNEL",exact:true})).toBeVisible();
  await expect(page.locator(".aiReactor")).toHaveAttribute("data-core-state","ready");
  const objectiveHeader=page.getByRole("region",{name:"DataNest AI objective"});
  await expect(objectiveHeader).toBeVisible();
  await expect(objectiveHeader.getByRole("heading",{name:"Governed AI workspace",exact:true})).toBeVisible();
  await expect(objectiveHeader.getByText("JOB-00099 · AI Hero Layout Fixture",{exact:true})).toBeVisible();
  await expect(objectiveHeader.getByRole("button",{name:"Open command composer",exact:true})).toBeEnabled();
  await expect(page.locator(".datanestAiHeroV2")).toBeVisible();
  await expect(page.getByText("Hosted CI · Cloud browser",{exact:true})).toBeVisible();
  await expect(page.getByText("Current objective",{exact:true})).toBeVisible();
  await expect(page.getByLabel("Active Job context",{exact:true})).toBeVisible();
  await expect(page.getByText(/Remote desktop/i)).toHaveCount(0);
  await expect(page.getByText("Job details",{exact:true})).toBeVisible();
  await expect(page.getByText("Memory & governance",{exact:true})).toBeVisible();
  await expect(page.getByText("JOB-00099 · AI Hero Layout Fixture",{exact:true}).first()).toBeVisible();

  for(const label of ["Continue","Analyze","Build","Debug","Plan","Compare"]){
    await expect(page.getByRole("button",{name:label,exact:true})).toBeVisible();
  }

  const composer=page.getByPlaceholder(/Ask DataNest AI to analyze/i);
  await page.getByRole("button",{name:"Jump to DataNest AI command composer",exact:true}).click();
  await expect(composer).toBeFocused();
  expect(await page.locator(".datanestAiComposer").evaluate(element=>getComputedStyle(element).position)).toBe("sticky");

  const focusModeButton=page.getByRole("button",{name:"Focus mode",exact:true});
  await expect(focusModeButton).toBeVisible();
  await focusModeButton.click();
  await expect(page.locator(".datanestAiHeroV2")).toHaveCount(0);
  await expect(composer).toBeFocused();
  await expect(page.getByRole("button",{name:"Show AI core",exact:true})).toHaveAttribute("aria-pressed","true");
  expect(await page.evaluate(()=>localStorage.getItem("datanest-ai:focus-mode:v1"))).toBe("true");
  await page.getByRole("button",{name:"Show AI core",exact:true}).click();
  await expect(page.locator(".datanestAiHeroV2")).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem("datanest-ai:focus-mode:v1"))).toBe("false");

  await composer.fill("First Job draft must stay with JOB-00099.");
  await expect(page.getByText("SESSION-ONLY DRAFT · LOCKED TO JOB-00099",{exact:true})).toBeVisible();
  await expect(page.getByLabel("DataNest AI command context locked to JOB-00099")).toBeVisible();

  await page.reload();
  await expect(core).toHaveAttribute("data-core-state","ready",{timeout:20000});
  await expect(page.getByText("JOB-00099 · AI Hero Layout Fixture",{exact:true}).first()).toBeVisible({timeout:20000});
  await expect(composer).toHaveValue("First Job draft must stay with JOB-00099.");
  await expect(page.getByText("SESSION-ONLY DRAFT · LOCKED TO JOB-00099",{exact:true})).toBeVisible();

  expect(await page.evaluate(({projectId,userId,jobId})=>
    sessionStorage.getItem("datanest-ai:session-draft:"+projectId+":"+userId+":"+jobId),
    {projectId,userId,jobId:job.id}
  )).toBe("First Job draft must stay with JOB-00099.");
  expect(await page.evaluate(({jobId})=>
    sessionStorage.getItem("datanest-ai:session-draft:"+jobId),
    {jobId:job.id}
  )).toBeNull();

  await page.evaluate(otherUserId=>localStorage.setItem("fixture-user-override",otherUserId),otherUserId);
  await page.reload();
  await expect(page.getByText("JOB-00099 · AI Hero Layout Fixture",{exact:true}).first()).toBeVisible();
  await expect(composer).toHaveValue("");
  await expect(page.getByText("SESSION-ONLY DRAFT · LOCKED TO JOB-00099",{exact:true})).toBeHidden();

  await composer.fill("Second user draft must remain isolated.");
  await expect(page.getByText("SESSION-ONLY DRAFT · LOCKED TO JOB-00099",{exact:true})).toBeVisible();

  await page.evaluate(()=>localStorage.removeItem("fixture-user-override"));
  await page.reload();
  await expect(page.getByText("JOB-00099 · AI Hero Layout Fixture",{exact:true}).first()).toBeVisible();
  await expect(composer).toHaveValue("First Job draft must stay with JOB-00099.");

  contextRequests.length=0;
  await page.getByLabel("Active Job context",{exact:true}).selectOption(secondJob.id);
  await expect(page.getByText("JOB-00100 · Second AI Job Fixture",{exact:true}).first()).toBeVisible();
  await expect(composer).toHaveValue("");
  await expect.poll(()=>contextRequests.filter(item=>item.jobId===secondJob.id).length).toBeGreaterThan(0);
  const secondJobContextRequests=contextRequests.filter(item=>item.jobId===secondJob.id);
  expect(secondJobContextRequests[0]?.sessionId??null).toBeNull();
  expect(secondJobContextRequests.some(item=>item.sessionId==="fixture-session-001")).toBe(false);

  await composer.fill("Second Job draft must stay with JOB-00100.");
  await expect(page.getByText("SESSION-ONLY DRAFT · LOCKED TO JOB-00100",{exact:true})).toBeVisible();
  await expect(page.getByLabel("DataNest AI command context locked to JOB-00100")).toBeVisible();
  contextRequests.length=0;
  await page.getByLabel("Active Job context",{exact:true}).selectOption(job.id);
  await expect(page.getByText("JOB-00099 · AI Hero Layout Fixture",{exact:true}).first()).toBeVisible();
  await expect(composer).toHaveValue("First Job draft must stay with JOB-00099.");
  await expect.poll(()=>contextRequests.filter(item=>item.jobId===job.id).length).toBeGreaterThan(0);
  const firstJobReturnRequests=contextRequests.filter(item=>item.jobId===job.id);
  expect(firstJobReturnRequests[0]?.sessionId).toBe("fixture-session-001");
  expect(firstJobReturnRequests.some(item=>item.sessionId==="fixture-session-002")).toBe(false);

  await page.getByLabel("Active Job context",{exact:true}).selectOption(secondJob.id);
  await expect(composer).toHaveValue("Second Job draft must stay with JOB-00100.");
  await page.getByLabel("Active Job context",{exact:true}).selectOption(job.id);
  await expect(composer).toHaveValue("First Job draft must stay with JOB-00099.");
  await page.getByRole("button",{name:"Clear draft",exact:true}).click();
  await expect(composer).toHaveValue("");
  await expect(page.getByText("SESSION-ONLY DRAFT · LOCKED TO JOB-00099",{exact:true})).toBeHidden();

  await page.reload();
  await expect(page.getByText("JOB-00099 · AI Hero Layout Fixture",{exact:true}).first()).toBeVisible();
  await expect(composer).toHaveValue("");
  await expect(page.getByText("SESSION-ONLY DRAFT · LOCKED TO JOB-00099",{exact:true})).toBeHidden();

  const layout=await page.evaluate(()=>{
    const rect=(selector:string)=>{
      const element=document.querySelector(selector);
      if(!(element instanceof HTMLElement))throw new Error("Missing "+selector);
      const box=element.getBoundingClientRect();
      return {x:box.x,y:box.y,width:box.width,height:box.height,right:box.right,bottom:box.bottom,center:box.x+box.width/2};
    };
    return {
      workspace:rect(".datanestAiWorkspace"),
      pageHeader:rect('[aria-label="DataNest AI objective"]'),
      hero:rect(".datanestAiHeroV2"),
      chat:rect(".datanestAiChatStage"),
      objective:rect(".datanestAiCommandSummaryCompact"),
      details:rect(".datanestAiContextDetails"),
      advanced:rect(".datanestAiAdvancedDisclosure"),
      scrollWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth
    };
  });

  expect(layout.pageHeader.y).toBeLessThanOrEqual(layout.hero.y);
  expect(layout.chat.y).toBeGreaterThanOrEqual(layout.hero.bottom-2);
  expect(layout.objective.y).toBeGreaterThanOrEqual(layout.chat.bottom-2);
  expect(layout.details.y).toBeGreaterThanOrEqual(layout.objective.bottom-2);
  expect(layout.advanced.y).toBeGreaterThanOrEqual(layout.details.bottom-2);
  await expect(page.locator(".datanestAiContextDetails")).not.toHaveAttribute("open","");
  await expect(page.locator(".datanestAiAdvancedDisclosure")).not.toHaveAttribute("open","");
  expect(layout.chat.width).toBeLessThanOrEqual(1042);
  expect(Math.abs(layout.chat.center-layout.workspace.center)).toBeLessThanOrEqual(2);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);

  await page.setViewportSize({width:390,height:844});
  await expect(page.locator(".datanestAiCommandConsole")).toBeVisible();
  expect(await page.locator(".datanestAiComposer").evaluate(element=>getComputedStyle(element).position)).toBe("static");

  const mobile=await page.evaluate(()=>{
    const consoleElement=document.querySelector(".datanestAiCommandConsole");
    if(!(consoleElement instanceof HTMLElement))throw new Error("Missing DataNest AI Command Console");
    return {
      consoleWidth:consoleElement.getBoundingClientRect().width,
      scrollWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth
    };
  });

  expect(mobile.consoleWidth).toBeLessThanOrEqual(mobile.viewportWidth);
  expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.viewportWidth);
});

test("AI instrument respects motion preference, offscreen pause, and saved Focus mode", async ({page})=>{
  await setupUiGovernanceFixture(page);
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto(appPath+"?view=ai");
  const core=page.locator(".aiReactor");
  const ring=page.locator(".aiReactorOuter");
  const composer=page.getByPlaceholder(/Ask DataNest AI to analyze/i);
  await expect(core).toHaveAttribute("data-core-state","ready");
  await core.scrollIntoViewIfNeeded();
  await expect(core).toHaveAttribute("data-in-view","true");
  await expect(ring).toHaveCSS("animation-play-state","running");
  await page.locator(".datanestAiAdvancedDisclosure").scrollIntoViewIfNeeded();
  await expect(core).toHaveAttribute("data-in-view","false");
  await expect(ring).toHaveCSS("animation-play-state","paused");

  await page.locator(".workspaceOptions > summary").click();
  const motionControl = page.getByLabel("Motion preference", {exact:true});
  await motionControl.selectOption("reduced");
  await expect(motionControl).toHaveValue("reduced");
  await expect(page.locator("html")).toHaveAttribute("data-motion-paused", "true");
  await expect(ring).toHaveCSS("animation-name","none");
  await page.reload();
  await expect(page.getByLabel("Motion preference", {exact:true})).toHaveValue("reduced");
  await expect(page.locator("html")).toHaveAttribute("data-motion-paused", "true");
  await expect(ring).toHaveCSS("animation-name","none");
  await page.locator(".workspaceOptions > summary").click();
  await page.getByLabel("Motion preference", {exact:true}).selectOption("full");
  await composer.fill("Keep my command while the AI core is hidden.");
  await page.getByRole("button",{name:"Focus mode",exact:true}).click();
  await expect(core).toHaveCount(0);
  await expect(composer).toBeFocused();
  await page.reload();
  await expect(core).toHaveCount(0);
  await expect(composer).toHaveValue("Keep my command while the AI core is hidden.");
  await page.getByRole("button",{name:"Show AI core",exact:true}).click();
  await expect(core).toHaveAttribute("data-core-state","ready");
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect(ring).toHaveCSS("animation-name","none");
});

test("AI dial and readouts fit narrow screens in both themes", async ({page},testInfo)=>{
  await setupUiGovernanceFixture(page);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(appPath+"?view=ai");
  await page.locator(".workspaceOptions > summary").click();
  const themeControl=page.locator(".workspaceOptions").getByLabel("Theme preference",{exact:true});
  await expect(themeControl).toBeVisible();
  for(const theme of ["dark","light"]){
    await themeControl.selectOption(theme);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:1000});
      await expect(page.locator(".aiReactor")).toHaveAttribute("data-core-state","ready");
      const layout=await page.locator(".aiReactor").evaluate(node=>{
        const box=node.getBoundingClientRect();
        return {left:box.left,right:box.right,overflow:document.documentElement.scrollWidth-innerWidth,width:innerWidth};
      });
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(layout.width);
      expect(layout.overflow).toBeLessThanOrEqual(0);
      await expect(page.getByPlaceholder(/Ask DataNest AI to analyze/i)).toBeEnabled();
      if(width===390||width===1440){
        await page.locator(".datanestAiHeroV2").screenshot({path:testInfo.outputPath(`ai-core-${theme}-${width}.png`)});
      }
    }
  }
});

test("AI error state stops the instrument and preserves the retry path", async ({page})=>{
  await setupUiGovernanceFixture(page);
  await page.emulateMedia({reducedMotion:"no-preference"});
  const contextRoute="**/functions/v1/datanest-ai-chat";
  await page.route(contextRoute,route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Fixture context unavailable"})}));
  await page.goto(appPath+"?view=ai");
  await expect(page.locator(".aiReactor")).toHaveAttribute("data-core-state","attention");
  await expect(page.locator(".aiReactorOuter")).toHaveCSS("animation-play-state","paused");
  await expect(page.getByRole("button",{name:"Send command",exact:true})).toBeDisabled();
  await page.getByPlaceholder(/Ask DataNest AI to analyze/i).fill("Preserve this draft while context recovers.");
  await page.unroute(contextRoute);
  await page.getByRole("button",{name:"Retry AI context",exact:true}).click();
  await expect(page.locator(".aiReactor")).toHaveAttribute("data-core-state","ready");
  await expect(page.getByPlaceholder(/Ask DataNest AI to analyze/i)).toHaveValue("Preserve this draft while context recovers.");
});
