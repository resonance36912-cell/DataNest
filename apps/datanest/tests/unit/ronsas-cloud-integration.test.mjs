import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const edge=readFileSync(new URL("../../supabase/functions/ronsas-status/index.ts",import.meta.url),"utf8");
const client=readFileSync(new URL("../../src/lib/ronsas.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../../src/components/RonsasIntegrationPanel.tsx",import.meta.url),"utf8");
const products=readFileSync(new URL("../../src/components/ProductsWorkspace.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../../src/components/DataNestApp.tsx",import.meta.url),"utf8");
const config=readFileSync(new URL("../../supabase/config.toml",import.meta.url),"utf8");
const manifest=readFileSync(new URL("../../scripts/write-release-manifest.mjs",import.meta.url),"utf8");

test("RONSAS status is cloud-backed while runtime authority is DataNest local-first",()=>{
  assert.match(edge,/const HUB_ORIGIN = "https:\/\/reson8\.life\/"/);
  assert.match(edge,/const HUB_STATUS_PATH = "\/api\/public\/app-status\/health"/);
  assert.match(edge,/const DATANEST_CANONICAL_NAME = "reson8\.datanest\.life"/);
  assert.match(edge,/const DATANEST_BRANDED_URL = "https:\/\/reson8\.datanest\.life\/"/);
  assert.match(edge,/const DATANEST_WIRE_TARGET = HUB_ORIGIN/);
  assert.match(edge,/const DATANEST_PUBLIC_ORIGIN = "https:\/\/datanest-supository\.github\.io\/DataNest\/"/);
  assert.match(edge,/const DATANEST_HEALTH_PATH = "\/DataNest\/health\.json"/);
  assert.match(edge,/const DATANEST_BACKUP_PROVIDER = "Dropbox"/);
  assert.match(edge,/const DATANEST_BACKUP_PATH = "\/DataNest-AI-Backups"/);
  assert.match(edge,/mode: "cloud"/);
  assert.match(edge,/runtimeMode: "local-first"/);
  assert.match(edge,/managedByDataNest: true/);
  assert.match(edge,/billingState: "free-promotion"/);
  assert.match(edge,/independent: false/);
  assert.match(edge,/localInteractionRequired: false/);
  assert.match(edge,/controlRepository: "DataNest-Supository\/DataNest"/);
  assert.match(edge,/hubRepository: "DataNest-Supository\/DataNest"/);
  assert.doesNotMatch(edge,/resonance36912-cell\/RONSAS|resonance36912-cell\/resonance-hub/);
  assert.doesNotMatch(edge,/http:\/\/127\.0\.0\.1|http:\/\/localhost/);
  assert.match(edge,/probeHubRegistration/);
  assert.match(edge,/entry as \{ key\?: unknown \}\)\.key === "datanest"/);
  assert.match(edge,/canonicalName: DATANEST_CANONICAL_NAME/);
  assert.match(edge,/brandedUrl: DATANEST_BRANDED_URL/);
  assert.match(edge,/brandedState: "wire-ready"/);
  assert.match(edge,/source: DATANEST_BRANDED_URL/);
  assert.match(edge,/target: DATANEST_WIRE_TARGET/);
  assert.match(edge,/mode: "redirect"/);
  assert.match(edge,/networkState: "dns-pending"/);
  assert.match(edge,/provider: "GitHub Pages"/);
  assert.match(edge,/operationalUrl: publicUrl\.toString\(\)/);
  assert.match(edge,/railwayRequired: false/);
  assert.match(edge,/provider: DATANEST_BACKUP_PROVIDER/);
  assert.match(edge,/localPcBackupHosting: false/);
});

