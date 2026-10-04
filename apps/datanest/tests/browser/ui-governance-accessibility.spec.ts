import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { setupUiGovernanceFixture } from "./ui-governance-fixture";

const appPath=process.env.DATANEST_APP_PATH||"/";
const widths=[320,390,768,1440] as const;

async function assertNoOverflow(page:Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}

async function assertAxeClean(page:Page,label:string){
  const result=await new AxeBuilder({page})
    .withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"])
    .analyze();
  const violations=result.violations.map(item=>({
    id:item.id,
    impact:item.impact,
    targets:item.nodes.slice(0,5).flatMap(node=>node.target)
  }));
  expect(violations,`${label} WCAG 2A/2AA violations`).toEqual([]);
}

async function assertTextualStatuses(page:Page){
  const statuses=page.locator("[data-governed-stage], [data-status-kind]");
  const count=await statuses.count();
  for(let index=0;index<count;index+=1){
    const text=(await statuses.nth(index).innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
  }
}

test("signed-out entry is responsive, keyboard reachable, reduced-motion aware, and axe clean",async({page})=>{
  for(const width of widths){
    await page.setViewportSize({width,height:900});
    await page.goto(appPath);
    await expect(page.getByRole("heading",{name:"DataNest"})).toBeVisible();
    await assertNoOverflow(page);
    await assertAxeClean(page,`signed-out entry at ${width}px`);
  }

  await page.setViewportSize({width:390,height:844});
  await page.goto(appPath);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link",{name:"Skip to sign in"})).toBeFocused();

  await page.emulateMedia({reducedMotion:"reduce"});
  await page.reload();
  const duration=await page.locator("html").evaluate(element=>
    getComputedStyle(element).getPropertyValue("--motion-duration-fast").trim()
  );
  expect(duration).toBe("0.01ms");
});

test("public Legal Centre and Governance surfaces pass responsive accessibility checks",async({page})=>{
  for(const route of ["legal/","governance/"]){
    for(const width of [390,1440] as const){
      await page.setViewportSize({width,height:900});
      await page.goto(appPath+route);
      await expect(page.locator("h1").first()).toBeVisible();
      await assertNoOverflow(page);
      await assertTextualStatuses(page);
      await assertAxeClean(page,`${route} at ${width}px`);
    }
  }
});

test("authenticated Home Execute Verify and DataNest AI remain accessible at mobile and desktop widths",async({page})=>{
  await setupUiGovernanceFixture(page);

  for(const [view,label] of [
    ["overview","Home"],
    ["scheduler","Execute / TranScheduler"],
    ["audit","Verify / Audit"],
    ["ai","DataNest AI"]
  ] as const){
    for(const width of [390,1440] as const){
      await page.setViewportSize({width,height:900});
      await page.goto(appPath+`?view=${view}`);
      await expect(page.locator("main, .mainPane").first()).toBeVisible();
      await assertNoOverflow(page);
      await assertTextualStatuses(page);
      await assertAxeClean(page,`${label} at ${width}px`);
    }
  }
});
