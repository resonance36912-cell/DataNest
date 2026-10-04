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

async function openAiSidebar(page:import("@playwright/test").Page){
  await openWorkspace(page,"DataNest AI");
  await selectPrimaryAiJob(page);
  const assistant=page.getByRole("button",{name:"AI assistant",exact:true});
  await expect(assistant).toBeVisible();
  await assistant.click();
  await expect(page.getByText("RETURN TO DATANEST")).toBeVisible();
  await expect(page.getByRole("button",{name:/^Open companion \+/})).toBeEnabled();
}

test("companion launch arms session auto-return when clipboard permission already exists",async({page,context})=>{
  await signIn(page);
  await context.grantPermissions(["clipboard-read","clipboard-write"],{
    origin:new URL(page.url()).origin
  });
  await openAiSidebar(page);

  page.on("popup",popup=>void popup.close());
  await page.getByRole("button",{name:/^Open companion \+/}).click();
  const response=page.getByPlaceholder(/Copy the completed external AI response/i);
  await expect(response).toBeEnabled();
  await expect(page.getByText("AUTO-RETURN ON",{exact:true})).toBeVisible();

  // Wrap the REAL clipboard read: observe both attempted and completed reads.
  await page.evaluate(()=>{
    const clipboard=navigator.clipboard;
    const readText=clipboard.readText.bind(clipboard);
    document.documentElement.dataset.clipboardStarts="0";
    document.documentElement.dataset.clipboardReads="0";
    Object.defineProperty(clipboard,"readText",{configurable:true,value:async()=>{
      document.documentElement.dataset.clipboardStarts=String(
        Number(document.documentElement.dataset.clipboardStarts||"0")+1
      );
      const text=await readText();
      document.documentElement.dataset.clipboardReads=String(
        Number(document.documentElement.dataset.clipboardReads||"0")+1
      );
      return text;
    }});
  });
  const handoff=page.locator("details.externalAiHandoff textarea");
  const handoffText=await handoff.inputValue();
  const traceMatch=handoffText.match(/Trace Key: (DN-[^\\n]+)/);
  if(!traceMatch)throw new Error("Active tracked trace key is required for clipboard capture.");
  const traceKey=traceMatch[1];
  const initial=traceKey+"\\nInitial governed clipboard response.";
  await page.evaluate(async text=>navigator.clipboard.writeText(text),initial);
  const readsBeforeReturn=Number(await page.locator("html").getAttribute("data-clipboard-reads")||"0");
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect.poll(async()=>Number(await page.locator("html").getAttribute("data-clipboard-reads"))).toBeGreaterThan(readsBeforeReturn);
  await expect(response).toHaveValue(initial);

  const edited="Initial governed clipboard response - reviewed and edited.";
  await response.fill(edited);
  const unrelated="Unrelated clipboard text copied after the edit.";
  await page.evaluate(async text=>navigator.clipboard.writeText(text),unrelated);
  const readsBeforeEditReturn=Number(await page.locator("html").getAttribute("data-clipboard-reads")||"0");
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect.poll(async()=>Number(await page.locator("html").getAttribute("data-clipboard-reads"))).toBeGreaterThan(readsBeforeEditReturn);
  await expect(response).toHaveValue(edited);

  await page.getByRole("button",{name:"Paste from clipboard",exact:true}).click();
  await expect(response).toHaveValue(unrelated);
  await page.getByRole("button",{name:"Turn off auto-return",exact:true}).click();
  await expect(page.getByRole("button",{name:"Enable session auto-return",exact:true})).toBeVisible();
  await response.fill("");
  const readCounts=await page.evaluate(()=>{
    const before=document.documentElement.dataset.clipboardStarts;
    window.dispatchEvent(new Event("focus"));
    return {before,after:document.documentElement.dataset.clipboardStarts};
  });
  expect(readCounts.after).toBe(readCounts.before);
  await expect(response).toHaveValue("");
});

