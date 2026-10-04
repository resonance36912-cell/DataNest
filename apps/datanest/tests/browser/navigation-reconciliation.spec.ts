import { expect, test } from "@playwright/test";
import { setupUiGovernanceFixture } from "./ui-governance-fixture";

const appPath=process.env.DATANEST_APP_PATH||"/";

test("sidebar workspace finder restores focus and preserves deep-link navigation",async({page})=>{
  await setupUiGovernanceFixture(page);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(appPath);

  const launcher=page.getByRole("button",{name:"Find a workspace"});
  await launcher.click();
  const dialog=page.getByRole("dialog",{name:"Quick switch DataNest workspace"});
  await expect(dialog).toBeVisible();

  const search=dialog.getByRole("searchbox",{name:"Search DataNest workspaces"});
  await expect(search).toBeFocused();
  await search.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();

  await launcher.click();
  await expect(dialog).toBeVisible();
  await expect(search).toBeFocused();
  await search.fill("TranScheduler");
  await search.press("Enter");

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/view=scheduler/);
  await expect(page.locator("#workspace-title")).toBeFocused();
});

test("mobile navigation contains focus, isolates the workspace and restores its launcher",async({page})=>{
  await setupUiGovernanceFixture(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto(appPath);

  const menu=page.getByRole("button",{name:"Open menu",exact:true});
  const sidebar=page.locator("#datanest-navigation");
  const main=page.locator("main.mainPane");

  await expect(sidebar).toHaveAttribute("inert","");
  await menu.click();

  const dialog=page.getByRole("dialog",{name:"DataNest navigation"});
  const close=dialog.getByRole("button",{name:"Close menu",exact:true});
  const signOut=dialog.getByRole("button",{name:"Sign out",exact:true});
  await expect(close).toBeFocused();
  await expect(main).toHaveAttribute("inert","");
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe("hidden");

  await close.press("Shift+Tab");
  await expect(signOut).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(sidebar).toHaveAttribute("inert","");
  await expect(main).not.toHaveAttribute("inert");
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");

  await menu.click();
  await dialog.getByRole("button",{name:"AI & I",exact:true}).click();
  await expect(menu).toBeFocused();

  await menu.click();
  await dialog.getByRole("button",{name:"DataNest AI",exact:true}).click();
  await expect(page).toHaveURL(/view=ai/);
  await expect(page.locator("#workspace-title")).toBeFocused();
  await expect(sidebar).toHaveAttribute("inert","");

  await menu.click();
  await page.setViewportSize({width:1440,height:900});
  await expect(sidebar).not.toHaveAttribute("inert");
  await expect(main).not.toHaveAttribute("inert");
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");
});

test("R&D Test Mode exposes a disabled busy state and announces mirror sync failure",async({page,context})=>{
  await setupUiGovernanceFixture(page);
  await context.route("https://datanest-supository.github.io/Mirror-DataNest/",route=>route.fulfill({body:"Mirror preview fixture"}));

  let finishManifest:()=>void=()=>{};
  let markManifestStarted:()=>void=()=>{};
  const manifestStarted=new Promise<void>(resolve=>{markManifestStarted=resolve;});
  await page.route("**/mirror-release.json",async route=>{
    markManifestStarted();
    await new Promise<void>(resolve=>{finishManifest=resolve;});
    await route.fulfill({status:503,body:"Unavailable fixture"});
  });

  await page.setViewportSize({width:1440,height:1000});
  await page.goto(appPath);

  const toggle=page.getByRole("switch");
  const control=toggle.locator("xpath=ancestor::section");
  await expect(toggle).toHaveAccessibleName(/Enable R&D Test Mode/);
  await toggle.click();
  await manifestStarted;
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAccessibleName(/Disable R&D Test Mode/);

  finishManifest();
  await expect(control.getByRole("status")).toContainText("Live Mirror release manifest is not available yet.");
  await expect(toggle).toBeEnabled();
  await expect(control.getByRole("button",{name:"Sync latest build"})).toBeEnabled();
});
