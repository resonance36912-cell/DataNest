import { expect, test } from "@playwright/test";

async function signIn(page:import("@playwright/test").Page){
  const email=process.env.DATANEST_AI_E2E_EMAIL;
  const password=process.env.DATANEST_AI_E2E_PASSWORD;
  if(!email||!password)throw new Error("DATANEST_AI_E2E_EMAIL and DATANEST_AI_E2E_PASSWORD are required.");

  await page.goto(process.env.DATANEST_APP_PATH||"/");
  await page.getByLabel("Email").fill(email);
  await page.getByPlaceholder("Password",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Sign in"}).click();
  await expect(page.getByRole("button",{name:/Quick switch/})).toBeVisible({timeout:15000});
}

async function openWorkspace(page:import("@playwright/test").Page,label:string){
  await page.keyboard.press("Control+K");
  const dialog=page.getByRole("dialog",{name:"Quick switch DataNest workspace"});
  await expect(dialog).toBeVisible();
  const search=dialog.getByLabel("Search DataNest workspaces");
  await search.fill(label);
  await dialog.getByRole("option",{name:new RegExp(label,"i")}).first().click();
  await expect(dialog).toBeHidden();

  // Dynamic workspace bundles can resolve after the quick-switch dialog closes.
  // Wait for the target surface before interacting with controls inside it.
  if(label==="DataNest AI"){
    await expect(page).toHaveURL(/(?:\\?|&)view=ai(?:&|$)/,{timeout:15000});
    await expect(page.getByLabel("Active Job context",{exact:true})).toBeVisible({timeout:15000});
  }else if(label==="Governance"){
    await expect(page).toHaveURL(/(?:\\?|&)view=governance(?:&|$)/,{timeout:15000});
    await expect(page.getByText("Project members and invitations",{exact:true})).toBeVisible({timeout:15000});
  }
}

async function selectPrimaryAiJob(page:import("@playwright/test").Page){
  const activeJob=page.getByLabel("Active Job context",{exact:true});
  await expect(activeJob).toBeVisible();
  const primary=activeJob.locator("option").filter({hasText:/· DataNest AI E2E Job$/}).first();
  const primaryId=await primary.getAttribute("value");
  if(!primaryId)throw new Error("Primary DataNest AI E2E Job fixture is required.");
  await activeJob.selectOption(primaryId);
  await expect(activeJob).toHaveValue(primaryId);
  await expect(activeJob.locator("option:checked")).toHaveText(/· DataNest AI E2E Job$/);
}

test("quick switch searches workspaces and navigates with Ctrl+K",async({page})=>{
  await signIn(page);

  await page.keyboard.press("Control+K");
  const dialog=page.getByRole("dialog",{name:"Quick switch DataNest workspace"});
  await expect(dialog).toBeVisible();

  const search=dialog.getByLabel("Search DataNest workspaces");
  await expect(search).toBeFocused();
  await search.fill("Transparency");
  await dialog.getByRole("option",{name:/Transparency/}).click();

  await expect(page).toHaveURL(/(?:\?|&)view=transparency(?:&|$)/);
  await expect(page.getByRole("heading",{name:"Audit library + public accountability record",exact:true})).toBeVisible();

  await page.keyboard.press("Control+K");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});


test("quick switch ignores Enter until a search is typed",async({page})=>{
  await signIn(page);

  await page.keyboard.press("Control+K");
  const dialog=page.getByRole("dialog",{name:"Quick switch DataNest workspace"});
  const search=dialog.getByLabel("Search DataNest workspaces");
  await expect(search).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(search).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});


test("quick switch opens the first matching workspace with Enter",async({page})=>{
  await signIn(page);

  await page.keyboard.press("Control+K");
  const dialog=page.getByRole("dialog",{name:"Quick switch DataNest workspace"});
  const search=dialog.getByLabel("Search DataNest workspaces");
  await expect(search).toBeFocused();

  await search.fill("Transparency");
  await page.keyboard.press("Enter");

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/(?:\\?|&)view=transparency(?:&|$)/);
  await expect(page.getByRole("heading",{name:"Audit library + public accountability record",exact:true})).toBeVisible();
});