test("switching jobs replaces the tracked handoff with the newly selected manifest",async({page})=>{
  await signIn(page);
  await openAiSidebar(page);

  page.on("popup",popup=>void popup.close());
  await page.getByRole("button",{name:/^Open companion \+/}).click();
  await expect(page.getByPlaceholder(/Copy the completed external AI response/i)).toBeEnabled();

  const handoff=page.locator("details.externalAiHandoff textarea");
  await expect(handoff).toHaveValue(/Job Manifest: JOB-\d+ \u00b7 DataNest AI E2E Job\n/);
  const jobSelect=page.getByRole("combobox",{name:/^Job Manifest/});
  const target=jobSelect.locator("option").filter({hasText:"DataNest AI E2E Job B"}).first();
  const switchJobId=await target.getAttribute("value");
  if(!switchJobId)throw new Error("DataNest AI E2E Job B fixture is required.");
  await jobSelect.selectOption(switchJobId);

  await expect(jobSelect).toHaveValue(switchJobId);
  await expect(handoff).toHaveValue(/Job Manifest: JOB-\d+ \u00b7 DataNest AI E2E Job B\n/);
  await expect(handoff).not.toHaveValue(/Job Manifest: JOB-\d+ \u00b7 DataNest AI E2E Job\n/);
  await expect(page.locator(".externalAiReturnDock textarea")).toBeDisabled();
  await expect(page.getByRole("button",{name:"Enable session auto-return",exact:true})).toBeDisabled();
});

