import { expect, test } from "@playwright/test";

const appPath = process.env.DATANEST_APP_PATH || "/";

test("TranScheduler groups jobs under the project and renders the priority gradient", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const jobs = [
    {
      id:"00000000-0000-4000-8000-000000000101",job_number:101,title:"Critical release gate",description:null,
      priority:100,status:"READY",required_capabilities:["repository"],acceptance:{},
      created_at:"2026-09-25T09:00:00Z",updated_at:"2026-09-26T09:00:00Z",deadline:"2026-09-27T12:00:00Z"
    },
    {
      id:"00000000-0000-4000-8000-000000000102",job_number:102,title:"Active implementation",description:null,
      priority:50,status:"RUNNING",required_capabilities:["repository","database"],acceptance:{},
      created_at:"2026-09-25T12:00:00Z",updated_at:"2026-09-26T10:00:00Z",deadline:null
    },
    {
      id:"00000000-0000-4000-8000-000000000103",job_number:103,title:"Maintenance smoke check",description:null,
      priority:5,status:"COMPLETED",required_capabilities:["chat"],acceptance:{},
      created_at:"2026-09-24T08:00:00Z",updated_at:"2026-09-25T08:30:00Z",deadline:null
    }
  ];

  await page.clock.setFixedTime(new Date("2026-09-26T12:00:00Z"));
  await page.setViewportSize({width:1440,height:1000});
  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));

  await page.addInitScript(({userId}) => {
    const encode = (data:unknown) => btoa(JSON.stringify(data)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    localStorage.setItem("sb-fixture-auth-token",JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture",token_type:"bearer",expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  },{userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const path=new URL(route.request().url()).pathname;
    let body:unknown=[];
    if(path.endsWith("/projects")) body={id:projectId,slug:"fixture-project",name:"Fixture Project",description:null,status:"ACTIVE",created_at:"2026-09-24T00:00:00Z"};
    else if(path.endsWith("/project_members")) body={project_id:projectId,user_id:userId,role:"owner",status:"active"};
    else if(path.endsWith("/tool_registry")) body=[];
    else if(path.endsWith("/capabilities")) body=[{
      id:"00000000-0000-4000-8000-000000000201",account_key:"fixture",connector_kind:"github",capability:"repository",
      state:"AVAILABLE",observed_at:"2026-09-26T11:55:00Z",next_check_at:null,confidence:1,concurrency_limit:1,running:0,metadata:{}
    }];
    else if(path.endsWith("/get_project_dashboard_summary")) body={total_jobs:3,active_jobs:2,running_jobs:1,blocked_jobs:0,available_capabilities:1,registered_capabilities:1};
    else if(path.endsWith("/get_job_execution_authority_summary_v1")) body={
      "00000000-0000-4000-8000-000000000101":{route_mode:"enforced",envelope_id:null,envelope_status:null,lease_states:{repository:"missing"},breaker_state:"enabled",decision_outcome:"deny",decision_reason_code:"envelope_missing",readiness:"blocked"},
      "00000000-0000-4000-8000-000000000102":{route_mode:"enforced",envelope_id:"00000000-0000-4000-8000-000000000301",envelope_status:"active",lease_states:{repository:"active",database:"active"},breaker_state:"enabled",decision_outcome:"allow",decision_reason_code:"authority_allow",readiness:"authorized"},
      "00000000-0000-4000-8000-000000000103":{route_mode:"report_only",envelope_id:null,envelope_status:null,lease_states:{},breaker_state:"enabled",decision_outcome:null,decision_reason_code:null,readiness:"report_only"}
    };
    else if(path.endsWith("/jobs")) body=jobs;
    else if(path.includes("/accept_pending_project_member_invites_v1")||path.includes("/accept_pending_job_invites")) body=null;
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=scheduler");

  await expect(page.getByRole("heading",{name:"Capability-aware project scheduler",exact:true})).toBeVisible();
  await expect(page.getByText("Fixture Project",{exact:true}).first()).toBeVisible();
  await expect(page.getByText("fixture-project",{exact:true}).first()).toBeVisible();
  await expect(page.locator(".schedulerProjectGroupHead")).toBeVisible();
  await expect(page.getByText("Maintenance",{exact:true})).toBeVisible();
  await expect(page.getByText("Critical",{exact:true})).toBeVisible();
  const projectGroup=page.locator(".schedulerProjectGroupHead");
  await expect(projectGroup.getByText("3 jobs",{exact:true})).toBeVisible();
  await expect(projectGroup.getByText("2 active",{exact:true})).toBeVisible();
  await expect(projectGroup.getByText("Peak P100",{exact:true})).toBeVisible();
  await expect(projectGroup.locator(".schedulerPriorityBands span")).toHaveCount(4);
  await expect(projectGroup.locator(".schedulerPriorityBands span")).toContainText([
    "1Maintenance","1Standard","0High","1Critical"
  ]);

  const ganttTitles=page.locator(".ganttJobTitle small");
  await expect(ganttTitles).toHaveText(["Critical release gate","Active implementation","Maintenance smoke check"]);

  const ganttPriorities=page.locator(".ganttPriorityMeta .priorityScaleMarker");
  await expect(ganttPriorities).toHaveCount(3);
  await expect(ganttPriorities.nth(0)).toHaveAttribute("style",/left:\s*100%/);
  await expect(ganttPriorities.nth(1)).toHaveAttribute("style",/left:\s*50%/);
  await expect(ganttPriorities.nth(2)).toHaveAttribute("style",/left:\s*5%/);

  await page.getByLabel("Sort project jobs").selectOption("recent");
  await expect(ganttTitles).toHaveText(["Active implementation","Critical release gate","Maintenance smoke check"]);
  await page.getByLabel("Sort project jobs").selectOption("priority");
  await expect(ganttTitles).toHaveText(["Critical release gate","Active implementation","Maintenance smoke check"]);

  await page.getByRole("button",{name:"Queue",exact:true}).click();
  await expect(page.locator(".schedulerProjectGroup .schedulerTable")).toBeVisible();
  await expect(page.locator(".schedulerPriorityCell .priorityScaleMarker")).toHaveCount(3);
  await expect(page.getByText("Blocked by policy",{exact:true})).toBeVisible();
  await expect(page.getByText("Authorized",{exact:true})).toBeVisible();
  await expect(page.getByText("Report only",{exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Gantt chart",exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator(".ganttViewport")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test("Stakeholder interests drive TranScheduler requirement matching and filtering", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  let interestKeys:string[] = [];
  let preferenceWrites = 0;

  const jobs = [
    {
      id:"00000000-0000-4000-8000-000000000111",job_number:111,title:"UI polish",description:null,
      priority:90,status:"READY",required_capabilities:["repository"],
      requirements:{source:"UNIFI Planner",focus_areas:["ui_ux"]},acceptance:{},
      created_at:"2026-09-29T03:00:00Z",updated_at:"2026-09-29T03:10:00Z",deadline:null
    },
    {
      id:"00000000-0000-4000-8000-000000000112",job_number:112,title:"Database maintenance",description:null,
      priority:70,status:"PLANNED",required_capabilities:["database"],
      requirements:{source:"UNIFI Planner",focus_areas:["database_architecture"]},acceptance:{},
      created_at:"2026-09-29T02:00:00Z",updated_at:"2026-09-29T02:10:00Z",deadline:null
    },
    {
      id:"00000000-0000-4000-8000-000000000113",job_number:113,title:"Accessibility review",description:null,
      priority:50,status:"READY",required_capabilities:["chat"],
      requirements:{source:"UNIFI Planner",focus_areas:["ui_ux","security_testing","governance_process"]},acceptance:{},
      created_at:"2026-09-29T01:00:00Z",updated_at:"2026-09-29T01:10:00Z",deadline:null
    }
  ];

  await page.setViewportSize({width:1440,height:1000});
  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));

  await page.addInitScript(({userId}) => {
    const encode = (data:unknown) => btoa(JSON.stringify(data)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    localStorage.setItem("sb-fixture-auth-token",JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture",token_type:"bearer",expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  },{userId});

  await page.route("https://fixture.supabase.co/**", async route => {
    const request=route.request();
    const url=new URL(request.url());
    const path=url.pathname;
    const headers={"Content-Type":"application/json"};
    let body:unknown=[];

    if(path.endsWith("/projects")) {
      body={id:projectId,slug:"fixture-project",name:"Fixture Project",description:null,status:"ACTIVE",created_at:"2026-09-24T00:00:00Z"};
    } else if(path.endsWith("/project_members")) {
      body={project_id:projectId,user_id:userId,role:"owner",status:"active"};
    } else if(path.endsWith("/tool_registry")) {
      body=[];
    } else if(path.endsWith("/capabilities")) {
      body=[{
        id:"00000000-0000-4000-8000-000000000211",account_key:"fixture",connector_kind:"github",capability:"repository",
        state:"AVAILABLE",observed_at:"2026-09-29T04:00:00Z",next_check_at:null,confidence:1,concurrency_limit:1,running:0,metadata:{}
      }];
    } else if(path.endsWith("/get_project_dashboard_summary")) {
      body={total_jobs:3,active_jobs:2,running_jobs:0,blocked_jobs:0,available_capabilities:1,registered_capabilities:1};
    } else if(path.endsWith("/get_job_execution_authority_summary_v1")) {
      body={};
    } else if(path.endsWith("/jobs")) {
      body=jobs;
    } else if(path.endsWith("/get_contribution_workspace")) {
      body={
        profile:{lifecycle_stage:"active_stakeholder",status:"active",origin:"invite"},
        stakeholder:{tracked_points:0,pending_contributions:0,contribution_share_percent:0},
        counts:{submitted:0,verified:0,scored:0,minted:0},
        spark_balances:[],
        scoring_model_version:"fixture",
        ui_complexity:"simple",
        economic_boundary:{}
      };
    } else if(path.endsWith("/get_contribution_intelligence_workspace")) {
      body={
        rolling_90:{},lifetime:{},progression:{},active_squad_membership:{},squad:[],anomaly_signals:[],
        preferences:{ui_complexity:"simple",ranking_opt_in:false,squad_opt_in:false},
        model:{model_version:"fixture",weights:{}},
        can_manage:true,boundaries:{}
      };
    } else if(path.endsWith("/contribution_ledger")) {
      body=[];
    } else if(path.endsWith("/datanest_user_preferences")) {
      if(request.method()==="POST"||request.method()==="PATCH"){
        const payload=request.postDataJSON() as {interest_keys?:string[]};
        if(Array.isArray(payload.interest_keys))interestKeys=[...payload.interest_keys];
        preferenceWrites += 1;
        return route.fulfill({status:200,headers,body:"[]"});
      }
      body={interest_keys:interestKeys};
    } else if(path.includes("/accept_pending_project_member_invites_v1")||path.includes("/accept_pending_job_invites")) {
      body=null;
    }

    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=stakeholder");

  await expect(page.getByRole("heading",{name:"Work areas you want to see",exact:true})).toBeVisible();
  await expect(page.getByText("3 open Jobs mapped across requirement sections.",{exact:true})).toBeVisible();
  await expect(page.getByLabel("2 open Jobs require UI/UX")).toHaveText("2 open Jobs");
  await expect(page.getByLabel("1 open Jobs require Security & Testing")).toHaveText("1 open Job");
  await expect(page.getByLabel("1 open Jobs require Database & Architecture")).toHaveText("1 open Job");
  await expect(page.getByLabel("1 open Jobs require Governance & Process")).toHaveText("1 open Job");
  const zeroDemand=page.getByRole("button",{name:"0 open Jobs require Brand & Promotion",exact:true});
  await expect(zeroDemand).toHaveText("0 open Jobs");
  await expect(zeroDemand).toBeDisabled();

  const uiUxDemand=page.getByRole("button",{name:"2 open Jobs require UI/UX",exact:true});
  await uiUxDemand.click();
  await expect(page.getByRole("heading",{name:"Capability-aware project scheduler",exact:true})).toBeVisible();
  await expect(page).toHaveURL(/view=scheduler/);
  await expect(page).toHaveURL(/focus=ui_ux/);
  await expect(page).not.toHaveURL(/interests=1/);
  await expect(page.getByLabel("Requirement focus: UI/UX")).toContainText("UI/UX · open Jobs only");
  await expect(page.locator(".ganttRow")).toHaveCount(2);
  await expect(page.locator(".ganttJobTitle small")).toHaveText(["UI polish","Accessibility review"]);
  await expect(page.getByText("Database maintenance",{exact:true})).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Requirement focus: UI/UX")).toContainText("UI/UX · open Jobs only");
  await expect(page.locator(".ganttJobTitle small")).toHaveText(["UI polish","Accessibility review"]);

  await page.getByRole("button",{name:"Clear focus",exact:true}).click();
  await expect(page).not.toHaveURL(/focus=/);
  await expect(page.locator(".ganttRow")).toHaveCount(3);

  await page.goto(appPath+"?view=stakeholder");
  const uiUxInterest=page.getByRole("checkbox",{name:/UI\/UX/});
  await expect(uiUxInterest).not.toBeChecked();
  await uiUxInterest.click();
  await expect(uiUxInterest).toBeChecked();
  await expect(page.getByText("1 selected",{exact:true})).toBeVisible();

  const securityInterest=page.getByRole("checkbox",{name:/Security & Testing/});
  await expect(securityInterest).not.toBeChecked();
  await securityInterest.click();
  await expect(securityInterest).toBeChecked();
  await expect(page.getByText("2 selected",{exact:true})).toBeVisible();

  const documentationInterest=page.getByRole("checkbox",{name:/Documentation & Mentoring/});
  await expect(documentationInterest).not.toBeChecked();
  await documentationInterest.click();
  await expect(documentationInterest).toBeChecked();
  await expect(page.getByText("3 selected",{exact:true})).toBeVisible();
  await expect.poll(()=>preferenceWrites).toBe(3);
  expect(interestKeys).toEqual(["ui_ux","security_testing","documentation_mentoring"]);

  const openMatchedJobs=page.getByRole("button",{name:"Open matched Jobs",exact:true});
  await expect(openMatchedJobs).toBeEnabled();
  await openMatchedJobs.click();

  await expect(page.getByRole("heading",{name:"Capability-aware project scheduler",exact:true})).toBeVisible();
  await expect(page).toHaveURL(/view=scheduler/);
  await expect(page).toHaveURL(/sort=interest/);
  await expect(page).toHaveURL(/interests=1/);
  await expect(page.locator(".schedulerInterestSummary")).toContainText("UI/UX");
  await expect(page.getByText("2 interest matches",{exact:true})).toBeVisible();
  const coverage=page.getByLabel("Interest coverage on current queue page");
  await expect(coverage).toContainText("2 covered · 1 gap");
  await expect(page.getByLabel("Covered interest: UI/UX")).toHaveCount(1);
  await expect(page.getByLabel("Covered interest: Security & Testing")).toHaveCount(1);
  await expect(page.getByLabel("No current Job interest: Documentation & Mentoring")).toHaveCount(1);
  await expect(page.getByLabel("Interest coverage 2 of 3 Job requirement sections")).toHaveCount(1);
  await expect(page.getByLabel("Interest coverage 1 of 1 Job requirement sections")).toHaveCount(1);
  await expect(page.getByText("INTEREST MATCH",{exact:true})).toHaveCount(2);
  await expect(page.locator(".ganttRow.interestMatch")).toHaveCount(2);
  await expect(page.getByText("Matched 2 · UI/UX · Security & Testing",{exact:true})).toHaveCount(1);
  await expect(page.getByText("Matched 1 · UI/UX",{exact:true})).toHaveCount(1);
  await expect(page.getByLabel("Matched interests: UI/UX, Security & Testing")).toHaveCount(1);
  await expect(page.getByLabel("Matched interests: UI/UX",{exact:true})).toHaveCount(1);
  await expect(page.getByText("Outside your interests · Governance & Process",{exact:true})).toHaveCount(1);
  await expect(page.getByLabel("Requirement sections outside your interests: Governance & Process")).toHaveCount(1);
  await expect(page.locator(".jobFocusChip").filter({hasText:"UI/UX"})).toHaveCount(2);

  const ganttTitles=page.locator(".ganttJobTitle small");
  const interestFilter=page.getByRole("checkbox",{name:"My interests"});
  await expect(interestFilter).toBeChecked();
  await expect(page.getByLabel("Sort project jobs")).toHaveValue("interest");
  await expect(page.locator(".ganttRow")).toHaveCount(2);
  await expect(ganttTitles).toHaveText(["Accessibility review","UI polish"]);
  await expect(page.getByText("Database maintenance",{exact:true})).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading",{name:"Capability-aware project scheduler",exact:true})).toBeVisible();
  await expect(page.getByRole("checkbox",{name:"My interests"})).toBeChecked();
  await expect(page.getByLabel("Sort project jobs")).toHaveValue("interest");
  await expect(page.locator(".ganttJobTitle small")).toHaveText(["Accessibility review","UI polish"]);

  await page.getByRole("checkbox",{name:"My interests"}).uncheck();
  await expect(page).not.toHaveURL(/interests=1/);
  await expect(page.locator(".ganttRow")).toHaveCount(3);
  await expect(page.locator(".ganttJobTitle small")).toHaveText(["Accessibility review","UI polish","Database maintenance"]);
  await expect(page.getByText("Outside your interests · Database & Architecture",{exact:true})).toHaveCount(1);
});
