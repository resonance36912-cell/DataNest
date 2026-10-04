import { writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { setupUiGovernanceFixture } from "./ui-governance-fixture";

const appPath=process.env.DATANEST_APP_PATH||"/";

async function capture(
  page:Page,
  testInfo:TestInfo,
  surface:string,
  width:390|1440
){
  const context=await page.evaluate(({surface,width})=>{
    const heading=document.querySelector("h1,h2");
    return {
      surface,
      width,
      url:location.href,
      title:document.title,
      heading:heading?.textContent?.trim()||null,
      scrollWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      overflow:document.documentElement.scrollWidth>innerWidth
    };
  },{surface,width});

  expect(context.overflow,`${surface} must not overflow at ${width}px`).toBe(false);

  const contextPath=testInfo.outputPath(`${surface}-${width}-context.json`);
  const screenshotPath=testInfo.outputPath(`${surface}-${width}.png`);
  writeFileSync(contextPath,JSON.stringify(context,null,2),"utf8");
  await page.screenshot({path:screenshotPath,fullPage:true});
  await testInfo.attach(`${surface}-${width}-context.json`,{
    path:contextPath,
    contentType:"application/json"
  });
  await testInfo.attach(`${surface}-${width}.png`,{
    path:screenshotPath,
    contentType:"image/png"
  });
}

test("captures public legal and governance review evidence at mobile and desktop widths",async({page},testInfo)=>{
  for(const [surface,route] of [
    ["public-entry",""],
    ["legal-centre","legal/"],
    ["public-governance","governance/"]
  ] as const){
    for(const width of [390,1440] as const){
      await page.setViewportSize({width,height:1000});
      await page.goto(appPath+route);
      await expect(page.locator("h1").first()).toBeVisible();
      await capture(page,testInfo,surface,width);
    }
  }
});

test("captures deterministic Home AI Governance Execute and Verify review evidence",async({page},testInfo)=>{
  await setupUiGovernanceFixture(page);

  for(const [surface,view] of [
    ["home","overview"],
    ["datanest-ai","ai"],
    ["governance","governance"],
    ["execute","scheduler"],
    ["verify","audit"]
  ] as const){
    for(const width of [390,1440] as const){
      await page.setViewportSize({width,height:1000});
      await page.goto(appPath+`?view=${view}`);
      await expect(page.locator("main, .mainPane").first()).toBeVisible();
      await capture(page,testInfo,surface,width);
    }
  }
});