test("quick switch moves keyboard selection with ArrowDown before Enter",async({page})=>{
  await signIn(page);

  await page.keyboard.press("Control+K");
  const dialog=page.getByRole("dialog",{name:"Quick switch DataNest workspace"});
  const search=dialog.getByLabel("Search DataNest workspaces");
  await expect(search).toBeFocused();

  await search.fill("Execute");
  const options=dialog.getByRole("option");
  await expect(options).toHaveCount(3);
  await expect(dialog.getByRole("option",{name:/UNIFI Planner/})).toHaveAttribute("aria-selected","true");

  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("option",{name:/TranScheduler/})).toHaveAttribute("aria-selected","true");

  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/(?:\\?|&)view=scheduler(?:&|$)/);
  await expect(page.getByRole("heading",{name:"TranScheduler",exact:true}).first()).toBeVisible();
});


test("quick switch traps focus and restores the opening control",async({page})=>{
  await signIn(page);

  const trigger=page.getByRole("button",{name:/Quick switch/});
  await trigger.focus();
  await trigger.click();

  const dialog=page.getByRole("dialog",{name:"Quick switch DataNest workspace"});
  await expect(dialog).toBeVisible();

  const close=dialog.getByRole("button",{name:"Close quick switch"});
  const options=dialog.getByRole("option");
  const lastOption=options.last();

  await lastOption.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(lastOption).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});


test("workspace deep links survive reload and follow browser history",async({page})=>{
  await signIn(page);

  await openWorkspace(page,"Think Tanks");
  await expect(page).toHaveURL(/(?:\?|&)view=thinktank(?:&|$)/);
  await expect(page.getByText("THINK TANKS + DATANEST AI",{exact:true})).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/(?:\?|&)view=thinktank(?:&|$)/);
  await expect(page.getByText("THINK TANKS + DATANEST AI",{exact:true})).toBeVisible();

  await openWorkspace(page,"DataNest AI");
  await expect(page).toHaveURL(/(?:\?|&)view=ai(?:&|$)/);

  await page.goBack();
  await expect(page).toHaveURL(/(?:\?|&)view=thinktank(?:&|$)/);
  await expect(page.getByText("THINK TANKS + DATANEST AI",{exact:true})).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/(?:\?|&)view=ai(?:&|$)/);
  await expect(page.getByRole("heading",{name:"DataNest AI",exact:true}).first()).toBeVisible();
});


test("mobile TranScheduler avoids horizontal table scrolling",async({page})=>{
  await signIn(page);
  await page.setViewportSize({width:390,height:844});

  await openWorkspace(page,"TranScheduler");
  await expect(page).toHaveURL(/(?:\?|&)view=scheduler(?:&|$)/);
  await page.getByRole("button",{name:"Queue",exact:true}).click();

  const table=page.locator(".schedulerTable");
  await expect(table).toBeVisible();

  const overflow=await table.evaluate(element=>element.scrollWidth-element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const rows=page.locator(".schedulerRow:not(.headerRow)");
  if(await rows.count()){
    const first=rows.first();
    const metrics=await first.evaluate(element=>({
      width:element.getBoundingClientRect().width,
      viewport:window.innerWidth
    }));
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewport-28);
    await expect(first.locator('[data-label="Job"]')).toBeVisible();
    await expect(first.locator('[data-label="Status"]')).toBeVisible();
  }
});


test("mobile TranScheduler status filter uses a compact select",async({page})=>{
  await signIn(page);
  await page.setViewportSize({width:390,height:844});

  await openWorkspace(page,"TranScheduler");
  await page.getByRole("button",{name:"Queue",exact:true}).click();

  const statusFilter=page.getByLabel("Status filter");
  await expect(statusFilter).toBeVisible();
  await expect(page.locator(".schedulerFilterDesktop")).toBeHidden();

  await statusFilter.selectOption("RUNNING");
  await expect(statusFilter).toHaveValue("RUNNING");

  const rows=page.locator(".schedulerRow:not(.headerRow)");
  const count=await rows.count();
  for(let index=0;index<count;index++){
    await expect(rows.nth(index).locator('[data-label="Status"]')).toContainText("RUNNING");
  }
});


test("human input is traced and remains uncertified",async({page})=>{
  await signIn(page);
  await openWorkspace(page,"DataNest AI");
  await selectPrimaryAiJob(page);

  const message="Keep DataNest AI trace IDs visible on every governed turn.";
  await page.getByRole("button",{name:/Documentation/}).click();
  await page.getByPlaceholder(/Ask DataNest AI to analyze/i).fill(message);
  await page.getByRole("button",{name:"Send command"}).click();

  await expect(page.getByText(message,{exact:true})).toBeVisible();
  await expect(page.getByText("UNCERTIFIED",{exact:true}).last()).toBeVisible();
  await expect(page.getByText(/DN-AI-/).last()).toBeVisible();
  const governance=page.locator("#datanest-ai-governance-tools");
  await governance.locator("summary").first().click();
  await expect(governance).toHaveAttribute("open","");
  await expect(page.getByLabel("Certified Memory")).toBeVisible();
  await expect(page.getByLabel("Learning & Certification")).toBeVisible();
});