test("DataNest exposes the governed RONSAS status contract through JWT-protected Supabase",()=>{
  assert.match(config,/\[functions\.ronsas-status\][\s\S]*verify_jwt = true/);
  assert.match(edge,/npm:@supabase\/server@1\.8\.0/);
  assert.match(edge,/withSupabase\(\{ auth: "user" \}/);
  assert.match(client,/functions\.invoke\("ronsas-status"/);
  assert.match(client,/status\.contract !== "ronsas-status@1"/);
  assert.match(client,/status\.runtimeMode !== "local-first"/);
  assert.match(client,/status\.managedByDataNest !== true/);
  assert.match(client,/status\.independent !== false/);
  assert.match(client,/!status\.delivery/);
  assert.match(client,/status\.delivery\.canonicalName !== "reson8\.datanest\.life"/);
  assert.match(client,/status\.delivery\.brandedUrl !== "https:\/\/reson8\.datanest\.life\/"/);
  assert.match(client,/status\.delivery\.wire\.target !== "https:\/\/reson8\.life\/"/);
  assert.match(client,/status\.delivery\.hubRegistration\.listed/);
  assert.match(client,/status\.delivery\.provider !== "GitHub Pages"/);
  assert.match(client,/status\.delivery\.backupHost\.provider !== "Dropbox"/);
  assert.match(client,/status\.delivery\.backupHost\.localPcBackupHosting !== false/);
  assert.match(panel,/Runtime model<\/dt><dd>\{status\?\.runtimeMode \|\| "local-first"\}/);
  assert.match(panel,/DataNest authority<\/dt><dd>/);
  assert.match(panel,/DataNest-Supository\/DataNest/);
  assert.match(panel,/status\?\.authority\.publicHub/);
  assert.match(panel,/Open Resonance ↗/);
  assert.match(panel,/Canonical name<\/dt><dd>/);
  assert.match(panel,/Branded URL<\/dt><dd>/);
  assert.match(panel,/Hub wire<\/dt><dd>/);
  assert.match(panel,/reson8\.datanest\.life/);
  assert.match(panel,/Public delivery<\/dt><dd>/);
  assert.match(panel,/Operational URL<\/dt><dd>/);
  assert.match(panel,/Hub listing<\/dt><dd>/);
  assert.match(panel,/Backup host<\/dt><dd>/);
  assert.match(panel,/Local PC backup hosting<\/dt><dd>DISABLED<\/dd>/);
  assert.match(panel,/DataNest-AI-Backups/);
  assert.match(panel,/Open DataNest ↗/);
  assert.match(products,/getRonsasStatus/);
  assert.match(products,/status\.authority\.publicHub/);
  assert.match(products,/aria-label="Open Resonance"/);
  assert.match(products,/aria-label="Open Resonance"/);
  assert.match(app,/getRonsasStatus/);
  assert.match(app,/status\.authority\.publicHub/);
  assert.match(app,/aria-label="Open Resonance from DataNest navigation"/);
  assert.match(app,/label:"Resonance"/);
  assert.match(app,/description:"Open the governed Resonance application suite\."/);
  assert.match(app,/window\.open\(item\.href,"_blank","noopener,noreferrer"\)/);
  assert.match(app,/aria-label=\{item\.kind==="external"\?"Open Resonance application suite":undefined\}/);
  assert.match(app,/RonsasIntegrationPanel/);
  assert.match(manifest,/ronsasStatus:process\.env\.DATANEST_EDGE_RONSAS_STATUS \|\| "ronsas-status@1"/);
});


const appRegistry=readFileSync(new URL("../../src/lib/resonanceAppRegistry.ts",import.meta.url),"utf8");

test("RONSAS launch registry distinguishes seven DataNest Pages apps from YouTube Optimizer SSR",()=>{
  assert.match(appRegistry,/launchKind:"datanest-pages"|launchKind:"external-ssr"/);
  assert.match(appRegistry,/slug:"youtube-optimizer"[\s\S]*launchKind:"external-ssr"[\s\S]*href:/);
  for(const slug of ["career-compass","creative-studio","lyricsync-studio","syncvision","epublisher","scene-song-spark","sovereign-forge"]){
    assert.match(appRegistry,new RegExp(`slug:"${slug}"[\\s\\S]*?launchKind:"datanest-pages"`));
  }
  assert.match(appRegistry,/YouTube Optimizer/);
  assert.match(panel,/External SSR|SSR runtime/);
  assert.match(panel,/YouTube Optimizer/);
});


const brandValidator=readFileSync(new URL("../../scripts/validate-ronsas-brand-contract.mjs",import.meta.url),"utf8");
const ronsasWorkflow=readFileSync(new URL("../../.github/workflows/ronsas-app-validation.yml",import.meta.url),"utf8");

test("RONSAS CI enforces complete brand governance across all eight user-facing apps",()=>{
  assert.match(brandValidator,/process\.argv\.includes\("--complete"\)/);
  for(const slug of ["career-compass","creative-studio","epublisher","lyricsync-studio","scene-song-spark","sovereign-forge","syncvision","youtube-optimizer"]){
    assert.match(brandValidator,new RegExp(slug));
  }
  assert.match(brandValidator,/sovereign-backend/);
  assert.match(ronsasWorkflow,/validate-ronsas-brand-contract\.mjs --complete/);
});
