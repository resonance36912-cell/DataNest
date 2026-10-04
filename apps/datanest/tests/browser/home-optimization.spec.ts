import { expect, test } from "@playwright/test";

test.use({ timezoneId: "America/Los_Angeles" });

const appPath = process.env.DATANEST_APP_PATH || "/";

test("entry fits narrow and desktop screens and keeps sign-in usable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(appPath);
  await expect(page.getByLabel("Email")).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Your intent. Amplified." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Email").fill("layout@example.invalid");
    await expect(page.getByLabel("Email")).toHaveValue("layout@example.invalid");
  }
  expect(errors).toEqual([]);
});

test("keyboard skip link reaches email and motion preference persists", async ({ page }) => {
  await page.goto(appPath);
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to sign in" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Email")).toBeFocused();
  const motion = page.getByLabel("Motion preference", {exact:true});
  await expect(motion).toBeVisible({ timeout: 10000 });
  await motion.selectOption("reduced");
  await expect(motion).toHaveValue("reduced");
  expect(await page.locator("html").getAttribute("data-motion-paused")).toBe("true");
  expect(await page.locator(".orbitOuter").evaluate(el => getComputedStyle(el).animationPlayState)).toBe("paused");
  await page.reload();
  await expect(page.getByLabel("Motion preference", {exact:true})).toHaveValue("reduced");
  expect(await page.locator("html").getAttribute("data-motion-paused")).toBe("true");
  await motion.selectOption("full");
  await expect(motion).toHaveValue("full");
});

test("entry respects system reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(appPath);
  await expect(page.getByLabel("Email")).toBeVisible();
  expect(await page.locator(".orbitOuter").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
});

test("dashboard labels its sample and groups UTC days independently of local timezone", async ({ page }) => {
  // Isolated browser fixture: no real account or backend operations.
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  await page.clock.setFixedTime(new Date("2026-09-26T12:00:00Z"));
  await page.route("**/runtime-config.js", route => route.fulfill({ contentType: "application/javascript", body: "window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}" }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token: "fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});
  await page.route("https://fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE"};
    if (path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if (path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:20,active_jobs:5,running_jobs:1,blocked_jobs:2};
    if (path.endsWith("/jobs")) body = [
      {id:"1",status:"RUNNING",created_at:"2026-09-26T00:15:00Z"},
      {id:"2",status:"COMPLETED",created_at:"2026-09-25T23:45:00Z"}
    ];
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });
  await page.goto(appPath);
  await expect(page.getByRole("region", {name:"Current project intent"})).toBeVisible();
  await expect(page.getByLabel("DataNest workspace status", {exact:true})).toBeVisible();
  await expect(page.getByLabel("Current DataNest operating state")).toBeVisible();
  await expect(page.getByRole("heading", {name:"Recent creation signal"})).toBeVisible();
  await expect(page.getByText("LOADED SNAPSHOT · UTC")).toBeVisible();
  await expect(page.getByRole("img", {name:/Loaded jobs created/})).toHaveAttribute("aria-label", /2026-09-25 1, 2026-09-26 1/);
  await expect(page.locator(".pulseAxis b")).toHaveText(["0","0","0","0","0","1","1"]);
  await expect(page.getByText(/2 latest loaded jobs/)).toBeVisible();
  await expect(page.getByRole("button", {name:"Viewer mode"})).toBeDisabled();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test("dashboard follows workspace width when the AI rail is resized", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";

  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token: "fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
    localStorage.setItem("datanest.aiSidebar.open", "true");
  }, {userId});
  await page.route("https://fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE"};
    if (path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if (path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:20,active_jobs:5,running_jobs:1,blocked_jobs:2};
    if (path.endsWith("/jobs")) body = [
      {id:"1",job_number:1,title:"Fixture job",description:null,priority:50,status:"RUNNING",required_capabilities:[],acceptance:{},created_at:"2026-09-26T00:15:00Z",updated_at:"2026-09-26T00:15:00Z"},
      {id:"2",job_number:2,title:"Fixture complete",description:null,priority:40,status:"COMPLETED",required_capabilities:[],acceptance:{},created_at:"2026-09-25T23:45:00Z",updated_at:"2026-09-25T23:45:00Z"}
    ];
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  await page.goto(appPath);
  await expect(page.getByRole("button", {name:"Hide AI"})).toBeVisible();
  await expect(page.locator(".externalAiDock")).toBeVisible();
  await expect(page.locator(".resonanceHome .aiIHero")).toBeVisible();

  const readLayout = () => page.evaluate(() => {
    const rect = (selector:string) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error("Missing "+selector);
      const box = element.getBoundingClientRect();
      return {x:box.x,y:box.y,width:box.width,height:box.height,right:box.right,bottom:box.bottom};
    };
    return {
      main: rect(".mainPane"),
      content: rect(".contentPane"),
      hero: rect(".resonanceHome .aiIHero"),
      copy: rect(".resonanceHome .aiIHeroCopy"),
      core: rect(".resonanceHome .aiICoreStage"),
      dock: rect(".externalAiDock"),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    };
  });

  const wide = await readLayout();
  expect(wide.main.width).toBeGreaterThan(980);
  expect(wide.core.x).toBeLessThan(wide.copy.x);
  expect(wide.hero.x).toBeGreaterThanOrEqual(wide.content.x - 1);
  expect(wide.hero.right).toBeLessThanOrEqual(wide.content.right + 1);
  expect(wide.scrollWidth).toBeLessThanOrEqual(wide.viewportWidth);

  const widen = page.getByRole("button", {name:"Widen AI sidebar"});
  for (let index = 0; index < 7; index += 1) await widen.click();

  const narrow = await readLayout();
  // Allow border/subpixel rounding around the 760px rail target.
  expect(narrow.dock.width).toBeGreaterThanOrEqual(755);
  expect(narrow.main.width).toBeLessThanOrEqual(980);
  expect(narrow.core.y).toBeGreaterThanOrEqual(narrow.copy.bottom - 2);
  expect(narrow.hero.x).toBeGreaterThanOrEqual(narrow.content.x - 1);
  expect(narrow.hero.right).toBeLessThanOrEqual(narrow.content.right + 1);
  expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.viewportWidth);
});


test("workflow shell guides execution forward and preserves browser history", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token: "fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});
  await page.route("https://fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    if (path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if (path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  await page.goto(appPath);
  await expect(page.getByRole("heading",{name:"Find your next meaningful step."})).toBeVisible({timeout:20000});
  await page.goto(appPath+"?view=unifi");
  await expect(page.locator(".topbar h1")).toHaveText("UNIFI Planner",{timeout:20000});
  await expect(page.locator(".topbar .eyebrow")).toContainText("EXECUTE");
  await expect(page.getByText(/Suggested next: TranScheduler/)).toBeVisible();

  const aiNav = page.locator(".navGroup button.aiHeroNav", {hasText:"DataNest AI"});
  await expect(aiNav).toBeVisible();
  expect(await aiNav.evaluate(el => getComputedStyle(el, "::after").content)).toContain("COMMAND");

  await page.getByRole("button", {name:"Continue · TranScheduler →"}).click();
  await expect(page).toHaveURL(/\?view=scheduler/);
  await expect(page.locator(".topbar h1")).toHaveText("TranScheduler");
  await expect(page.getByRole("button", {name:"← UNIFI Planner"})).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\?view=unifi/);
  await expect(page.locator(".topbar h1")).toHaveText("UNIFI Planner");
});


test("dashboard recommends operational attention from live project state", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token: "fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    if (path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if (path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:7,active_jobs:3,running_jobs:0,blocked_jobs:2,available_capabilities:2,registered_capabilities:3};
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  await page.goto(appPath);
  await expect(page.getByText("STATE-AWARE")).toBeVisible();
  await expect(page.getByText(/Suggested next: TranScheduler · 2 blocked Jobs need scheduling attention/)).toBeVisible();
  await page.getByRole("button", {name:"Continue · TranScheduler →"}).click();
  await expect(page).toHaveURL(/\?view=scheduler/);
  await expect(page.locator(".topbar h1")).toHaveText("TranScheduler");
});

