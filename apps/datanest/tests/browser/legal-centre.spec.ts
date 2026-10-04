import { expect, test } from "@playwright/test";

const appPath=process.env.DATANEST_APP_PATH||"/";

test("Governance and Legal Centre is public and exposes governed business identity",async({page})=>{
  await page.goto(appPath+"legal");

  await expect(page.getByRole("heading",{name:"Governance & Legal Centre",exact:true})).toBeVisible();
  await expect(page.getByText("Resonance Sole Proprietorship",{exact:true})).toBeVisible();
  await expect(page.getByText("Resonance App Development",{exact:true}).first()).toBeVisible();
  await expect(page.getByText("Resonance DataNest",{exact:true})).toBeVisible();
  await expect(page.getByText("RSGP Governed",{exact:true}).first()).toBeVisible();

  for(const label of ["Platform Governance","Legal","Transparency","Accessibility","Authorship & Publications","Business Identity"]){
    await expect(page.getByRole("heading",{name:label,exact:true})).toBeVisible();
  }

  await expect(page.getByText(/RSGP\s+(?:means|stands for|is short for)/i)).toHaveCount(0);
  await expect(page.getByText("17 Simonsvlei Street, Kuilsriver, 7580, Cape Town, South Africa",{exact:true})).toBeVisible();
  await expect(page.getByText("ashleyuys@medi-tech.life",{exact:true})).toBeVisible();
  await expect(page.getByText("https://reson8.life",{exact:true})).toBeVisible();
  await expect(page.getByText("@resonanceappdev",{exact:true})).toBeVisible();
  await expect(page.getByText(/checkout|subscribe|pricing|buy now/i)).toHaveCount(0);
});


test("RSGP trust marker opens a descriptive governance route without certification claims",async({page})=>{
  await page.goto(appPath+"legal");
  const trust=page.getByRole("link",{name:"RSGP Governed",exact:true});
  await expect(trust).toBeVisible();
  await trust.focus();
  await expect(trust).toBeFocused();
  await trust.press("Enter");

  await expect(page).toHaveURL(/\/governance\/?$/);
  await expect(page.getByRole("heading",{name:"RSGP governance context",exact:true})).toBeVisible();
  await expect(page.getByText("Human authority remains final for consequential actions.",{exact:true})).toBeVisible();
  for(const step of ["Self-audit","Automated verification","Security validation","Visual / UX review","Governance-impact review","Legal review where applicable","External / human review","Production authorization","Deployment","Post-deployment verification","Dossier / evidence update"]){
    await expect(page.getByText(step,{exact:true})).toBeVisible();
  }
  await expect(page.getByText(/RSGP\s+(?:means|stands for|is short for)/i)).toHaveCount(0);
  await expect(page.getByText(/externally certified|accredited by|regulator[- ]approved/i)).toHaveCount(0);
});

test("Accessibility disclosure documents implemented controls without claiming compliance",async({page})=>{
  await page.goto(appPath+"accessibility");
  await expect(page.getByRole("heading",{name:"Accessibility in Resonance DataNest",exact:true})).toBeVisible();
  for(const item of ["Keyboard operation","Visible focus","Reduced motion","Theme preference","Skip navigation"]){
    await expect(page.getByText(item,{exact:true})).toBeVisible();
  }
  await expect(page.getByText(/WCAG\s*(?:2\.2)?\s*(?:AA)?\s*compliant/i)).toHaveCount(0);
});


const governedDraftRoutes=[
  ["terms","Terms & Conditions"],
  ["privacy","Privacy / POPIA"],
  ["disclaimers","General & AI Disclaimers"],
  ["acceptable-use","Acceptable Use"],
  ["intellectual-property","Intellectual Property"]
] as const;

test("substantive legal routes stay review-gated without manufactured effective dates",async({page})=>{
  for(const [route,title] of governedDraftRoutes){
    await page.goto(appPath+route);
    await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
    await expect(page.getByText("Human / legal review required",{exact:true})).toBeVisible();
    await expect(page.getByText("0.1-draft",{exact:true})).toBeVisible();
    await expect(page.getByText("Not yet effective",{exact:true})).toBeVisible();
    await expect(page.getByText("Governed draft — not production policy",{exact:true})).toBeVisible();
    await expect(page.getByText("2026-09-29",{exact:true})).toHaveCount(0);
  }
});


test("Legal Centre exposes canonical policy destinations",async({page})=>{
  await page.goto(appPath+"legal");
  for(const [label,route] of [
    ["Terms & Conditions","terms"],
    ["Privacy / POPIA","privacy"],
    ["General & AI Disclaimers","disclaimers"],
    ["Acceptable Use","acceptable-use"],
    ["Intellectual Property","intellectual-property"]
  ] as const){
    await expect(page.getByRole("link",{name:new RegExp(label)})).toHaveAttribute("href",new RegExp("/"+route+"\\/?$"));
  }
});
