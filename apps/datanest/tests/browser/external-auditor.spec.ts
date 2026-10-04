import { expect, test } from "@playwright/test";

const appPath = process.env.DATANEST_APP_PATH || "/";

test("External Auditor completes a governed traceable assessment flow", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const assessmentId = "00000000-0000-4000-8000-000000000100";
  const sourceId = "00000000-0000-4000-8000-000000000110";
  const findingId = "00000000-0000-4000-8000-000000000120";
  const actionId = "00000000-0000-4000-8000-000000000130";
  const documentId = "00000000-0000-4000-8000-000000000140";
  const jobId = "00000000-0000-4000-8000-000000000150";

  const bundle = {
    assessment:{
      id:assessmentId,project_id:projectId,target_name:"Fixture product",target_kind:"website",
      target_goal:"Assess quality, UX, security, and optimization opportunities.",
      target_reference:"https://example.com",status:"evidence",revision:1,
      created_at:"2026-09-29T08:00:00Z",updated_at:"2026-09-29T08:00:00Z"
    },
    profile:null as null | Record<string,unknown>,
    sources:[] as Array<Record<string,unknown>>,
    findings:[] as Array<Record<string,unknown>>,
    actions:[] as Array<Record<string,unknown>>,
    events:[] as Array<Record<string,unknown>>,
    documents:[] as Array<Record<string,unknown>>
  };

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));

  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture",
      token_type:"bearer",
      expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const request=route.request();
    const url=new URL(request.url());
    const path=url.pathname;
    const requestBody=(()=>{
      try{return (request.postDataJSON()||{}) as Record<string,unknown>;}catch{return {};}
    })();

    if(path.endsWith("/functions/v1/ronsas-status")){
      return route.fulfill({contentType:"application/json",body:JSON.stringify({
        contract:"ronsas-status@1",checkedAt:"2026-09-29T08:00:00Z",mode:"cloud",
        managedByDataNest:true,billingState:"free-promotion",independent:false,localInteractionRequired:false,
        authority:{owner:"DataNest-Supository",controlRepository:"DataNest-Supository/DataNest",hubRepository:"DataNest-Supository/DataNest",publicHub:"https://reson8.life/"},
        hub:{ok:true,status:200,latencyMs:42,origin:"https://reson8.life/"}
      })});
    }

    if(path.endsWith("/functions/v1/external-audit")){
      const action=String(requestBody.action||"");
      if(action==="snapshot"){
        bundle.sources=[{
          id:sourceId,assessment_id:assessmentId,revision:1,kind:"public_https",
          canonical_reference:"https://example.com",source_version:null,fetched_at:"2026-09-29T08:01:00Z",
          content_hash:"a".repeat(64),locator:"https://example.com",visibility:"project_restricted",
          acquisition_state:"captured",coverage_note:null
        }];
        bundle.events.push({
          id:"00000000-0000-4000-8000-000000000201",assessment_id:assessmentId,revision:1,
          event_type:"SOURCE_CAPTURED",actor_user_id:userId,payload:{source_id:sourceId},created_at:"2026-09-29T08:01:00Z"
        });
        return route.fulfill({contentType:"application/json",body:JSON.stringify({sourceId})});
      }
      if(action==="analyze"){
        bundle.findings=[{
          id:findingId,assessment_id:assessmentId,revision:1,criterion_id:"ISO/IEC 25010:2023 · usability",
          evidence_ids:[sourceId],observation:"The assessed public surface should make the primary task path easier to identify.",
          limitation:"Public-source assessment only.",claim_kind:"observed",severity:"medium",confidence:0.91,
          state:"draft",draft_action:"Clarify primary task hierarchy and acceptance evidence."
        }];
        bundle.actions=[{
          id:actionId,finding_id:findingId,outcome:"Clarify the primary task hierarchy.",
          acceptance:"Primary task is visible and browser-verified.",priority:70,status:"proposed",job_id:null
        }];
        bundle.events.push({
          id:"00000000-0000-4000-8000-000000000202",assessment_id:assessmentId,revision:1,
          event_type:"ANALYSIS_CREATED",actor_user_id:userId,payload:{finding_count:1},created_at:"2026-09-29T08:02:00Z"
        });
        return route.fulfill({contentType:"application/json",body:JSON.stringify({findingCount:1})});
      }
      if(action==="read"){
        return route.fulfill({contentType:"application/json",body:JSON.stringify(bundle)});
      }
      return route.fulfill({contentType:"application/json",body:JSON.stringify({ok:true})});
    }

    if(path.endsWith("/rest/v1/rpc/create_external_audit_v1")){
      bundle.assessment.target_name=String(requestBody.target_name||bundle.assessment.target_name);
      bundle.assessment.target_goal=String(requestBody.target_goal||bundle.assessment.target_goal);
      bundle.assessment.target_reference=String(requestBody.target_reference||bundle.assessment.target_reference);
      return route.fulfill({contentType:"application/json",body:JSON.stringify([{assessment_id:assessmentId,revision:1}])});
    }

    if(path.endsWith("/rest/v1/rpc/save_external_audit_profile_v1")){
      bundle.profile={
        selected:requestBody.target_selected_standards||[],
        excluded:requestBody.target_excluded_standards||[],
        reviewerId:userId,approvedAt:"2026-09-29T08:01:30Z",version:1
      };
      bundle.events.push({
        id:"00000000-0000-4000-8000-000000000203",assessment_id:assessmentId,revision:1,
        event_type:"STANDARDS_PROFILE_APPROVED",actor_user_id:userId,payload:{profile_version:1},created_at:"2026-09-29T08:01:30Z"
      });
      return route.fulfill({contentType:"application/json",body:JSON.stringify("00000000-0000-4000-8000-000000000160")});
    }

    if(path.endsWith("/rest/v1/rpc/approve_external_audit_action_v1")){
      bundle.actions=bundle.actions.map(action=>({...action,status:"planned",job_id:jobId}));
      bundle.events.push({
        id:"00000000-0000-4000-8000-000000000204",assessment_id:assessmentId,revision:1,
        event_type:"ACTION_APPROVED_TO_UNIFI",actor_user_id:userId,payload:{action_id:actionId,job_id:jobId},created_at:"2026-09-29T08:03:00Z"
      });
      return route.fulfill({contentType:"application/json",body:JSON.stringify([{action_id:actionId,job_id:jobId}])});
    }

    if(path.endsWith("/rest/v1/rpc/publish_external_audit_document_v1")){
      bundle.documents=[{
        id:documentId,assessment_id:assessmentId,revision:1,kind:"assessment_report",format:"json",
        content_hash:"b".repeat(64),content_text:String(requestBody.target_content||"{}"),
        storage_reference:null,visibility:"project_restricted",generated_at:"2026-09-29T08:04:00Z"
      }];
      bundle.events.push({
        id:"00000000-0000-4000-8000-000000000205",assessment_id:assessmentId,revision:1,
        event_type:"DOCUMENT_PUBLISHED",actor_user_id:userId,payload:{document_id:documentId},created_at:"2026-09-29T08:04:00Z"
      });
      return route.fulfill({contentType:"application/json",body:JSON.stringify(documentId)});
    }

    let body:unknown=[];
    if(path.endsWith("/rest/v1/projects")) body={id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-29T00:00:00Z"};
    if(path.endsWith("/rest/v1/project_members")) body={project_id:projectId,user_id:userId,role:"admin",status:"active"};
    if(path.endsWith("/rest/v1/rpc/get_project_dashboard_summary")) body={total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};

    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=external_auditor");

  await expect(page.getByRole("heading",{name:"DataNest External Audit & Optimizer"})).toBeVisible();
  await expect(page.getByText("ASSISTED ASSESSMENT",{exact:true})).toBeVisible();
  await expect(page.getByText("ISO 19011:2026",{exact:true})).toBeVisible();
  await expect(page.getByText("ISO 9001:2026",{exact:true})).toBeVisible();
  await expect(page.getByText("ISO/IEC 27001:2022",{exact:true})).toBeVisible();

  await page.getByLabel("Target name").fill("Fixture product");
  await page.getByLabel("Public HTTPS URL").fill("https://example.com");
  await page.getByLabel("Assessment goal").fill("Assess quality, UX, security, and optimization opportunities.");
  await page.getByRole("button",{name:"Create assessment"}).click();

  await expect(page.getByText("Assessment created. Capture evidence, approve the standards profile, then analyze.")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Traceable documentation"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Evidence provenance",exact:true})).toBeVisible();
  await expect(page.getByText("Recovery path",{exact:true})).toBeVisible();
  await expect(page.getByText("Revision 1",{exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Capture source snapshot"}).click();
  await expect(page.getByText("Immutable source snapshot captured.")).toBeVisible();
  await expect(page.getByText("1 snapshots",{exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Save & approve profile"}).click();
  await expect(page.getByText("Standards profile approved.")).toBeVisible();

  await page.getByRole("button",{name:"Run governed analysis"}).click();
  await expect(page.getByText("Evidence-linked draft analysis created for human review.")).toBeVisible();
  await expect(page.getByText("ISO/IEC 25010:2023 · usability",{exact:true})).toBeVisible();
  await expect(page.getByText("1 findings",{exact:true})).toBeVisible();
  await expect(page.getByText("1 actions",{exact:true})).toBeVisible();

  const proposedAction=page.locator(".externalAuditList article").filter({hasText:"Clarify the primary task hierarchy."});
  await expect(proposedAction.locator(".platformGovernedAction")).toHaveAttribute("data-governed-stage","review-required");
  await expect(proposedAction.getByText("Human / external review required",{exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Approve → UNIFI"}).click();
  await expect(page.getByText("Approved action handed to UNIFI as one idempotent Job Manifest.")).toBeVisible();
  await expect(page.getByText("1 UNIFI jobs",{exact:true})).toBeVisible();
  await expect(page.getByText("UNIFI Job "+jobId,{exact:true})).toBeVisible();
  const authorizedAction=page.locator(".externalAuditList article").filter({hasText:"Clarify the primary task hierarchy."});
  await expect(authorizedAction.locator(".platformGovernedAction")).toHaveAttribute("data-governed-stage","authorized");
  await expect(authorizedAction.getByText(userId,{exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Publish report"}).click();
  await expect(page.getByText("Versioned assessment report published with a server-calculated SHA-256 hash.")).toBeVisible();
  await expect(page.getByText("1 versions",{exact:true})).toBeVisible();
  await expect(page.getByText(/JSON · SHA-256 b{12}…/)).toBeVisible();

  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