test("AI Companion return becomes uncertified evidence in the selected Job",async({page})=>{
  await signIn(page);
  await openWorkspace(page,"DataNest AI");
  await selectPrimaryAiJob(page);

  const assistant=page.getByRole("button",{name:"AI assistant",exact:true});
  await expect(assistant).toBeVisible();
  await assistant.click();
  await expect(page.getByText("RETURN TO DATANEST")).toBeVisible();
  await expect(page.getByRole("button",{name:/^Open companion \+/})).toBeEnabled();

  page.on("popup",popup=>void popup.close());
  await page.getByRole("button",{name:/^Open companion \+/}).click();
  await expect(page.getByText("COMPANION · READY",{exact:true})).toBeVisible();

  const companionResult="AI Companion E2E evidence: preserve traceability before project-wide learning.";
  await page.getByPlaceholder(/Copy the completed external AI response/i).fill(companionResult);
  await page.getByRole("button",{name:"Import to DataNest"}).click();
  await expect(page.getByText(/staged as UNCERTIFIED evidence/i)).toBeVisible();

  await page.getByRole("button",{name:"Hide AI",exact:true}).click();
  await expect(page.getByText(companionResult,{exact:true})).toBeVisible();
  await expect(page.getByText("UNCERTIFIED",{exact:true}).last()).toBeVisible();
});


