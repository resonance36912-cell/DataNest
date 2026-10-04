import test from"node:test";import assert from"node:assert/strict";import{generateScenes}from"../logic.mjs";test("generates requested timed scenes",()=>{const scenes=generateScenes({concept:"Signal in desert",mood:"mysterious",durationSeconds:60,sceneCount:6});assert.equal(scenes.length,6);assert.equal(scenes[0].start,0);assert.equal(scenes.at(-1).end,60);});test("caps scene count",()=>assert.equal(generateScenes({concept:"x",sceneCount:99}).length,12));

import {readFileSync} from"node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const build=readFileSync(new URL("../scripts/build.mjs",import.meta.url),"utf8");
const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));

test("exposes the governed Resonance DataNest application contract",()=>{
  for(const token of ["Resonance Sole Proprietorship","Resonance App Development","Resonance DataNest","RSGP Governed","/DataNest/legal","/DataNest/governance"]) assert.match(html,new RegExp(token.replaceAll("/","\\/")));
  assert.doesNotMatch(html,/checkout|pricing|buy now|subscribe/i);
  assert.match(css,/--rdn-app-accent:\s*\#f4c66f/i);
  assert.match(css,/prefers-color-scheme:\s*light/i);
  assert.match(css,/prefers-contrast:\s*more/i);
  assert.match(css,/prefers-reduced-motion:\s*reduce/i);
  assert.doesNotMatch(css,/min-width:\s*(?:[4-9]\d{2}|[1-9]\d{3,})px/i);
  for(const dep of ["@fontsource-variable/inter-tight","@fontsource-variable/inter","@fontsource/instrument-serif","@fontsource-variable/jetbrains-mono"]) assert.equal(pkg.dependencies?.[dep],"5.3.0");
  assert.match(build,/node_modules/);
  assert.match(build,/dist["')\]]?,?\s*["']?fonts|path\.join\(out,"fonts"\)/);
  assert.match(build,/woff2/i);
});
