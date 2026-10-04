import { expect, test, type Page } from "@playwright/test";

const appPath=process.env.DATANEST_APP_PATH||"/";
const projectId="00000000-0000-4000-8000-000000000010";
const userId="00000000-0000-4000-8000-000000000001";
const job={id:"00000000-0000-4000-8000-000000000099",job_number:99,title:"Recovery fixture",description:"Recovery test",priority:80,status:"READY",required_capabilities:["chat"],acceptance:{},created_at:"2026-09-26T00:15:00Z",updated_at:"2026-09-26T00:20:00Z"};
const secondJob={...job,id:"00000000-0000-4000-8000-000000000100",job_number:100,title:"Second fixture"};

async function setup(page:Page){
  const state={jobs:[job,secondJob],failJobs:false,failContext:false,delayChat:false,chatRequests:0,releaseChat:()=>{}};
  await page.route("**/runtime-config.js",route=>route.fulfill({contentType:"application/javascript",body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"}));
  await page.addInitScript(({userId})=>{
    const encode=(data:unknown)=>btoa(JSON.stringify(data)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    localStorage.setItem("sb-fixture-auth-token",JSON.stringify({access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,refresh_token:"fixture",token_type:"bearer",expires_at:4102444800,user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}}));
  },{userId});
  await page.route("https://fixture.supabase.co/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    let body:unknown=[];
    let status=200;
    if(path.endsWith("/projects"))body={id:projectId,slug:"resonance-datanest",name:"Fixture project",status:"ACTIVE",created_at:job.created_at};
    else if(path.endsWith("/project_members"))body={project_id:projectId,user_id:userId,role:"owner",status:"active"};
    else if(path.endsWith("/get_project_dashboard_summary"))body={total_jobs:state.jobs.length,active_jobs:state.jobs.length,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    else if(path.endsWith("/jobs")){
      // Only fail the AI workspace's ordered, 50-job list, not app startup.
      if(state.failJobs&&new URL(route.request().url()).searchParams.get("limit")==="50"){
        status=503;body={message:"Job list temporarily unavailable"};
      }else body=state.jobs;
    }else if(path.endsWith("/datanest-ai-chat")){
      const request=route.request().postDataJSON();
      if(request.action==="chat"){
        state.chatRequests++;
        if(state.delayChat)await new Promise<void>(resolve=>{state.releaseChat=resolve;});
        body={sessionId:"fixture-session",assistant:"Reply retained after a failed refresh.",outputTraceId:"trace-recovery",providerLabel:"Fixture"};
      }else if(state.failContext){status=503;body={message:"Context temporarily unavailable"};}
      else body={sessionId:"fixture-session",job:request.jobId===secondJob.id?secondJob:job,events:[],certifiedMemory:[]};
    }else if(path.endsWith("/datanest-ai-certification"))body={role:"owner",candidates:[],validationRuns:[]};
    else if(path.includes("/accept_pending_"))body=null;
    await route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  });
  return state;
}

test("empty Job list settles and offers a path to create work",async({page})=>{
  const state=await setup(page);state.jobs=[];
  await page.goto(appPath+"?view=ai");
  await expect(page.getByRole("heading",{name:"No accessible Job Manifests"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Open UNIFI Planner"})).toHaveAttribute("href","?view=unifi");
  state.jobs=[job];
  await page.getByRole("button",{name:"Retry loading jobs"}).click();
  await expect(page.getByText("CONTEXT READY",{exact:true}).first()).toBeVisible();
});

test("failed Job loading settles with a working retry",async({page})=>{
  const state=await setup(page);state.failJobs=true;
  await page.goto(appPath+"?view=ai");
  await expect(page.getByRole("heading",{name:"Unable to load Job Manifests"})).toBeVisible();
  state.failJobs=false;
  await page.getByRole("button",{name:"Retry loading jobs"}).click();
  await expect(page.getByRole("heading",{name:"Development command channel"})).toBeVisible();
});

test("failed context is honest, keeps the draft, and recovers",async({page})=>{
  const state=await setup(page);state.failContext=true;
  await page.goto(appPath+"?view=ai");
  await expect(page.getByRole("heading",{name:"Job context needs attention"})).toBeVisible();
  await expect(page.getByText("AI CORE LINKED",{exact:true})).toHaveCount(0);
  await expect(page.getByText("NEEDS ATTENTION",{exact:true}).first()).toBeVisible();
  const objectiveHeader=page.getByRole("region",{name:"DataNest AI objective"});
  await expect(objectiveHeader).toBeVisible();
  await expect(objectiveHeader.getByRole("button",{name:"Open command composer",exact:true})).toBeDisabled();

  const composer=page.getByPlaceholder(/Ask DataNest AI to analyze/i);
  await composer.fill("Preserve this draft while recovering.");
  await expect(page.getByRole("button",{name:"Send command",exact:true})).toBeDisabled();
  state.failContext=false;
  await page.getByRole("button",{name:"Retry AI context"}).click();
  await expect(page.getByRole("button",{name:"Send command",exact:true})).toBeDisabled();
  await expect(objectiveHeader.getByRole("button",{name:"Open command composer",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:/UI & UX/}).click();
  await expect(page.getByRole("button",{name:"Send command",exact:true})).toBeEnabled();
  await expect(composer).toHaveValue("Preserve this draft while recovering.");
  await page.getByLabel("Active Job context",{exact:true}).selectOption(secondJob.id);
  await expect(composer).toHaveValue("");
  await page.getByLabel("Active Job context",{exact:true}).selectOption(job.id);
  await expect(composer).toHaveValue("Preserve this draft while recovering.");
});

test("in-flight commands lock edits and retain a reply when refresh fails",async({page})=>{
  const state=await setup(page);state.delayChat=true;
  await page.goto(appPath+"?view=ai");
  const composer=page.getByPlaceholder(/Ask DataNest AI to analyze/i);
  await expect(page.getByText("AI CORE LINKED",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:/UI & UX/}).click();
  await composer.fill("Analyze the fixture Job.");
  await page.getByRole("button",{name:"Send command",exact:true}).click();
  await expect.poll(()=>state.chatRequests).toBe(1);
  await expect(composer).toHaveAttribute("readonly","");
  await expect(composer).toHaveValue("");
  await expect(page.getByRole("button",{name:"Clear draft",exact:true})).toHaveCount(0);
  await expect(page.getByRole("log",{name:"Job conversation"})).toContainText("Analyze the fixture Job.");
  await expect(page.getByRole("button",{name:"DataNest AI reasoning…"})).toBeDisabled();
  state.failContext=true;state.releaseChat();
  await expect(page.getByRole("heading",{name:"Job context needs attention"})).toBeVisible();
  await expect(page.getByText("Reply retained after a failed refresh.",{exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"DataNest AI is ready",exact:true})).toHaveCount(0);
  await expect(composer).not.toHaveAttribute("readonly","");
  await expect(page.getByRole("log",{name:"Job conversation"})).toContainText("UTC");
});

test("mobile Job selector and reduced-motion composer remain usable",async({page})=>{
  await setup(page);
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(appPath+"?view=ai");
  await expect(page.getByText("AI CORE LINKED",{exact:true})).toBeVisible();
  const selector=page.getByLabel("Active Job context",{exact:true});
  const composer=page.getByPlaceholder(/Ask DataNest AI to analyze/i);
  await expect(selector).toBeVisible();
  await expect(composer).toBeVisible();
  expect((await composer.boundingBox())!.y).toBeLessThan((await selector.boundingBox())!.y);
  await page.getByRole("button",{name:"Jump to DataNest AI command composer",exact:true}).click();
  await expect(composer).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