test("Think Tanks expose project-scoped collaboration and reviewed-memory boundaries",async({page})=>{
  await signIn(page);
  await openWorkspace(page,"Think Tanks");

  await expect(page.getByText("THINK TANKS + DATANEST AI",{exact:true})).toBeVisible();
  await expect(page.getByText("Discuss → Ask → Decide → Act → Review → Remember",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Project Commons",exact:true})).toBeVisible();
  await expect(page.getByText(/Project-wide discussion; link a channel to a Job to invoke DataNest AI/)).toBeVisible();
  await expect(page.getByText(/reusable learning reaches project memory only after independent human review/i)).toBeVisible();
});


test("Sparks workspace exposes internal utility boundaries",async({page})=>{
  await signIn(page);
  const navigation=page.getByRole("navigation",{name:"Project workspaces"});
  const discover=navigation.getByText("Discover",{exact:true});
  await discover.click();
  const sparks=navigation.getByRole("button",{name:"Sparks",exact:true});
  await expect(sparks).toBeVisible();
  await sparks.click();

  await expect(page.getByText("SPARKS · INTERNAL UTILITY",{exact:true})).toBeVisible();
  await expect(page.getByText("Earned contribution utility, not money",{exact:true})).toBeVisible();
  await expect(page.getByText(/cannot be bought for cash, redeemed for cash, transferred peer-to-peer, traded/i)).toBeVisible();
  await expect(page.getByText(/platform spending is disabled in v1/i)).toBeVisible();
  await expect(page.getByText(/Ledger entries are append-only/i)).toBeVisible();
});


test("Sovereign Governance exposes project-scoped governance boundaries",async({page})=>{
  await signIn(page);
  await openWorkspace(page,"Governance");

  await expect(page.getByText("RESONANCE SOVEREIGN GOVERNANCE",{exact:true})).toBeVisible();
  await expect(page.getByText(/DataNest separates project governance from legal ownership, contracts, royalties, financial authority and project roles/i)).toBeVisible();
  await expect(page.getByRole("heading",{name:"No human-ratified protocol",exact:true})).toBeVisible();
  await expect(page.getByText(/has not invented mission, vision or governance text on your behalf/i)).toBeVisible();
  await expect(page.getByText(/do not amend signed agreements, create legal ownership, create royalty entitlements, grant project roles or create financial authority/i)).toBeVisible();
});


test("Governance exposes governed project membership and non-voter pending state",async({page})=>{
  await signIn(page);
  await openWorkspace(page,"Governance");

  await page.getByText("Project members and invitations",{exact:true}).click();
  await expect(page.getByText("FORMAL MEMBERSHIP",{exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Project members + governance voters",exact:true})).toBeVisible();
  await expect(page.getByText(/Sending an invitation never creates an independent vote by itself/i)).toBeVisible();
  await expect(page.getByText(/1 ACTIVE VOTER/)).toBeVisible();
  await expect(page.getByText(/acceptance requires the matching authenticated account/i)).toBeVisible();
});


test("project invite action confirms successful delivery inline without sending a real email",async({page})=>{
  await signIn(page);
  await openWorkspace(page,"Governance");
  await page.getByText("Project members and invitations",{exact:true}).click();

  await page.route("**/functions/v1/send-project-member-invite",async route=>{
    await new Promise(resolve=>setTimeout(resolve,180));
    await route.fulfill({
      status:200,
      contentType:"application/json",
      body:JSON.stringify({
        ok:true,
        delivery:"invite",
        invitation:{id:"browser-fixture-invite"},
        formalVotingEligible:false,
        acceptanceRequired:true
      })
    });
  });

  const email="browser-invite-success@example.invalid";
  await page.getByLabel("Invite email").fill(email);
  const send=page.getByRole("button",{name:"Send project invite"});
  await send.click();

  await expect(page.getByRole("button",{name:"Sending invite…"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Invite sent"})).toBeVisible();
  await expect(page.locator("#project-invite-feedback")).toContainText("Invite sent to "+email);
  await expect(page.locator("#project-invite-feedback")).toContainText(/Voting remains disabled until that person authenticates and accepts project access/i);
  await expect(page.getByLabel("Invite email")).toHaveValue("");
});

test("project invite action exposes delivery failure inline and preserves retry input",async({page})=>{
  await signIn(page);
  await openWorkspace(page,"Governance");
  await page.getByText("Project members and invitations",{exact:true}).click();

  await page.route("**/functions/v1/send-project-member-invite",async route=>{
    await route.fulfill({
      status:409,
      contentType:"application/json",
      body:JSON.stringify({error:"This user is already an active project member."})
    });
  });

  const email="browser-invite-failure@example.invalid";
  const emailInput=page.getByLabel("Invite email");
  await emailInput.fill(email);
  await page.getByRole("button",{name:"Send project invite"}).click();

  const retry=page.getByRole("button",{name:"Invite failed · Retry"});
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(page.locator("#project-invite-feedback")).toHaveText("Invite failed. This user is already an active project member.");
  await expect(emailInput).toHaveValue(email);

  await emailInput.fill("browser-invite-retry@example.invalid");
  await expect(page.getByRole("button",{name:"Send project invite"})).toBeVisible();
  await expect(page.locator("#project-invite-feedback")).toBeHidden();
});


test("Transparency publishes the external audit return and pending validation state",async({page})=>{
  await signIn(page);
  await openWorkspace(page,"Transparency");

  await expect(page.getByRole("heading",{name:"Audit library + public accountability record",exact:true})).toBeVisible();
  await expect(page.getByText(/EXTERNAL AUDIT RETURN · 25 SEP 2026/)).toBeVisible();
  await expect(page.getByText(/not a full production certification/i).first()).toBeVisible();
  await expect(page.getByText(/14 reported · 0 DataNest-validated\/closed/i)).toBeVisible();
  await expect(page.getByText("AUD-001",{exact:true})).toBeVisible();
  await expect(page.getByText("AUD-014",{exact:true})).toBeVisible();
  await expect(page.getByText("PENDING",{exact:true}).first()).toBeVisible();

  await page.getByRole("button",{name:"Open full audit return",exact:true}).click();
  await expect(page.getByLabel("Complete external audit return source artifact")).toContainText("Final assessment:");
  await expect(page.getByLabel("Complete external audit return source artifact")).toContainText("AUD-014");
  await expect(page.getByRole("button",{name:"Download exact Markdown",exact:true})).toBeVisible();
});


test("public Transparency index publishes the audit return without sign in",async({page})=>{
  const appPath=(process.env.DATANEST_APP_PATH||"/").replace(/\/?$/,"/");
  await page.goto(appPath+"transparency/index.html");

  await expect(page.getByRole("heading",{name:"Audit library + public accountability record",exact:true})).toBeVisible();
  await expect(page.getByText(/EXTERNAL AUDIT RETURN · 25 SEP 2026/)).toBeVisible();
  await expect(page.getByText(/14 findings/)).toBeVisible();
  await expect(page.getByRole("note",{name:"Audit coverage limitation"})).toContainText(/not a full production certification/i);
  await expect(page.getByRole("link",{name:"Findings JSON",exact:true})).toBeVisible();
  await expect(page.getByRole("link",{name:"Reported backlog JSON",exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Open full audit return",exact:true}).click();
  await expect(page.getByLabel("Complete external audit return source artifact")).toContainText("RESONANCE DATANEST / RONSAS - EXTERNAL AUDIT RETURN");
  await expect(page.getByLabel("Complete external audit return source artifact")).toContainText("AUD-014");
});


test("project membership blocks active duplicates and resends a pending invitation",async({page})=>{
  await signIn(page);

  const activeEmail="active-member@example.invalid";
  const pendingEmail="pending-member@example.invalid";
  const workspace={
    members:[{
      user_id:"11111111-1111-4111-8111-111111111111",
      email:activeEmail,
      role:"viewer",
      status:"active",
      created_at:"2026-09-26T12:00:00Z",
      updated_at:"2026-09-26T12:00:00Z",
      formal_voting_eligible:true
    }],
    invitations:[{
      id:"22222222-2222-4222-8222-222222222222",
      user_id:"33333333-3333-4333-8333-333333333333",
      email:pendingEmail,
      role:"operator",
      status:"invited",
      invited_by:"11111111-1111-4111-8111-111111111111",
      invited_at:"2026-09-26T12:00:00Z",
      expires_at:"2026-10-03T12:00:00Z",
      accepted_at:null,
      revoked_at:null
    }],
    active_formal_voter_count:1,
    can_invite:true,
    can_invite_admin:true,
    caller_role:"owner",
    boundaries:{}
  };

  await page.route("**/rest/v1/rpc/get_project_membership_workspace_v1",async route=>{
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(workspace)});
  });

  let inviteCalls=0;
  await page.route("**/functions/v1/send-project-member-invite",async route=>{
    inviteCalls++;
    await new Promise(resolve=>setTimeout(resolve,180));
    await route.fulfill({
      status:200,
      contentType:"application/json",
      body:JSON.stringify({
        ok:true,
        delivery:"reinvite",
        invitation:{id:"22222222-2222-4222-8222-222222222222"},
        formalVotingEligible:false,
        acceptanceRequired:true
      })
    });
  });

  await openWorkspace(page,"Governance");
  await page.getByText("Project members and invitations",{exact:true}).click();

  const emailInput=page.getByLabel("Invite email");
  await emailInput.fill(activeEmail);
  const activeButton=page.getByRole("button",{name:"Already active"});
  await expect(activeButton).toBeDisabled();
  await expect(page.locator("#project-invite-context")).toContainText("Already a member");
  expect(inviteCalls).toBe(0);

  await emailInput.fill(pendingEmail);
  const resend=page.getByRole("button",{name:"Resend project invite"});
  await expect(resend).toBeEnabled();
  await expect(page.locator("#project-invite-context")).toContainText("Invitation already pending");

  await resend.click();
  await expect(page.getByRole("button",{name:"Sending invite…"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Invite sent"})).toBeVisible();
  await expect(page.locator("#project-invite-feedback")).toContainText("Invitation resent to "+pendingEmail);
  await expect(emailInput).toHaveValue(pendingEmail);
  expect(inviteCalls).toBe(1);
});

test("project membership rows remain readable without horizontal overflow on mobile",async({page})=>{
  await signIn(page);
  await page.setViewportSize({width:390,height:844});

  await page.route("**/rest/v1/rpc/get_project_membership_workspace_v1",async route=>{
    await route.fulfill({
      status:200,
      contentType:"application/json",
      body:JSON.stringify({
        members:[{
          user_id:"11111111-1111-4111-8111-111111111111",
          email:"active-member@example.invalid",
          role:"viewer",
          status:"active",
          created_at:"2026-09-26T12:00:00Z",
          updated_at:"2026-09-26T12:00:00Z",
          formal_voting_eligible:true
        }],
        invitations:[],
        active_formal_voter_count:1,
        can_invite:true,
        can_invite_admin:true,
        caller_role:"owner",
        boundaries:{}
      })
    });
  });

  await openWorkspace(page,"Governance");
  await page.getByText("Project members and invitations",{exact:true}).click();

  const table=page.locator(".membershipTable").first();
  await expect(table).toBeVisible();
  const overflow=await table.evaluate(element=>element.scrollWidth-element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(table.locator('[data-label="Member"]')).toContainText("ID 11111111…1111");
});
