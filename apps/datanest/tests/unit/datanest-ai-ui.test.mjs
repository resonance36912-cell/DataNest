import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path){
  return fs.existsSync(path)?fs.readFileSync(path,"utf8"):"";
}

test("DataNest AI keeps the animated hero while compressing duplicated workspace chrome",()=>{
  const workspace=read("src/components/DataNestAiWorkspace.tsx");
  const app=read("src/components/DataNestApp.tsx");
  const css=read("src/app/datanest-ai-optimized.css");
  const layout=read("src/app/layout.tsx");

  assert.match(workspace,/Current objective/);
  assert.match(workspace,/Focus chat/);
  assert.match(workspace,/className="datanestAiCommandSummary datanestAiCommandSummaryCompact"/);
  assert.match(workspace,/className="datanestAiContextSignals"/);
  assert.match(workspace,/className="datanestAiContextDetails"/);
  assert.match(workspace,/className="datanestAiAdvancedDisclosure"/);
  assert.doesNotMatch(workspace,/datanestAiStatusCards/);
  assert.doesNotMatch(workspace,/datanestAiJobStrip/);

  const heroIndex=workspace.indexOf('datanestAiHero datanestAiHeroV2');
  const chatIndex=workspace.indexOf('className="datanestAiChatStage"');
  const commandIndex=workspace.indexOf('className="datanestAiCommandSummary datanestAiCommandSummaryCompact"');
  const contextDetailsIndex=workspace.indexOf('className="datanestAiContextDetails"');
  const advancedIndex=workspace.indexOf('className="datanestAiAdvancedDisclosure"');
  assert.ok(heroIndex<chatIndex&&chatIndex<commandIndex&&commandIndex<contextDetailsIndex&&contextDetailsIndex<advancedIndex,
    "DOM order must keep the animated hero visible, then the command channel, compact work context and optional detail disclosures");
  assert.doesNotMatch(workspace,/className="datanestAiOverviewDisclosure"/);
  assert.match(workspace,/<AiCoreVisual state=/);
  assert.match(workspace,/contextReady\?"ready":"standby"/);

  assert.match(app,/view!==\"ai\"&&workspaceTaskGuides\[view\]/);
  assert.match(workspace,/htmlFor="datanest-ai-active-job">Active Job context/);

  assert.match(layout,/import "\.\/datanest-ai-optimized\.css";/);
  assert.match(css,/\.datanestAiHeroV2\s*\{[^}]*min-height:340px/s);
  assert.match(css,/\.datanestAiHeroV2 h2\s*\{[^}]*font-size:clamp\(40px,4\.4vw,64px\)/s);
  assert.match(css,/\.datanestAiCommandSummaryCompact\s*\{/);
  assert.match(css,/\.datanestAiContextDetails\s*,/);
  assert.match(css,/\.datanestAiAdvancedDisclosure\s*\{/);
  assert.match(css,/\.aiCommandGuide\s*\{/);
});

test("DataNest AI formatting pass keeps readable type, consistent surfaces and mobile controls",()=>{
  const css=read("src/app/datanest-ai-optimized.css");

  assert.match(css,/final UI\/UX formatting pass/);
  assert.match(css,/\.datanestAiWorkspace\s*\{[^}]*width:min\(100%,1180px\)[^}]*gap:16px/s);
  assert.match(css,/\.datanestAiChatStage\s*\{[^}]*width:min\(100%,980px\)/s);
  assert.match(css,/\.datanestAiCommandConsole \.datanestAiComposer textarea\s*\{[^}]*font-size:14px[^}]*line-height:1\.5/s);
  assert.match(css,/\.datanestAiCommandSummaryCompact\s*\{[^}]*width:min\(100%,980px\)/s);
  assert.match(css,/@media\(max-width:620px\)[\s\S]*?\.datanestAiCommandButton\s*\{[^}]*width:100%/s);
});

test("DataNest AI command center keeps responsive and reduced-motion safeguards",()=>{
  const css=read("src/app/datanest-ai-optimized.css");

  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.datanestAiHeroVisual\s*\{[^}]*min-height:300px/s);
});


test("DataNest AI Focus mode is persistent, keyboard-safe and keeps narrow context labels contained",()=>{
  const workspace=read("src/components/DataNestAiWorkspace.tsx");
  const css=read("src/app/datanest-ai-optimized.css");

  assert.match(workspace,/const focusModeStorageKey="datanest-ai:focus-mode:v1"/);
  assert.match(workspace,/window\.localStorage\.getItem\(focusModeStorageKey\)==="true"/);
  assert.match(workspace,/window\.localStorage\.setItem\(focusModeStorageKey,String\(next\)\)/);
  assert.match(workspace,/aria-pressed=\{focusMode\}/);
  assert.match(workspace,/\{!focusMode&&<section className=\{"datanestAiHero datanestAiHeroV2 "/);
  assert.match(workspace,/window\.requestAnimationFrame\(\(\)=>openAiWorkspace\(\)\)/);
  assert.match(css,/\.datanestAiCommandObjective strong\{overflow-wrap:anywhere\}/);
  assert.match(css,/\.datanestAiCommandContext>select\{[\s\S]*?max-width:100%[\s\S]*?text-overflow:ellipsis/s);
  assert.match(css,/\.datanestAiHeroVisual,[\s\S]*?\.datanestAiCoreStage\{overflow:visible\}/s);
});


test("DataNest shell keeps navigation compact and the active workspace cyan-led on desktop",()=>{
  const css=read("src/app/datanest-ai-optimized.css");

  assert.match(css,/@media\(min-width:1181px\)\{[^}]*\.appFrame\{[^}]*grid-template-columns:252px minmax\(0,1fr\)/s);
  assert.match(css,/@media\(min-width:901px\) and \(max-width:1180px\)\{[^}]*\.appFrame:not\(\.aiDockOpen\)\{[^}]*grid-template-columns:252px minmax\(0,1fr\)/s);
  assert.match(css,/\.navGroup\s*\{[^}]*margin-bottom:12px/s);
  assert.match(css,/\.navGroup button\s*\{[^}]*padding:9px 10px/s);
  assert.match(css,/\.navGroup button\.active\s*\{[^}]*box-shadow:inset 2px 0 0 var\(--cyan\)/s);
});


test("DataNest AI removes the duplicate task guide while keeping Job-first chat controls",()=>{
  const app=read("src/components/DataNestApp.tsx");
  const workspace=read("src/components/DataNestAiWorkspace.tsx");
  const css=read("src/app/datanest-ai-optimized.css");

  assert.match(app,/view!==\"ai\"&&workspaceTaskGuides\[view\]/);
  assert.match(workspace,/id="datanest-ai-active-job"/);
  assert.match(workspace,/className="datanestAiChatStage"/);
  assert.match(workspace,/Focus chat/);
  assert.match(workspace,/id="datanest-ai-active-job"/);
  assert.doesNotMatch(workspace,/datanestAiJobPicker/);
  const chatPanel=read("src/components/DataNestAiChatPanel.tsx");
  const composerIndex=chatPanel.indexOf('className="datanestAiComposer"');
  const transcriptIndex=chatPanel.indexOf('className="datanestAiTranscript"');
  assert.ok(composerIndex>=0&&transcriptIndex>=0&&composerIndex<transcriptIndex,
    "composer DOM must precede transcript without CSS order overrides");
  assert.doesNotMatch(css,/\.datanestAiCommandConsole \.datanestAiComposer\s*\{[^}]*order:/s);
  assert.doesNotMatch(css,/\.datanestAiOverviewDisclosure\s*\{/);
  assert.match(css,/\.datanestAiContextDetails\s*,[\s\S]*?\.datanestAiAdvancedDisclosure/);
});
