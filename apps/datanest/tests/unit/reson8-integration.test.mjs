import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const binding=readFileSync(new URL("../../src/lib/reson8.ts",import.meta.url),"utf8");
const layout=readFileSync(new URL("../../src/app/layout.tsx",import.meta.url),"utf8");
const forceHttps=readFileSync(new URL("../../public/force-https.js",import.meta.url),"utf8");
const reson8Wire=readFileSync(new URL("../../public/reson8-wire.js",import.meta.url),"utf8");
const auth=readFileSync(new URL("../../src/components/AuthGate.tsx",import.meta.url),"utf8");
const shell=readFileSync(new URL("../../src/components/DataNestApp.tsx",import.meta.url),"utf8");
const contract=JSON.parse(readFileSync(new URL("../../public/.well-known/reson8-app.json",import.meta.url),"utf8"));

test("DataNest declares its live public endpoint without a DNS cutover",()=>{
  assert.match(binding,/RESON8_HUB_URL = "https:\/\/reson8\.life\/"/);
  assert.match(binding,/DATANEST_PUBLIC_URL = "https:\/\/datanest-supository\.github\.io\/DataNest\/"/);
  assert.match(binding,/DATANEST_CANONICAL_NAME = "DataNest"/);
  assert.equal(contract.contract,"reson8-app@1");
  assert.equal(contract.key,"datanest");
  assert.equal(contract.name,"DataNest");
  assert.equal(contract.displayName,"DataNest");
  assert.equal(contract.canonicalHost,"datanest-supository.github.io");
  assert.equal(contract.brandedUrl,"https://datanest-supository.github.io/DataNest/");
  assert.equal(contract.brandedState,"live");
  assert.equal(contract.wire?.source,"https://datanest-supository.github.io/DataNest/");
  assert.equal(contract.wire?.target,"https://datanest-supository.github.io/DataNest/");
  assert.equal(contract.wire?.mode,"direct");
  assert.equal(contract.wire?.applicationLayer,"not-required");
  assert.equal(contract.wire?.networkState,"not-applicable");
  assert.equal(contract.publicUrl,"https://datanest-supository.github.io/DataNest/");
  assert.equal(contract.hubUrl,"https://reson8.life/");
  assert.equal(contract.operationalUrl,"https://datanest-supository.github.io/DataNest/");
  assert.equal(contract.delivery?.provider,"GitHub Pages");
  assert.equal(contract.delivery?.status,"live");
  assert.equal(contract.delivery?.url,"https://datanest-supository.github.io/DataNest/");
  assert.equal(contract.billing,"none");
});

test("DataNest keeps a visible navigation path to the Reson8 Hub",()=>{
  assert.match(auth,/RESON8_HUB_URL/);
  assert.match(auth,/Reson8 Hub/);
  assert.match(shell,/useState\(RESON8_HUB_URL\)/);
  assert.match(shell,/setRonsasHubUrl\(RESON8_HUB_URL\)/);
});

test("DataNest runtime config stays local and no branded hostname redirect is loaded",()=>{
  assert.match(layout,/const forceHttpsSource=basePath \+ "\/force-https\.js"/);
  assert.match(layout,/const runtimeConfigSource=basePath \+ "\/runtime-config\.js"/);
  assert.match(layout,/<script src=\{forceHttpsSource\} \/>/);
  assert.match(forceHttps,/window\.location\.protocol === "http:"/);
  assert.match(forceHttps,/window\.location\.hostname === "datanest-supository\.github\.io"/);
  assert.match(forceHttps,/window\.location\.replace/);
  assert.doesNotMatch(layout,/reson8WireSource/);
  assert.doesNotMatch(layout,/reson8-wire\.js/);
  assert.doesNotMatch(reson8Wire,/window\.location\.replace/);
  assert.doesNotMatch(reson8Wire,/reson8\.datanest\.life/);
  assert.doesNotMatch(layout,/dangerouslySetInnerHTML/);
  assert.doesNotMatch(layout,/DATANEST_RUNTIME_CONFIG_URL/);
});