test("provider launch keeps traced work out of the provider URL and sidebar resizing works by keyboard",async({page,context})=>{
  await page.setViewportSize({width:1600,height:1000});
  await signIn(page);
  await openAiSidebar(page);

  // Exercise the real popup URL while preventing contact with an external provider.
  await context.route("https://chatgpt.com/**",route=>route.fulfill({
    status:200,contentType:"text/html",body:"<!doctype html><title>Provider navigation fixture</title>"
  }));
  const popupReady=page.waitForEvent("popup");
  await page.getByRole("button",{name:/^Open companion \+/}).click();
  const popup=await popupReady;
  await popup.waitForURL(url=>url.hostname==="chatgpt.com");
  const providerUrl=new URL(popup.url());
  expect(providerUrl.searchParams.get("q")).toBeNull();
  expect(providerUrl.search).toBe("");
  expect(providerUrl.hash).toBe("");
  await popup.close();
  await page.bringToFront();

  await expect.poll(async()=>{
    const box=await page.locator("aside.externalAiDock").boundingBox();
    return box?Math.round(1600-(box.x+box.width)):Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(2);

  const handoff=page.locator("details.externalAiHandoff textarea");
  await expect(handoff).toHaveValue(/RESONANCE DATANEST — LIVE EXTERNAL AI HANDOFF/);
  await expect(handoff).toHaveValue(/\[DATANEST TRACKING HEADER\]/);
  await expect(handoff).toHaveValue(/Trace Key: DN-/);
  expect(await handoff.inputValue()).not.toContain(process.env.DATANEST_AI_E2E_EMAIL!);
  const dock=page.locator("aside.externalAiDock");
  const originalWidth=await dock.evaluate(element=>element.getBoundingClientRect().width);
  await page.getByRole("button",{name:"Widen AI sidebar",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect.poll(()=>dock.evaluate(element=>element.getBoundingClientRect().width)).toBe(originalWidth+40);
  await page.getByRole("button",{name:"Narrow AI sidebar",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect.poll(()=>dock.evaluate(element=>element.getBoundingClientRect().width)).toBe(originalWidth);
  await expect(page.locator(".externalAiReturnDock textarea")).toBeVisible();
});

test("each tracked companion launch re-arms auto-return only through that launch gesture",async({page,context})=>{
  await signIn(page);
  await context.grantPermissions(["clipboard-read","clipboard-write"],{
    origin:new URL(page.url()).origin
  });
  await openAiSidebar(page);
  page.on("popup",popup=>void popup.close());
  const launch=page.getByRole("button",{name:/^Open companion \+/});
  await launch.click();
  const response=page.locator(".externalAiReturnDock textarea");
  await expect(response).toBeEnabled();
  await page.bringToFront();
  await expect(page.getByText("AUTO-RETURN ON",{exact:true})).toBeVisible();
  const reviewed="Reviewed draft preserved while opening a fresh tracked session.";
  await response.fill(reviewed);
  const sessionLabel=page.locator(".externalAiReturnDock small");
  const previousSession=await sessionLabel.innerText();
  await launch.click();
  await expect(launch).toBeEnabled();
  await expect(sessionLabel).not.toHaveText(previousSession);
  await expect(page.getByText("AUTO-RETURN ON",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Turn off auto-return",exact:true})).toBeEnabled();
  await expect(response).toHaveValue(reviewed);
});

async function holdRealClipboardRead(
  page:import("@playwright/test").Page,
  context:import("@playwright/test").BrowserContext
){
  await signIn(page);
  await context.grantPermissions(["clipboard-read","clipboard-write"],{
    origin:new URL(page.url()).origin
  });
  await openAiSidebar(page);
  page.on("popup",popup=>void popup.close());
  await page.getByRole("button",{name:/^Open companion \+/}).click();
  const response=page.locator(".externalAiReturnDock textarea");
  await expect(response).toBeEnabled();
  await page.bringToFront();
  await expect(page.getByText("AUTO-RETURN ON",{exact:true})).toBeVisible();
  await response.fill("");
  // Delay only delivery of a REAL clipboard result; do not substitute its value.
  await page.evaluate(async()=>{
    await navigator.clipboard.writeText("Stale clipboard result from the previous capture context.");
    const readText=navigator.clipboard.readText.bind(navigator.clipboard);
    document.documentElement.dataset.heldClipboardReads="0";
    document.documentElement.dataset.releasedClipboardReads="0";
    Object.defineProperty(navigator.clipboard,"readText",{configurable:true,value:async()=>{
      const text=await readText();
      document.documentElement.dataset.heldClipboardReads=String(
        Number(document.documentElement.dataset.heldClipboardReads||"0")+1
      );
      await new Promise<void>(resolve=>window.addEventListener(
        "datanest:test-release-clipboard",()=>resolve(),{once:true}
      ));
      document.documentElement.dataset.releasedClipboardReads=String(
        Number(document.documentElement.dataset.releasedClipboardReads||"0")+1
      );
      return text;
    }});
    window.dispatchEvent(new Event("focus"));
  });
  await expect.poll(async()=>Number(await page.locator("html").getAttribute("data-held-clipboard-reads"))).toBeGreaterThan(0);
  return response;
}

async function releaseRealClipboardRead(page:import("@playwright/test").Page){
  await page.evaluate(async()=>{
    window.dispatchEvent(new Event("datanest:test-release-clipboard"));
    // Let promise continuations and React's rendered state settle, not just the event.
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  });
  await expect.poll(async()=>Number(await page.locator("html").getAttribute("data-released-clipboard-reads"))).toBeGreaterThan(0);
}

test("disabling auto-return discards an already pending clipboard result",async({page,context})=>{
  const response=await holdRealClipboardRead(page,context);
  await page.getByRole("button",{name:"Turn off auto-return",exact:true}).click();
  await expect(page.getByRole("button",{name:"Enable session auto-return",exact:true})).toBeVisible();
  await releaseRealClipboardRead(page);
  await expect(response).toHaveValue("");
});

for(const changedContext of ["Job","provider"] as const){
  test("a pending clipboard result is discarded after changing "+changedContext,async({page,context})=>{
    const response=await holdRealClipboardRead(page,context);
    if(changedContext==="Job"){
      const jobSelect=page.getByRole("combobox",{name:/^Job Manifest/});
      const option=jobSelect.locator("option").filter({hasText:"DataNest AI E2E Job B"}).first();
      const id=await option.getAttribute("value");
      if(!id)throw new Error("The second deterministic Job fixture is required.");
      await jobSelect.selectOption(id);
      await expect(jobSelect).toHaveValue(id);
    }else{
      await page.getByRole("combobox",{name:/^External AI/}).selectOption("gemini");
    }
    await expect(response).toBeDisabled();
    await releaseRealClipboardRead(page);
    await expect(response).toHaveValue("");
  });
}
