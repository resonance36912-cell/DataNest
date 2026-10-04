import test from"node:test";import assert from"node:assert/strict";import{buildManifest}from"../logic.mjs";test("creates governed DataNest manifest",()=>{const m=buildManifest({name:"Media Tool",type:"media-tool",capabilities:"ffmpeg, reports"});assert.equal(m.repository,"DataNest-Supository/DataNest");assert.equal(m.controls.paidCheckoutActive,false);assert.deepEqual(m.project.capabilities,["ffmpeg","reports"]);});test("requires project name",()=>assert.throws(()=>buildManifest({}),/Project name/));

import {readFileSync} from"node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const build=readFileSync(new URL("../scripts/build.mjs",import.meta.url),"utf8");
const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));

test("exposes the governed Resonance DataNest application contract",()=>{
  for(const token of ["Resonance Sole Proprietorship","Resonance App Development","Resonance DataNest","RSGP Governed","/DataNest/legal","/DataNest/governance"]) assert.match(html,new RegExp(token.replaceAll("/","\\/")));
  assert.doesNotMatch(html,/checkout|pricing|buy now|subscribe/i);
  assert.match(css,/--rdn-app-accent:\s*\#72e6ae/i);
  assert.match(css,/prefers-color-scheme:\s*light/i);
  assert.match(css,/prefers-contrast:\s*more/i);
  assert.match(css,/prefers-reduced-motion:\s*reduce/i);
  assert.doesNotMatch(css,/min-width:\s*(?:[4-9]\d{2}|[1-9]\d{3,})px/i);
  for(const dep of ["@fontsource-variable/inter-tight","@fontsource-variable/inter","@fontsource/instrument-serif","@fontsource-variable/jetbrains-mono"]) assert.equal(pkg.dependencies?.[dep],"5.3.0");
  assert.match(build,/node_modules/);
  assert.match(build,/dist["')\]]?,?\s*["']?fonts|path\.join\(out,"fonts"\)/);
  assert.match(build,/woff2/i);
});