async function openJourneyFixture(page: import('@playwright/test').Page) {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  await page.route("**/runtime-config.js", route => route.fulfill({contentType:"application/javascript",body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"}));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,refresh_token:"fixture",token_type:"bearer",expires_at:4102444800,user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}}));
  }, {userId});
  await page.route("https://fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if(path.endsWith("/projects")) body={id:projectId,slug:"resonance-datanest",name:"Journey fixture",description:null,status:"ACTIVE"};
    if(path.endsWith("/project_members")) body={project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if(path.endsWith("/get_project_dashboard_summary")) body={total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0};
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });
  await page.goto(appPath);
  await expect(page.getByRole("heading",{name:"Find your next meaningful step."})).toBeVisible();
}

test("purpose guide previews each stage and opens the correct workspace without mutations", async ({page}) => {
  await openJourneyFixture(page);
  const mutations: string[]=[];
  page.on("request", request => {
    if(request.method()==="POST" && /\/rpc\/(create_|cast_|ratify_|close_|update_)/.test(request.url())) mutations.push(request.url());
  });
  for(const [label, action, view, title] of [
    ["Discover","Explore Think Tanks","thinktank","Think Tanks"],
    ["Govern","Review governance","governance","Governance"],
    ["Build","Explore products","products","Products"],
    ["Execute","Open UNIFI Planner","unifi","UNIFI Planner"],
    ["Verify","Review transparency","transparency","Transparency"]
  ]) {
    await page.getByRole("tab",{name:label,exact:true}).click();
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await expect(page).not.toHaveURL(/view=/);
    await page.getByRole("button",{name:action,exact:true}).click();
    await expect(page).toHaveURL(new RegExp("view="+view));
    await expect(page.getByRole("heading",{name:title,level:1,exact:true})).toBeFocused();
    await page.getByRole("navigation",{name:"Project workspaces"}).getByRole("button",{name:"AI & I",exact:true}).click();
    await expect(page.getByRole("heading",{name:"AI & I",level:1,exact:true})).toBeFocused();
  }
  expect(mutations).toEqual([]);
});

test("purpose guide supports keyboard, compact layouts, and browser history", async ({page}) => {
  await openJourneyFixture(page);
  await page.getByRole("tab",{name:"Discover",exact:true}).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab",{name:"Govern",exact:true})).toBeFocused();
  await expect(page.getByRole("tab",{name:"Govern",exact:true})).toHaveAttribute("aria-selected","true");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab",{name:"Verify",exact:true})).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab",{name:"Discover",exact:true})).toBeFocused();
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    await expect(page.getByRole("button",{name:"Explore Think Tanks",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole("button",{name:"Explore Think Tanks",exact:true}).click();
  await page.goBack();
  await expect(page.getByRole("heading",{name:"AI & I",level:1,exact:true})).toBeFocused();
  await page.goForward();
  await expect(page.getByRole("heading",{name:"Think Tanks",level:1,exact:true})).toBeFocused();
  await page.getByRole("button",{name:/Quick switch/}).click();
  await page.getByRole("searchbox",{name:"Search DataNest workspaces"}).fill("governance");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading",{name:"Governance",level:1,exact:true})).toBeFocused();
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("searchbox",{name:"Search DataNest workspaces"})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button",{name:/Quick switch/})).toBeFocused();
});

test("workspace arrivals honor paused and reduced motion without hiding content", async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await openJourneyFixture(page);
  expect(await page.locator(".workspaceArrival").evaluate(el=>getComputedStyle(el).animationName)).toBe("none");
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.locator(".workspaceOptions > summary").click();
  const motion = page.getByLabel("Motion preference",{exact:true});
  await expect(motion).toBeVisible({ timeout: 10000 });
  await motion.selectOption("reduced");
  await expect(motion).toHaveValue("reduced");
  await page.locator(".workspaceOptions > summary").click();
  await page.getByRole("tab",{name:"Execute",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Give the next step a shape."})).toBeVisible();
  await page.getByRole("button",{name:"Open UNIFI Planner",exact:true}).click();
  expect(await page.locator(".workspaceArrival").evaluate(el=>getComputedStyle(el).animationName)).toBe("none");
  expect(await page.locator(".workspaceArrival").evaluate(el=>getComputedStyle(el).opacity)).toBe("1");
});


test("empty operational workspaces offer direct recovery paths", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token: "fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    if (path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if (path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=scheduler");
  await expect(page.getByRole("heading", {name:"No project jobs yet"})).toBeVisible();
  await page.getByRole("button", {name:"Open UNIFI Planner"}).click();
  await expect(page).toHaveURL(/\?view=unifi/);

  await page.goto(appPath+"?view=runs");
  await expect(page.getByRole("heading", {name:"No execution runs yet"})).toBeVisible();
  await page.getByRole("button", {name:"Open TranScheduler"}).click();
  await expect(page).toHaveURL(/\?view=scheduler/);

  await page.goto(appPath+"?view=checkpoints");
  await expect(page.getByRole("heading", {name:"No checkpoints yet"})).toBeVisible();
  await page.getByRole("button", {name:"Open Runs"}).click();
  await expect(page).toHaveURL(/\?view=runs/);

  await page.goto(appPath+"?view=audit");
  await expect(page.getByRole("heading", {name:"No audit events yet"})).toBeVisible();
  await page.getByRole("button", {name:"Open Checkpoints"}).click();
  await expect(page).toHaveURL(/\?view=checkpoints/);
});


test("specialist phase rail preserves lifecycle orientation", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token: "fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    if (path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if (path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:1,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=governance");
  const rail = page.getByRole("navigation", {name:"DataNest lifecycle phases"});
  await expect(rail).toBeVisible();
  await expect(page.getByRole("button", {name:"Govern phase · current"})).toHaveAttribute("aria-current","step");

  await page.getByRole("button", {name:"Go to Execute phase"}).click();
  await expect(page).toHaveURL(/\?view=unifi/);
  await expect(page.locator(".topbar h1")).toHaveText("UNIFI Planner");
  await expect(page.getByRole("button", {name:"Execute phase · current"})).toHaveAttribute("aria-current","step");

  await page.getByRole("button", {name:/AI CORE/}).click();
  await expect(page).toHaveURL(/\?view=ai/);
  await expect(page.locator(".topbar h1")).toHaveText("DataNest AI");
  await expect(page.getByRole("button", {name:/AI CORE/})).toHaveAttribute("aria-current","page");

  await page.setViewportSize({width:390,height:844});
  await expect(rail).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test("workspace context is phase-safe and wraps long project identity at 320px", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const longProjectName = "Resonance DataNest governed transformation programme with a deliberately long project identity for narrow-screen verification";

  await page.setViewportSize({width:320,height:844});
  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token: "fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});
  await page.route("https://fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:longProjectName,description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    if (path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if (path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=external_auditor");
  const workspaceMeta = page.locator(".topbarMeta");
  await expect(workspaceMeta).toContainText(longProjectName);
  await expect(workspaceMeta).toContainText("ACTIVE");
  await expect(page.getByRole("navigation", {name:"DataNest lifecycle phases"}).locator('[aria-current="step"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.goto(appPath+"?view=governance");
  await expect(page.getByRole("button", {name:"Govern phase · current"})).toHaveAttribute("aria-current","step");
  await expect(page.locator(".topbarMeta")).toContainText("GOVERN");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


// Integration gate: value-network capability nodes must remain subordinate to the DataNest AI core.
test("AI & I keeps DataNest AI at the core while governed products stay product nodes", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const ronsasId = "24f2fa75-18b8-5b45-b624-b5dab381de9e";
  const aurumId = "00000000-0000-4000-8000-000000000777";

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture",token_type:"bearer",expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  const products = [
    {id:ronsasId,slug:"ronsas",name:"RONSAS",full_name:"Resonance Open Nova Application Suite",category:"sovereign application suite",lifecycle_status:"active development and integration",mission:"Governed suite",operating_model:"DataNest managed",primary_runtime:"Windows local environment",commercial_mode:"free promotion / no billing until pricing is established",billing_enabled:false,as_of_date:"2026-09-26",metadata:{execution_authority:"DataNest"}},
    {id:aurumId,slug:"aurum",name:"Aurum Naturals",full_name:"Resonance Aurum Naturals",category:"governed product",lifecycle_status:"active",mission:"Governed product",operating_model:"DataNest managed",primary_runtime:"managed",commercial_mode:"free promotion / no billing until pricing is established",billing_enabled:false,as_of_date:"2026-09-26",metadata:{execution_authority:"DataNest"}}
  ];
  const applications = Array.from({length:9},(_,index)=>({
    id:"00000000-0000-4000-8000-"+String(400+index).padStart(12,"0"),
    product_id:ronsasId,
    record_type:"application",
    code:"APP-"+String(index+1).padStart(2,"0"),
    name:"RONSAS App "+String(index+1),
    status:"active",
    sort_order:index+1,
    payload:index===0?{domain:"creative",description:"Primary governed creative application"}:{}
  }));

  await page.route("https://fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if(path.endsWith("/projects")) body={id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:"2026-09-26T00:00:00Z"};
    if(path.endsWith("/project_members")) body={project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if(path.endsWith("/get_project_dashboard_summary")) body={total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if(path.endsWith("/jobs")) body=[];
    if(path.endsWith("/products")) body=products;
    if(path.endsWith("/product_records")) body=applications;
    return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
  });

  await page.setViewportSize({width:1440,height:900});
  await page.goto(appPath);

  const visual=page.locator(".resonanceHome .aiICoreStage");
  await expect(visual).toHaveAttribute("data-hero-ecosystem","ronsas");
  await expect(visual.getByText("DataNest AI",{exact:true})).toBeVisible();
  await expect(visual.getByText("Resonance Open Nova Sovereign Application Suite",{exact:true})).toBeVisible();
  await expect(visual.locator("b").filter({hasText:/^RONSAS$/})).toBeVisible();
  await expect(visual.getByText("Aurum Naturals",{exact:true})).toBeVisible();
  await expect(visual.getByText("9 applications",{exact:true})).toBeVisible();
  await expect(visual.getByText("0 applications",{exact:true})).toBeVisible();
  const ronsasNode=visual.getByRole("button",{name:"Open RONSAS applications in Products"});
  await expect(ronsasNode).toBeVisible();
  await expect(ronsasNode.getByText("creative",{exact:true})).toBeVisible();
  await expect(ronsasNode.getByText("RONSAS App 1",{exact:true})).toBeVisible();
  await expect(ronsasNode.getByText("active",{exact:true})).toBeVisible();
  await expect(visual.getByText("GOVERNED PRODUCT",{exact:true})).toHaveCount(0);
  await expect(visual).toHaveAttribute("aria-label",/DataNest AI core.*RONSAS, 9 applications.*Aurum Naturals, 0 applications/);

  const network=visual.getByLabel("Resonance DataNest value network");
  await expect(network).toBeVisible();
  await expect(network.locator('[data-value="sovereign-app-suite"]')).toContainText("Sovereign App Suite");
  const aiCorePulse=visual.locator('[data-hero-signal="ai-core"]');
  const ecosystemSweep=visual.locator('[data-hero-signal="ecosystem-sweep"]');
  expect(await aiCorePulse.evaluate(el=>getComputedStyle(el).animationName)).toContain("portfolioAiPulse");
  expect(await ecosystemSweep.evaluate(el=>getComputedStyle(el).animationName)).toContain("portfolioEcosystemPulse");
  for(const label of ["Governed AI","Certified Memory","Traceable Collaboration","Sovereign App Suite"]){
    await expect(network.getByText(label,{exact:true})).toBeVisible();
  }
  expect(await network.locator("[data-signal='ai']").evaluate(el=>getComputedStyle(el).animationName)).not.toBe("none");
  expect(await network.locator("[data-signal='memory']").evaluate(el=>getComputedStyle(el).animationName)).not.toBe("none");
  expect(await network.locator("[data-signal='ronsas']").evaluate(el=>getComputedStyle(el).animationName)).not.toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await network.evaluate(el=>getComputedStyle(el).getPropertyValue("--network-x").trim())).toBe("86px");
  expect(await network.evaluate(el=>getComputedStyle(el).getPropertyValue("--network-y").trim())).toBe("82px");

  await page.emulateMedia({reducedMotion:"reduce"});
  expect(await network.locator("[data-signal='ai']").evaluate(el=>getComputedStyle(el).animationName)).toBe("none");
  expect(await aiCorePulse.evaluate(el=>getComputedStyle(el).animationName)).toBe("none");
  expect(await ecosystemSweep.evaluate(el=>getComputedStyle(el).animationName)).toBe("none");

  await ronsasNode.click();
  await expect(page).toHaveURL(/view=products/);
  await expect(page).toHaveURL(/product=ronsas/);
  await expect(page).toHaveURL(/recordType=application/);
  await expect(page).toHaveURL(/q=RONSAS(\+|%20)App(\+|%20)1/);
});


test("active work context survives handoffs and focuses related operational evidence", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const jobId = "00000000-0000-4000-8000-000000000099";
  const otherJobId = "00000000-0000-4000-8000-000000000100";
  const stamp = "2026-09-27T05:00:00Z";
  const jobs = [
    {id:jobId,job_number:42,title:"Persistent context fixture",description:"Active handoff fixture",priority:80,status:"READY",required_capabilities:["chat"],acceptance:{},created_at:stamp,updated_at:stamp,deadline:null},
    {id:otherJobId,job_number:43,title:"Other visible project work",description:"Must remain visible",priority:50,status:"QUEUED",required_capabilities:["chat"],acceptance:{},created_at:stamp,updated_at:stamp,deadline:null}
  ];

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({projectId,userId,jobId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token: "fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
    sessionStorage.setItem("datanest.activeWorkContext:"+projectId+":"+userId, JSON.stringify({
      jobId, sessionId:"session-fixture", jobNumber:42, title:"Persistent context fixture", status:"READY"
    }));
  }, {projectId,userId,jobId});

  await page.route("https://fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:stamp};
    if (path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if (path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:2,active_jobs:2,running_jobs:1,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if (path.endsWith("/jobs")) body = jobs;
    if (path.endsWith("/runs")) body = [
      {id:"run-active",job_id:jobId,run_number:8,connector_kind:"chat",status:"RUNNING",started_at:stamp,completed_at:null,error_category:null},
      {id:"run-other",job_id:otherJobId,run_number:7,connector_kind:"chat",status:"COMPLETED",started_at:stamp,completed_at:stamp,error_category:null}
    ];
    if (path.endsWith("/checkpoints")) body = [
      {id:"checkpoint-active",job_id:jobId,completed:["Context preserved"],remaining:["Validate evidence"],resume_instruction:"Resume the active Job.",created_at:stamp},
      {id:"checkpoint-other",job_id:otherJobId,completed:["Other work"],remaining:[],resume_instruction:null,created_at:stamp}
    ];
    if (path.endsWith("/events")) body = [
      {id:8,job_id:jobId,event_type:"job_context_verified",actor:"fixture@example.invalid",payload:{source:"active-context"},created_at:stamp},
      {id:7,job_id:otherJobId,event_type:"job_updated",actor:"fixture@example.invalid",payload:{source:"other-work"},created_at:stamp}
    ];
    return route.fulfill({contentType:"application/json",headers:{"Content-Range":"0-1/2"},body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=unifi");
  const context = page.getByRole("region", {name:"Active work context"});
  await expect(context).toBeVisible();
  await expect(context.getByText("JOB-00042",{exact:true})).toBeVisible();
  await expect(context.getByText("Persistent context fixture",{exact:true})).toBeVisible();
  await expect(context.getByText("AI session linked",{exact:true})).toBeVisible();
  await expect(context.getByRole("status",{name:"Visible evidence signal"})).toContainText("Job evidence visible");
  await expect(context.getByRole("status",{name:"Visible evidence signal"})).toContainText("On this page: 1 matching prepared Job record.");
  await expect(context.getByRole("navigation",{name:"Active Job journey"}).getByRole("button",{name:"Plan · current Job view"})).toBeVisible();
  await context.getByRole("button",{name:/Jump to visible evidence/}).click();
  await expect(page.locator(".manifestCard[data-active-context='true']")).toBeFocused();

  await expect(context.getByText("Carry this Job into capability-aware execution planning.",{exact:true})).toBeVisible();
  await context.getByRole("button",{name:"Schedule active Job"}).click();
  await expect(page).toHaveURL(/\?view=scheduler/);
  await expect(page.locator(".ganttRow")).toHaveCount(2);
  await expect(page.locator(".ganttRow[data-active-context='true']")).toHaveCount(1);
  await expect(page.locator(".ganttRow[data-active-context='true']").getByText("ACTIVE CONTEXT",{exact:true})).toBeVisible();
  await expect(page.getByText("Other visible project work",{exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"Active work context"}).getByRole("status",{name:"Visible evidence signal"})).toContainText("On this page: 1 matching Job record.");
  await expect(page.getByRole("navigation",{name:"Active Job journey"}).getByRole("button",{name:"Schedule · current Job view"})).toBeVisible();
  await page.getByRole("region",{name:"Active work context"}).getByRole("button",{name:/Jump to visible evidence/}).click();
  await expect(page.locator(".ganttRow[data-active-context='true']")).toBeFocused();

  await page.reload();
  await expect(page.getByRole("region",{name:"Active work context"})).toBeVisible();
  await expect(page.locator(".ganttRow[data-active-context='true']")).toHaveCount(1);

  await page.getByRole("group",{name:"TranScheduler view"}).getByRole("button",{name:"Queue"}).click();
  await page.locator(".schedulerFilterDesktop").getByRole("button",{name:"QUEUED",exact:true}).click();
  await page.getByLabel("Sort project jobs").selectOption("recent");
  await expect(page).toHaveURL(/mode=queue/);
  await expect(page).toHaveURL(/filter=QUEUED/);
  await expect(page).toHaveURL(/sort=recent/);
  await page.reload();
  await expect(page.getByRole("group",{name:"TranScheduler view"}).getByRole("button",{name:"Queue"})).toHaveAttribute("aria-pressed","true");
  await expect(page.locator(".schedulerFilterDesktop").getByRole("button",{name:"QUEUED",exact:true})).toHaveClass(/active/);
  await expect(page.getByLabel("Sort project jobs")).toHaveValue("recent");
  await expect(page.locator(".schedulerRow[data-active-context='true']")).toHaveCount(0);
  await expect(page.getByText("Other visible project work",{exact:true})).toBeVisible();
  await page.getByRole("region",{name:"Active work context"}).getByRole("button",{name:/Jump to visible evidence/}).click();
  await expect(page.getByRole("group",{name:"TranScheduler view"}).getByRole("button",{name:"Gantt chart"})).toHaveAttribute("aria-pressed","true");
  await expect(page).not.toHaveURL(/mode=queue/);
  await expect(page).not.toHaveURL(/filter=QUEUED/);
  await expect(page).toHaveURL(/sort=recent/);
  await expect(page.locator(".ganttRow[data-active-context='true']")).toBeFocused();
  await expect(page.getByText("Active Job revealed in TranScheduler.",{exact:true})).toBeVisible();

  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole("region",{name:"Active work context"}).getByRole("button",{name:"Review active Job runs"}).click();
  await expect(page).toHaveURL(/\?view=runs/);
  await expect(page.locator(".dataRow:not(.headerRow)")).toHaveCount(2);
  await expect(page.locator(".dataRow[data-active-context='true']")).toHaveCount(1);
  await expect(page.getByRole("region",{name:"Active work context"}).getByRole("status",{name:"Visible evidence signal"})).toContainText("On this page: 1 matching run.");
  await page.getByRole("region",{name:"Active work context"}).getByRole("button",{name:/Jump to visible evidence/}).click();
  await expect(page.locator(".dataRow[data-active-context='true']")).toBeFocused();
  const jobJourney = page.getByRole("navigation",{name:"Active Job journey"});
  await expect(jobJourney.getByRole("button",{name:"Run · current Job view"})).toBeVisible();

  await jobJourney.getByRole("button",{name:"Open Checkpoint for active Job"}).click();
  await expect(page).toHaveURL(/\?view=checkpoints/);
  await expect(page.getByRole("region",{name:"Active work context"})).toBeVisible();
  await expect(page.locator(".checkpointCard")).toHaveCount(2);
  await expect(page.locator(".checkpointCard[data-active-context='true']")).toHaveCount(1);
  await expect(page.getByRole("region",{name:"Active work context"}).getByRole("status",{name:"Visible evidence signal"})).toContainText("On this page: 1 matching checkpoint.");
  await page.getByRole("region",{name:"Active work context"}).getByRole("button",{name:/Jump to visible evidence/}).click();
  await expect(page.locator(".checkpointCard[data-active-context='true']")).toBeFocused();
  await expect(page.getByRole("navigation",{name:"Active Job journey"}).getByRole("button",{name:"Checkpoint · current Job view"})).toBeVisible();

  await page.getByRole("navigation",{name:"Active Job journey"}).getByRole("button",{name:"Open Audit for active Job"}).click();
  await expect(page).toHaveURL(/\?view=audit/);
  await expect(page.getByRole("region",{name:"Active work context"})).toBeVisible();
  await expect(page.locator(".timelineItem")).toHaveCount(2);
  await expect(page.locator(".timelineItem[data-active-context='true']")).toHaveCount(1);
  await expect(page.getByText("other-work",{exact:false})).toBeVisible();
  await expect(page.getByRole("region",{name:"Active work context"}).getByRole("status",{name:"Visible evidence signal"})).toContainText("On this page: 1 matching audit event.");
  await page.getByRole("region",{name:"Active work context"}).getByRole("button",{name:/Jump to visible evidence/}).click();
  await expect(page.locator(".timelineItem[data-active-context='true']")).toBeFocused();
  await expect(page.getByRole("navigation",{name:"Active Job journey"}).getByRole("button",{name:"Audit · current Job view"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Active work context"}).getByRole("button",{name:"Review transparency evidence"})).toBeVisible();

  await page.getByRole("button",{name:"Clear context"}).click();
  await expect(page.getByRole("region",{name:"Active work context"})).toBeHidden();
  await expect(page.locator("[data-active-context='true']")).toHaveCount(0);
  expect(await page.evaluate(({projectId,userId}) => sessionStorage.getItem("datanest.activeWorkContext:"+projectId+":"+userId), {projectId,userId})).toBeNull();
});


test("active Job locator crosses paginated Scheduler pages without filtering project data", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const activeJobId = "00000000-0000-4000-8000-000000000099";
  const stamp = "2026-09-27T06:00:00Z";
  const makeJob = (index:number) => ({
    id:index===20?activeJobId:"00000000-0000-4000-8000-"+String(index+1).padStart(12,"0"),
    job_number:index+1,
    title:index===20?"Off-page active Job":"Visible filler Job "+String(index+1),
    description:null,
    priority:100-index,
    status:index===20?"READY":"QUEUED",
    required_capabilities:["chat"],
    acceptance:{},
    created_at:stamp,
    updated_at:stamp,
    deadline:null
  });
  const allJobs = Array.from({length:21},(_,index)=>makeJob(index));
  let locatorSawSecondPage = false;

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({projectId,userId,activeJobId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
    sessionStorage.setItem("datanest.activeWorkContext:"+projectId+":"+userId, JSON.stringify({
      jobId:activeJobId, sessionId:"session-off-page", jobNumber:21, title:"Off-page active Job", status:"READY"
    }));
  }, {projectId,userId,activeJobId});

  await page.route("https://fixture.supabase.co/**", route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown = [];
    const headers:Record<string,string> = {"Content-Type":"application/json"};
    if (path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:stamp};
    if (path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if (path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:21,active_jobs:21,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if (path.endsWith("/jobs")) {
      const range = request.headers()["range"] || "";
      const match = range.match(/(\d+)-(\d+)/);
      const offset = Number(url.searchParams.get("offset") || (match ? match[1] : "0"));
      const limit = Number(url.searchParams.get("limit") || (match ? String(Number(match[2])-Number(match[1])+1) : "20"));
      const from = Number.isFinite(offset) ? offset : 0;
      const to = from + (Number.isFinite(limit) ? limit : 20) - 1;
      const selected = allJobs.slice(from,Math.min(to+1,allJobs.length));
      const select = url.searchParams.get("select") || "";
      if(select==="id,status"&&from===20) locatorSawSecondPage = true;
      body = select==="id,status" ? selected.map(job=>({id:job.id,status:job.status})) : selected;
      headers["Content-Range"] = selected.length ? from+"-"+String(from+selected.length-1)+"/21" : "*/21";
    }
    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=scheduler");
  const context = page.getByRole("region",{name:"Active work context"});
  await expect(context).toBeVisible();
  await expect(context.getByRole("status",{name:"Visible evidence signal"})).toContainText("Job evidence not visible");
  await expect(page.locator(".ganttRow[data-active-context='true']")).toHaveCount(0);
  await expect(page.getByText("Visible filler Job 1",{exact:true})).toBeVisible();

  await context.getByRole("button",{name:"Locate active Job page →"}).click();

  await expect(page.locator(".ganttRow[data-active-context='true']")).toHaveCount(1);
  await expect(page.locator(".ganttRow[data-active-context='true']")).toBeFocused();
  await expect(page).toHaveURL(/\?view=scheduler&(?:[^#]*&)?page=2(?:&|$)/);
  expect(locatorSawSecondPage).toBe(true);
  await expect(page.locator(".ganttRow[data-active-context='true']").getByText("Off-page active Job",{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator(".ganttRow[data-active-context='true']")).toHaveCount(1);
  await expect(page).toHaveURL(/\?view=scheduler&(?:[^#]*&)?page=2(?:&|$)/);
  await page.getByRole("region",{name:"Active work context"}).getByRole("button",{name:"Review active Job runs"}).click();
  await expect(page).toHaveURL(/\?view=runs/);
  await page.goBack();
  await expect(page).toHaveURL(/\?view=scheduler&(?:[^#]*&)?page=2(?:&|$)/);
  await expect(page.locator(".ganttRow[data-active-context='true']")).toHaveCount(1);
  await expect(page.locator(".ganttRow[data-active-context='true']").getByText("Off-page active Job",{exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"Active work context"}).getByRole("status",{name:"Visible evidence signal"})).toContainText("On this page: 1 matching Job record.");
});


test("active evidence locator crosses paginated Runs, Checkpoints, and Audit", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const activeJobId = "00000000-0000-4000-8000-000000000099";
  const otherJobId = "00000000-0000-4000-8000-000000000100";
  const stamp = "2026-09-27T07:00:00Z";
  const scans = {runs:false,checkpoints:false,audit:false};
  const mutations:string[] = [];

  const jobs = [
    {id:activeJobId,job_number:52,title:"Deep evidence active Job",description:null,priority:90,status:"READY",required_capabilities:["chat"],acceptance:{},created_at:stamp,updated_at:stamp,deadline:null},
    {id:otherJobId,job_number:53,title:"Other evidence Job",description:null,priority:40,status:"QUEUED",required_capabilities:["chat"],acceptance:{},created_at:stamp,updated_at:stamp,deadline:null}
  ];
  const runs = Array.from({length:21},(_,index)=>({
    id:"run-"+String(index+1),
    job_id:index===20?activeJobId:otherJobId,
    run_number:index+1,
    connector_kind:"chat",
    status:index===20?"RUNNING":"COMPLETED",
    started_at:new Date(Date.parse(stamp)-index*1000).toISOString(),
    completed_at:index===20?null:stamp,
    error_category:null
  }));
  const checkpoints = Array.from({length:21},(_,index)=>({
    id:"checkpoint-"+String(index+1),
    job_id:index===20?activeJobId:otherJobId,
    completed:index===20?["Recovered paginated context"]:["Other checkpoint"],
    remaining:index===20?["Verify downstream continuity"]:[],
    resume_instruction:index===20?"Resume deep evidence context.":null,
    created_at:new Date(Date.parse(stamp)-index*1000).toISOString()
  }));
  const events = Array.from({length:21},(_,index)=>({
    id:index+1,
    job_id:index===20?activeJobId:otherJobId,
    event_type:index===20?"active_evidence_recovered":"other_evidence_event",
    actor:"fixture@example.invalid",
    payload:{index,kind:index===20?"active":"other"},
    created_at:new Date(Date.parse(stamp)-index*1000).toISOString()
  }));

  const pageSlice = <T,>(request:import("@playwright/test").Request, rows:T[]) => {
    const url = new URL(request.url());
    const range = request.headers()["range"] || "";
    const match = range.match(/(\d+)-(\d+)/);
    const offset = Number(url.searchParams.get("offset") || (match ? match[1] : "0"));
    const limit = Number(url.searchParams.get("limit") || (match ? String(Number(match[2])-Number(match[1])+1) : "20"));
    const from = Number.isFinite(offset) ? offset : 0;
    const size = Number.isFinite(limit) ? limit : 20;
    return {from,selected:rows.slice(from,Math.min(from+size,rows.length)),select:url.searchParams.get("select") || ""};
  };

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({projectId,userId,activeJobId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
    sessionStorage.setItem("datanest.activeWorkContext:"+projectId+":"+userId, JSON.stringify({
      jobId:activeJobId,sessionId:"session-deep-evidence",jobNumber:52,title:"Deep evidence active Job",status:"READY"
    }));
  }, {projectId,userId,activeJobId});

  await page.route("https://fixture.supabase.co/**", route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (["/runs","/checkpoints","/events"].some(suffix=>path.endsWith(suffix)) && request.method()!=="GET") {
      mutations.push(request.method()+" "+path);
    }
    let body:unknown = [];
    if(path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:stamp};
    if(path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if(path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:2,active_jobs:2,running_jobs:1,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if(path.endsWith("/jobs")) body = jobs;
    if(path.endsWith("/runs")) {
      const {from,selected,select}=pageSlice(request,runs);
      if(select==="id,job_id"&&from===20)scans.runs=true;
      body = select==="id,job_id" ? selected.map(row=>({id:row.id,job_id:row.job_id})) : selected;
    }
    if(path.endsWith("/checkpoints")) {
      const {from,selected,select}=pageSlice(request,checkpoints);
      if(select==="id,job_id"&&from===20)scans.checkpoints=true;
      body = select==="id,job_id" ? selected.map(row=>({id:row.id,job_id:row.job_id})) : selected;
    }
    if(path.endsWith("/events")) {
      const {from,selected,select}=pageSlice(request,events);
      if(select==="id,job_id"&&from===20)scans.audit=true;
      body = select==="id,job_id" ? selected.map(row=>({id:row.id,job_id:row.job_id})) : selected;
    }
    return route.fulfill({status:200,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=runs");
  let context = page.getByRole("region",{name:"Active work context"});
  await expect(context.getByRole("status",{name:"Visible evidence signal"})).toContainText("Run evidence not visible");
  await expect(page.locator(".dataRow[data-active-context='true']")).toHaveCount(0);
  await context.getByRole("button",{name:"Locate active evidence page →"}).click();
  await expect(page.locator(".dataRow[data-active-context='true']")).toHaveCount(1);
  await expect(page.locator(".dataRow[data-active-context='true']")).toBeFocused();
  expect(scans.runs).toBe(true);
  await expect(context.getByRole("status",{name:"Visible evidence signal"})).toContainText("On this page: 1 matching run.");

  await context.getByRole("navigation",{name:"Active Job journey"}).getByRole("button",{name:"Open Checkpoint for active Job"}).click();
  await expect(page).toHaveURL(/\?view=checkpoints/);
  context = page.getByRole("region",{name:"Active work context"});
  await expect(context.getByRole("status",{name:"Visible evidence signal"})).toContainText("Checkpoint evidence not visible");
  await expect(page.locator(".checkpointCard[data-active-context='true']")).toHaveCount(0);
  await context.getByRole("button",{name:"Locate active evidence page →"}).click();
  await expect(page.locator(".checkpointCard[data-active-context='true']")).toHaveCount(1);
  await expect(page.locator(".checkpointCard[data-active-context='true']")).toBeFocused();
  expect(scans.checkpoints).toBe(true);
  await expect(context.getByRole("status",{name:"Visible evidence signal"})).toContainText("On this page: 1 matching checkpoint.");

  await context.getByRole("navigation",{name:"Active Job journey"}).getByRole("button",{name:"Open Audit for active Job"}).click();
  await expect(page).toHaveURL(/\?view=audit/);
  context = page.getByRole("region",{name:"Active work context"});
  await expect(context.getByRole("status",{name:"Visible evidence signal"})).toContainText("Audit evidence not visible");
  await expect(page.locator(".timelineItem[data-active-context='true']")).toHaveCount(0);
  await context.getByRole("button",{name:"Locate active evidence page →"}).click();
  await expect(page.locator(".timelineItem[data-active-context='true']")).toHaveCount(1);
  await expect(page.locator(".timelineItem[data-active-context='true']")).toBeFocused();
  expect(scans.audit).toBe(true);
  await expect(context.getByRole("status",{name:"Visible evidence signal"})).toContainText("On this page: 1 matching audit event.");

  expect(mutations).toEqual([]);
});


test("shared operational deep links restore presentation state and copy canonical URL", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const stamp = "2026-09-27T08:00:00Z";
  const jobs = Array.from({length:21},(_,index)=>({
    id:"00000000-0000-4000-8000-"+String(index+1).padStart(12,"0"),
    job_number:index+1,
    title:"Shared-link Job "+String(index+1),
    description:null,
    priority:100-index,
    status:index===20?"READY":"QUEUED",
    required_capabilities:["chat"],
    acceptance:{},
    created_at:stamp,
    updated_at:stamp,
    deadline:null
  }));

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
    Object.defineProperty(navigator,"clipboard",{
      configurable:true,
      value:{writeText:async(value:string)=>{(window as unknown as {__copiedWorkspaceUrl?:string}).__copiedWorkspaceUrl=value;}}
    });
  }, {userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body:unknown = [];
    const headers:Record<string,string> = {"Content-Type":"application/json"};

    if(path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:stamp};
    if(path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if(path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:21,active_jobs:21,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if(path.endsWith("/jobs")){
      const offset=Number(url.searchParams.get("offset")||"0");
      const limit=Number(url.searchParams.get("limit")||"20");
      const selected=jobs.slice(offset,Math.min(offset+limit,jobs.length));
      body=selected;
      headers["Content-Range"]=selected.length ? offset+"-"+String(offset+selected.length-1)+"/21" : "*/21";
    }

    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=scheduler&page=2&mode=broken&filter=UNKNOWN&sort=bad&release=cache-test&_reload=123");

  await expect(page.getByRole("heading",{name:"TranScheduler"})).toBeVisible();
  await expect(page.getByText("Shared-link Job 21",{exact:true})).toBeVisible();
  await expect(page).toHaveURL(/view=scheduler/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page).not.toHaveURL(/mode=/);
  await expect(page).not.toHaveURL(/filter=/);
  await expect(page).not.toHaveURL(/sort=/);

  await page.getByText("Options",{exact:true}).click();
  await page.getByRole("button",{name:"Copy view link"}).click();
  await expect(page.getByText("Workspace view link copied.",{exact:true})).toBeVisible();

  const copied = await page.evaluate(() => (window as unknown as {__copiedWorkspaceUrl?:string}).__copiedWorkspaceUrl || "");
  expect(copied).toContain("view=scheduler");
  expect(copied).toContain("page=2");
  expect(copied).not.toContain("release=");
  expect(copied).not.toContain("_reload=");
  expect(copied).not.toMatch(/job(?:Id|_id)=/i);
  expect(copied).not.toMatch(/session(?:Id|_id)=/i);
});


test("browser history restores workspace-local presentation state without stale parameter leakage", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const stamp = "2026-09-27T08:00:00Z";
  const jobs = Array.from({length:21},(_,index)=>({
    id:"00000000-0000-4000-9000-"+String(index+1).padStart(12,"0"),
    job_number:index+1,
    title:"History Job "+String(index+1),
    description:null,
    priority:100-index,
    status:index===20?"READY":"QUEUED",
    required_capabilities:["chat"],
    acceptance:{},
    created_at:stamp,
    updated_at:new Date(Date.parse(stamp)+index*1000).toISOString(),
    deadline:null
  }));
  const runs = Array.from({length:21},(_,index)=>({
    id:"10000000-0000-4000-9000-"+String(index+1).padStart(12,"0"),
    job_id:jobs[index].id,
    run_number:index+1,
    connector_kind:"chat",
    status:"COMPLETED",
    started_at:new Date(Date.parse(stamp)+index*1000).toISOString(),
    completed_at:new Date(Date.parse(stamp)+index*1000+500).toISOString(),
    error_category:null
  })).reverse();

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body:unknown = [];
    const headers:Record<string,string> = {"Content-Type":"application/json"};

    if(path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:stamp};
    if(path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"viewer",status:"active"};
    if(path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:21,active_jobs:21,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if(path.endsWith("/jobs")){
      const offset=Number(url.searchParams.get("offset")||"0");
      const limit=Number(url.searchParams.get("limit")||"20");
      const selected=jobs.slice(offset,Math.min(offset+limit,jobs.length));
      body=selected;
      headers["Content-Range"]=selected.length ? offset+"-"+String(offset+selected.length-1)+"/21" : "*/21";
    }
    if(path.endsWith("/runs")){
      const offset=Number(url.searchParams.get("offset")||"0");
      const limit=Number(url.searchParams.get("limit")||"20");
      const selected=runs.slice(offset,Math.min(offset+limit,runs.length));
      body=selected;
      headers["Content-Range"]=selected.length ? offset+"-"+String(offset+selected.length-1)+"/21" : "*/21";
    }

    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=scheduler&page=2&mode=queue&filter=READY&sort=recent&section=trust");
  await expect(page.getByRole("heading",{name:"TranScheduler"})).toBeVisible();
  await expect(page).toHaveURL(/view=scheduler/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/mode=queue/);
  await expect(page).toHaveURL(/filter=READY/);
  await expect(page).toHaveURL(/sort=recent/);
  await expect(page).not.toHaveURL(/section=/);
  await expect(page.getByText("History Job 21",{exact:true})).toBeVisible();

  const projectNav=page.getByRole("navigation",{name:"Project workspaces"});
  await projectNav.getByRole("button",{name:"Runs"}).click();
  await expect(page.getByRole("heading",{name:"Runs",level:1,exact:true})).toBeVisible();
  await expect(page).toHaveURL(/view=runs/);
  await expect(page).not.toHaveURL(/mode=/);
  await expect(page).not.toHaveURL(/filter=/);
  await expect(page).not.toHaveURL(/sort=/);
  await expect(page).not.toHaveURL(/section=/);

  await page.evaluate(()=>{
    const url=new URL(window.location.href);
    url.searchParams.set("page","2");
    window.history.replaceState(window.history.state,"",url.toString());
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/view=runs/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("RUN-1",{exact:true})).toBeVisible();

  await projectNav.getByRole("button",{name:"TranScheduler"}).click();
  await expect(page.getByRole("heading",{name:"TranScheduler"})).toBeVisible();
  await expect(page).toHaveURL(/view=scheduler/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/mode=queue/);
  await expect(page).toHaveURL(/filter=READY/);
  await expect(page).toHaveURL(/sort=recent/);

  await page.goBack();
  await expect(page.getByRole("heading",{name:"Runs",level:1,exact:true})).toBeVisible();
  await expect(page).toHaveURL(/view=runs/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page).not.toHaveURL(/mode=/);
  await expect(page).not.toHaveURL(/filter=/);
  await expect(page).not.toHaveURL(/sort=/);
  await expect(page).not.toHaveURL(/section=/);
  await expect(page.getByText("RUN-1",{exact:true})).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading",{name:"TranScheduler"})).toBeVisible();
  await expect(page).toHaveURL(/view=scheduler/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/mode=queue/);
  await expect(page).toHaveURL(/filter=READY/);
  await expect(page).toHaveURL(/sort=recent/);
  await expect(page).not.toHaveURL(/section=/);

  await page.goForward();
  await expect(page.getByRole("heading",{name:"Runs",level:1,exact:true})).toBeVisible();
  await expect(page).toHaveURL(/view=runs/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page).not.toHaveURL(/mode=/);
  await expect(page).not.toHaveURL(/filter=/);
  await expect(page).not.toHaveURL(/sort=/);
});


test("UNIFI browser-session draft survives workspace navigation and reload", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const stamp = "2026-09-27T08:00:00Z";

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body:unknown = [];
    const headers:Record<string,string> = {"Content-Type":"application/json"};

    if(path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:stamp};
    if(path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"operator",status:"active"};
    if(path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if(path.endsWith("/jobs")) headers["Content-Range"]="*/0";

    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=unifi");
  await expect(page.getByRole("heading",{name:"Job Manifest Planner"})).toBeVisible();

  await page.getByLabel("Job title").fill("Protect unfinished manifest");
  await page.getByLabel("Objective / context").fill("Preserve this authored draft across navigation and reload.");
  await page.getByLabel("Priority").selectOption("80");
  await page.getByLabel("Tests required").uncheck();
  await expect(page.getByText(/Browser-session draft active/)).toBeVisible();

  const storedKeys = await page.evaluate(() => Object.keys(sessionStorage));
  expect(storedKeys.some(key=>key.includes("datanest.sessionDraft.unifi:"+projectId+":"+userId+":"))).toBe(true);

  const projectNav=page.getByRole("navigation",{name:"Project workspaces"});
  await projectNav.getByRole("button",{name:"TranScheduler"}).click();
  await expect(page.getByRole("heading",{name:"TranScheduler"})).toBeVisible();

  await projectNav.getByRole("button",{name:"UNIFI Planner"}).click();
  await expect(page.getByRole("heading",{name:"Job Manifest Planner"})).toBeVisible();
  await expect(page.getByLabel("Job title")).toHaveValue("Protect unfinished manifest");
  await expect(page.getByLabel("Objective / context")).toHaveValue("Preserve this authored draft across navigation and reload.");
  await expect(page.getByLabel("Priority")).toHaveValue("80");
  await expect(page.getByLabel("Tests required")).not.toBeChecked();

  await page.reload();
  await expect(page.getByRole("heading",{name:"Job Manifest Planner"})).toBeVisible();
  await expect(page.getByLabel("Job title")).toHaveValue("Protect unfinished manifest");
  await expect(page.getByLabel("Objective / context")).toHaveValue("Preserve this authored draft across navigation and reload.");
  await expect(page.getByLabel("Priority")).toHaveValue("80");
  await expect(page.getByLabel("Tests required")).not.toBeChecked();
  await expect(page.getByText(/Browser-session draft active/)).toBeVisible();
});


test("UNIFI reconciles pending, not-recorded, and confirmed-after-error outcomes without duplicate manifests", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const jobId = "30000000-0000-4000-8000-000000000042";
  const stamp = "2026-09-27T08:00:00Z";
  let createCalls = 0;
  let reconciliationCalls = 0;
  let serverRecorded = false;
  let durableActive = false;
  let durableVerification:"unverified"|"unconfirmed"|"confirmed_absent" = "unverified";
  let durableRequestKey = "";
  let durablePayload:Record<string,unknown> = {};
  let durableStartedAt = stamp;
  const requestKeys:string[] = [];

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  await page.route("https://fixture.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body:unknown = [];
    const headers:Record<string,string> = {"Content-Type":"application/json"};

    if(path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:stamp};
    if(path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"operator",status:"active"};
    if(path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};

    if(path.endsWith("/list_mutation_recoveries_v1")){
      body=durableActive?[{
        id:"60000000-0000-4000-8000-000000000001",project_id:projectId,user_id:userId,
        scope:"unifi-job:"+projectId+":"+userId,mutation_kind:"unifi_job",request_key:durableRequestKey,
        payload:durablePayload,started_at:durableStartedAt,verification_state:durableVerification,
        last_checked_at:durableVerification==="unverified"?null:stamp,attempt_count:1,last_attempt_at:stamp
      }]:[];
    }

    if(path.endsWith("/register_mutation_recovery_v1")){
      const payload=route.request().postDataJSON() as {
        target_scope:string;target_kind:string;target_request_key:string;target_payload:Record<string,unknown>;target_started_at:string
      };
      durableActive=true;
      durableVerification="unverified";
      durableRequestKey=payload.target_request_key;
      durablePayload=payload.target_payload;
      durableStartedAt=payload.target_started_at;
      return route.fulfill({status:200,headers,body:JSON.stringify({
        id:"60000000-0000-4000-8000-000000000001",project_id:projectId,user_id:userId,
        scope:payload.target_scope,mutation_kind:payload.target_kind,request_key:durableRequestKey,
        payload:durablePayload,started_at:durableStartedAt,verification_state:durableVerification,
        last_checked_at:null,attempt_count:1,last_attempt_at:stamp,resolved_at:null,resolution:null,active:true
      })});
    }

    if(path.endsWith("/mark_mutation_recovery_verification_v1")){
      const payload=route.request().postDataJSON() as {target_state:"unconfirmed"|"confirmed_absent"};
      durableVerification=payload.target_state;
      return route.fulfill({status:200,headers,body:JSON.stringify({
        id:"60000000-0000-4000-8000-000000000001",verification_state:durableVerification,last_checked_at:stamp
      })});
    }

    if(path.endsWith("/resolve_mutation_recovery_v1")){
      const payload=route.request().postDataJSON() as {target_resolution:string};
      durableActive=false;
      return route.fulfill({status:200,headers,body:JSON.stringify({
        id:"60000000-0000-4000-8000-000000000001",resolution:payload.target_resolution,resolved_at:stamp,active:false
      })});
    }

    if(path.endsWith("/jobs")){
      if(url.searchParams.has("client_request_id")){
        reconciliationCalls += 1;
        if(reconciliationCalls===1){
          return route.fulfill({
            status:503,
            headers,
            body:JSON.stringify({code:"PGRST999",message:"Reconciliation temporarily unavailable",details:null,hint:null})
          });
        }
        const selected=serverRecorded?[{id:jobId,job_number:42,status:"PLANNED"}]:[];
        headers["Content-Range"]=selected.length?"0-0/1":"*/0";
        return route.fulfill({status:200,headers,body:JSON.stringify(selected)});
      }
      headers["Content-Range"]="*/0";
    }

    if(path.endsWith("/create_job_manifest_v3")){
      createCalls += 1;
      const payload=route.request().postDataJSON() as {target_request_key?:string};
      requestKeys.push(String(payload.target_request_key||""));
      await new Promise(resolve=>setTimeout(resolve,120));
      if(createCalls===2)serverRecorded=true;
      return route.fulfill({
        status:400,
        headers,
        body:JSON.stringify({
          code:"PGRST999",
          message:createCalls===1?"Temporary fixture failure":"Response lost after authoritative commit",
          details:null,
          hint:null
        })
      });
    }

    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=unifi");
  await expect(page.getByRole("heading",{name:"Job Manifest Planner"})).toBeVisible();
  await page.getByLabel("Job title").fill("Reconciled manifest");

  const form=page.locator("form.plannerForm");
  await form.evaluate(node=>{
    node.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    node.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
  });

  await expect(page.getByText(/Submission awaiting confirmation/)).toBeVisible();
  expect(createCalls).toBe(1);
  expect(requestKeys[0]).toBeTruthy();
  await expect(page.getByRole("button",{name:"Create Job Manifest"})).toBeDisabled();

  const pendingAfterAmbiguity=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith("datanest.pendingMutation.unifi-job:")));
  expect(pendingAfterAmbiguity.length).toBe(1);
  await expect(page.getByRole("region",{name:"Unresolved operations"})).toContainText("UNIFI Job Manifest");
  await expect(page.getByRole("button",{name:"1 unresolved operation"})).toBeVisible();

  const projectNav=page.getByRole("navigation",{name:"Project workspaces"});
  await projectNav.getByRole("button",{name:"TranScheduler"}).click();
  await expect(page.getByRole("heading",{name:"TranScheduler"})).toBeVisible();
  const recoveryCenter=page.getByRole("region",{name:"Unresolved operations"});
  await expect(recoveryCenter).toContainText("UNIFI Job Manifest");
  await expect(recoveryCenter).toContainText("request identity preserved");

  const recoveryAction=recoveryCenter.locator(".mutationRecoveryItem button");
  await expect(recoveryAction).toHaveCount(1);
  await recoveryAction.click();
  await expect(page.getByRole("heading",{name:"Job Manifest Planner"})).toBeVisible();
  await expect(page.getByText(/previous request was not recorded/i)).toBeVisible();
  await expect(page.getByRole("button",{name:"Create Job Manifest"})).toBeEnabled();
  await expect(page.getByLabel("Job title")).toHaveValue("Reconciled manifest");

  await form.evaluate(node=>node.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  await expect.poll(()=>createCalls).toBe(2);

  await projectNav.getByRole("button",{name:"TranScheduler"}).click();
  await expect(page.getByRole("heading",{name:"TranScheduler"})).toBeVisible();
  await expect(page.getByText("Recovered confirmed JOB-00042 from authoritative server state.",{exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"Unresolved operations"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:/unresolved operation/})).toHaveCount(0);

  expect(requestKeys[1]).toBe(requestKeys[0]);
  expect(reconciliationCalls).toBeGreaterThanOrEqual(3);

  await projectNav.getByRole("button",{name:"UNIFI Planner"}).click();
  await expect(page.getByRole("heading",{name:"Job Manifest Planner"})).toBeVisible();
  await expect(page.getByLabel("Job title")).toHaveValue("");

  const staleIntentKeys=await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith("datanest.pendingMutation.unifi-job:")));
  expect(staleIntentKeys).toEqual([]);
  const staleDraftKeys=await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.includes("datanest.sessionDraft.unifi:")));
  expect(staleDraftKeys).toEqual([]);
});


test("Spark reservation reconciliation reuses one request identity and recovers an authoritative commit", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const serviceId = "20000000-0000-4000-8000-000000000001";
  const redemptionId = "40000000-0000-4000-8000-000000000001";
  const traceKey = "DN-SPARK-REDEEM-FIXTURE";
  const stamp = "2026-09-27T08:00:00Z";
  const requestKeys:string[] = [];
  let redemptionCalls = 0;
  let serverRecorded = false;
  let sparkDurableActive = false;
  let sparkDurableVerification:"unverified"|"unconfirmed"|"confirmed_absent" = "unverified";
  let sparkDurableRequestKey = "";
  let sparkDurablePayload:Record<string,unknown> = {};
  let sparkDurableStartedAt = stamp;

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  await page.route("https://fixture.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body:unknown = [];
    const headers:Record<string,string> = {"Content-Type":"application/json"};

    if(path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:stamp};
    if(path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"operator",status:"active"};
    if(path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if(path.endsWith("/jobs")) headers["Content-Range"]="*/0";

    if(path.endsWith("/list_mutation_recoveries_v1")){
      body=sparkDurableActive?[{
        id:"60000000-0000-4000-8000-000000000002",project_id:projectId,user_id:userId,
        scope:"sparks-redemption:"+projectId+":"+userId,mutation_kind:"spark_redemption",request_key:sparkDurableRequestKey,
        payload:sparkDurablePayload,started_at:sparkDurableStartedAt,verification_state:sparkDurableVerification,
        last_checked_at:sparkDurableVerification==="unverified"?null:stamp,attempt_count:1,last_attempt_at:stamp
      }]:[];
    }

    if(path.endsWith("/register_mutation_recovery_v1")){
      const payload=route.request().postDataJSON() as {
        target_scope:string;target_kind:string;target_request_key:string;target_payload:Record<string,unknown>;target_started_at:string
      };
      sparkDurableActive=true;
      sparkDurableVerification="unverified";
      sparkDurableRequestKey=payload.target_request_key;
      sparkDurablePayload=payload.target_payload;
      sparkDurableStartedAt=payload.target_started_at;
      return route.fulfill({status:200,headers,body:JSON.stringify({
        id:"60000000-0000-4000-8000-000000000002",project_id:projectId,user_id:userId,
        scope:payload.target_scope,mutation_kind:payload.target_kind,request_key:sparkDurableRequestKey,
        payload:sparkDurablePayload,started_at:sparkDurableStartedAt,verification_state:sparkDurableVerification,
        last_checked_at:null,attempt_count:1,last_attempt_at:stamp,resolved_at:null,resolution:null,active:true
      })});
    }

    if(path.endsWith("/mark_mutation_recovery_verification_v1")){
      const payload=route.request().postDataJSON() as {target_state:"unconfirmed"|"confirmed_absent"};
      sparkDurableVerification=payload.target_state;
      return route.fulfill({status:200,headers,body:JSON.stringify({
        id:"60000000-0000-4000-8000-000000000002",verification_state:sparkDurableVerification,last_checked_at:stamp
      })});
    }

    if(path.endsWith("/resolve_mutation_recovery_v1")){
      const payload=route.request().postDataJSON() as {target_resolution:string};
      sparkDurableActive=false;
      return route.fulfill({status:200,headers,body:JSON.stringify({
        id:"60000000-0000-4000-8000-000000000002",resolution:payload.target_resolution,resolved_at:stamp,active:false
      })});
    }

    if(path.endsWith("/get_sparks_workspace_v1")) body = {
      policy:{policy_version:"fixture-v1"},
      balances:[
        {account_id:"project-wallet",account_type:"project",project_id:projectId,balance:500},
        {account_id:"locked-wallet",account_type:"locked",project_id:projectId,balance:0}
      ],
      services:[{
        id:serviceId,service_key:"fixture-review",service_version:1,name:"Fixture review",description:"Fixture service",
        spark_price:25,status:"active",fulfillment_mode:"manual",terms:null,terms_version:"v1"
      }],
      redemptions:serverRecorded?[{
        id:redemptionId,trace_key:traceKey,user_id:userId,service_id:serviceId,service_key:"fixture-review",
        service_version:1,service_name:"Fixture review",quantity:1,unit_spark_price:25,total_sparks:25,
        status:"held",request_note:null,resolution_note:null,requested_at:stamp,resolved_at:null
      }]:[],
      ledger:[],
      metrics:{lifetime_contribution_awards:500,lifetime_service_spend:0},
      can_operate:true,
      can_manage_services:false,
      boundaries:{cash_purchase_enabled:false,cash_redemption_enabled:false,p2p_transfer_enabled:false,external_transfer_enabled:false,secondary_market_enabled:false}
    };

    if(path.endsWith("/spark_redemptions")){
      const selected=serverRecorded?[{id:redemptionId,trace_key:traceKey,status:"held",service_id:serviceId,quantity:1}]:[];
      headers["Content-Range"]=selected.length?"0-0/1":"*/0";
      return route.fulfill({status:200,headers,body:JSON.stringify(selected)});
    }

    if(path.endsWith("/request_spark_redemption_v1")){
      redemptionCalls += 1;
      const payload=route.request().postDataJSON() as {target_request_key?:string};
      requestKeys.push(String(payload.target_request_key||""));
      await new Promise(resolve=>setTimeout(resolve,80));
      if(redemptionCalls===2)serverRecorded=true;
      return route.fulfill({
        status:400,
        headers,
        body:JSON.stringify({
          code:"PGRST999",
          message:redemptionCalls===1?"Temporary fixture failure":"Response lost after Spark reservation commit",
          details:null,
          hint:null
        })
      });
    }

    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=sparks");
  await expect(page.getByRole("region",{name:"Sparks workspace overview"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Sparks evidence"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Earned contribution utility, not money"})).toBeVisible();

  const reserve=page.getByRole("button",{name:/Reserve 25 Sparks/});
  await reserve.click();
  await expect(page.locator(".notice.errorNotice").filter({hasText:"Server state confirms the reservation was not recorded"})).toBeVisible();
  expect(redemptionCalls).toBe(1);
  expect(requestKeys[0]).toBeTruthy();

  const pendingAfterFailure=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith("datanest.pendingMutation.sparks-redemption:")));
  expect(pendingAfterFailure.length).toBe(1);
  const storedIntent=JSON.parse(pendingAfterFailure[0][1]) as {requestKey:string};
  expect(storedIntent.requestKey).toBe(requestKeys[0]);

  await reserve.click();
  await expect(page.getByText("Recovered confirmed Spark reservation "+traceKey+" from authoritative server state.",{exact:true})).toBeVisible();
  expect(redemptionCalls).toBe(2);
  expect(requestKeys[1]).toBe(requestKeys[0]);

  const storedAfterSuccess=await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith("datanest.pendingMutation.sparks-redemption:")));
  expect(storedAfterSuccess).toEqual([]);
});


test("durable recovery hydrates a clean browser session without creating replacement intent", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const requestKey = "50000000-0000-4000-8000-000000000010";
  const stamp = "2026-09-27T08:00:00Z";
  let verificationMarks = 0;

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));
  await page.addInitScript(({userId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid"}
    }));
  }, {userId});

  await page.route("https://fixture.supabase.co/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const headers:Record<string,string> = {"Content-Type":"application/json"};
    let body:unknown = [];

    if(path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:stamp};
    if(path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"operator",status:"active"};
    if(path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};

    if(path.endsWith("/list_mutation_recoveries_v1")) body = [{
      id:"60000000-0000-4000-8000-000000000010",project_id:projectId,user_id:userId,
      scope:"unifi-job:"+projectId+":"+userId,mutation_kind:"unifi_job",request_key:requestKey,
      payload:{title:"Recovered across devices",description:"Durable fixture",priority:80,capability:"chat",tests:true,artifact:true},
      started_at:stamp,verification_state:"unconfirmed",last_checked_at:stamp,attempt_count:2,last_attempt_at:stamp
    }];

    if(path.endsWith("/get_mutation_recovery_diagnostics_v1")) body = {
      generated_at:stamp,unresolved_total:1,unverified_total:0,unconfirmed_total:1,safe_retry_total:0,
      recent_total:0,aging_total:0,stale_total:1,max_attempt_count:2,oldest_started_at:stamp,resolved_24h:1,
      items:[{
        id:"60000000-0000-4000-8000-000000000010",mutation_kind:"unifi_job",request_suffix:"00000010",
        started_at:stamp,age_seconds:7200,verification_state:"unconfirmed",last_checked_at:stamp,
        attempt_count:2,last_attempt_at:stamp
      }],
      recent_resolutions:[{
        id:"60000000-0000-4000-8000-000000000011",mutation_kind:"spark_redemption",request_suffix:"00000011",
        resolution:"confirmed",started_at:stamp,resolved_at:stamp,elapsed_seconds:120,attempt_count:1
      }]
    };

    if(path.endsWith("/jobs")){
      if(url.searchParams.has("client_request_id")){
        headers["Content-Range"]="*/0";
        return route.fulfill({status:200,headers,body:"[]"});
      }
      headers["Content-Range"]="*/0";
    }

    if(path.endsWith("/mark_mutation_recovery_verification_v1")){
      verificationMarks += 1;
      return route.fulfill({status:200,headers,body:JSON.stringify({
        id:"60000000-0000-4000-8000-000000000010",
        verification_state:"confirmed_absent",
        last_checked_at:stamp
      })});
    }

    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=scheduler");
  await expect(page.getByRole("heading",{name:"TranScheduler"})).toBeVisible();

  const recovery=page.getByRole("region",{name:"Unresolved operations"});
  await expect(recovery).toContainText("UNIFI Job Manifest");
  await expect(recovery).toContainText("durable ledger");
  await expect(recovery).toContainText("2 attempts");
  await expect(recovery).toContainText("request identity preserved");

  const projectNav=page.getByRole("navigation",{name:"Project workspaces"});
  await projectNav.getByText("ADMIN",{exact:true}).click();
  await projectNav.getByRole("button",{name:"Settings"}).click();
  const diagnostics=page.getByRole("region",{name:"Recovery diagnostics"});
  await expect(diagnostics).toContainText("Durable mutation continuity");
  await expect(diagnostics).toContainText("Open identities");
  await expect(diagnostics).toContainText("Peak attempts");
  await expect(diagnostics).toContainText("…00000010");
  await expect(diagnostics).toContainText("unconfirmed");

  const restored=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith("datanest.pendingMutation.unifi-job:")));
  expect(restored).toHaveLength(1);
  const restoredIntent=JSON.parse(restored[0][1]) as {requestKey:string;durable:boolean;payload:{title:string}};
  expect(restoredIntent.requestKey).toBe(requestKey);
  expect(restoredIntent.durable).toBe(true);
  expect(restoredIntent.payload.title).toBe("Recovered across devices");

  await recovery.locator(".mutationRecoveryItem button").click();
  await expect(page.getByRole("heading",{name:"Job Manifest Planner"})).toBeVisible();
  await expect(page.getByLabel("Job title")).toHaveValue("Recovered across devices");
  await expect(page.getByText(/previous request was not recorded/i)).toBeVisible();
  await expect(page.getByRole("button",{name:"Create Job Manifest"})).toBeEnabled();
  expect(verificationMarks).toBeGreaterThanOrEqual(1);

  const afterReconcile=await page.evaluate(()=>JSON.parse(Object.values(sessionStorage).find(value=>value.includes("50000000-0000-4000-8000-000000000010"))||"null"));
  expect(afterReconcile?.requestKey).toBe(requestKey);
  expect(afterReconcile?.verificationState).toBe("confirmed_absent");
});


test("stale recovery stays preserved and user-scoped across account transitions", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const otherUserId = "00000000-0000-4000-8000-000000000099";
  const stamp = "2026-09-27T08:00:00Z";

  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType:"application/javascript",
    body:"window.__DATANEST_CONFIG__={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'fixture-key',authoritative:true}"
  }));

  await page.addInitScript(({projectId,userId,otherUserId}) => {
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const auth = (id:string) => ({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:id,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture", token_type:"bearer", expires_at:4102444800,
      user:{id,aud:"authenticated",role:"authenticated",email:id===userId?"fixture@example.invalid":"other@example.invalid"}
    });
    if(!localStorage.getItem("sb-fixture-auth-token")){
      localStorage.setItem("sb-fixture-auth-token", JSON.stringify(auth(userId)));
    }

    const staleStartedAt=new Date(Date.now()-2*60*60*1000).toISOString();
    const firstKey="datanest.pendingMutation.unifi-job:"+projectId+":"+userId;
    if(!sessionStorage.getItem(firstKey)){
      sessionStorage.setItem(firstKey,JSON.stringify({
        kind:"unifi_job",
        requestKey:"50000000-0000-4000-8000-000000000001",
        payload:{title:"Stale manifest",description:null,priority:50,capability:"chat",tests:true,artifact:true},
        startedAt:staleStartedAt,
        verificationState:"unconfirmed",
        lastCheckedAt:staleStartedAt
      }));
    }
    const secondKey="datanest.pendingMutation.sparks-redemption:"+projectId+":"+otherUserId;
    if(!sessionStorage.getItem(secondKey)){
      sessionStorage.setItem(secondKey,JSON.stringify({
        kind:"spark_redemption",
        requestKey:"50000000-0000-4000-8000-000000000099",
        payload:{serviceId:"20000000-0000-4000-8000-000000000001",quantity:1,note:null},
        startedAt:staleStartedAt,
        verificationState:"unconfirmed",
        lastCheckedAt:staleStartedAt
      }));
    }
  }, {projectId,userId,otherUserId});

  await page.route("https://fixture.supabase.co/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body:unknown = [];
    const headers:Record<string,string> = {"Content-Type":"application/json"};

    if(path.endsWith("/projects")) body = {id:projectId,slug:"resonance-datanest",name:"Fixture project",description:null,status:"ACTIVE",created_at:stamp};
    if(path.endsWith("/project_members")) body = {project_id:projectId,user_id:userId,role:"operator",status:"active"};
    if(path.endsWith("/get_project_dashboard_summary")) body = {total_jobs:0,active_jobs:0,running_jobs:0,blocked_jobs:0,available_capabilities:0,registered_capabilities:0};
    if(path.endsWith("/jobs")) headers["Content-Range"]="*/0";

    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });

  await page.goto(appPath+"?view=scheduler");
  await expect(page.getByRole("heading",{name:"TranScheduler"})).toBeVisible();

  let recovery=page.getByRole("region",{name:"Unresolved operations"});
  await expect(recovery).toContainText("UNIFI Job Manifest");
  await expect(recovery).toContainText("STALE");
  await expect(recovery).not.toContainText("Spark reservation");
  await expect(page.getByRole("button",{name:"1 unresolved operation"})).toBeVisible();

  const preservedBeforeSwitch=await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith("datanest.pendingMutation.")));
  expect(preservedBeforeSwitch).toHaveLength(2);

  await page.evaluate(({userId,otherUserId})=>{
    const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem("sb-fixture-auth-token", JSON.stringify({
      access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:otherUserId,exp:4102444800,role:"authenticated"})}.fixture`,
      refresh_token:"fixture", token_type:"bearer", expires_at:4102444800,
      user:{id:otherUserId,aud:"authenticated",role:"authenticated",email:"other@example.invalid"}
    }));
  }, {userId,otherUserId});
  await page.reload();
  await expect(page.getByRole("heading",{name:"TranScheduler"})).toBeVisible();

  recovery=page.getByRole("region",{name:"Unresolved operations"});
  await expect(recovery).toContainText("Spark reservation");
  await expect(recovery).toContainText("STALE");
  await expect(recovery).not.toContainText("UNIFI Job Manifest");
  await expect(page.getByRole("button",{name:"1 unresolved operation"})).toBeVisible();

  const preservedAfterSwitch=await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith("datanest.pendingMutation.")));
  expect(preservedAfterSwitch).toHaveLength(2);
});


test("authenticated legal navigation preserves workspace history", async ({page}) => {
  await openJourneyFixture(page);
  await page.goto(appPath+"?view=governance");
  await expect(page.getByRole("heading",{name:"Governance",level:1,exact:true})).toBeVisible();

  const legalNav=page.getByRole("navigation",{name:"Governance and legal links"});
  await expect(legalNav).toBeVisible();
  for(const label of ["Legal Centre","Governance","Privacy","Terms","Disclaimers"]){
    await expect(legalNav.getByRole("link",{name:label,exact:true})).toBeVisible();
  }

  await legalNav.getByRole("link",{name:"Legal Centre",exact:true}).click();
  await expect(page).toHaveURL(/\/legal\/?$/);
  await expect(page.getByRole("heading",{name:"Governance & Legal Centre",exact:true})).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\?view=governance$/);
  await expect(page.getByRole("heading",{name:"Governance",level:1,exact:true})).toBeVisible();
});
