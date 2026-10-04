import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const required = [
  "apps/ronsas/shared/legal-contract.json",
  "apps/ronsas/shared/resonance-brand-contract.json",
  "apps/ronsas/epublisher/package.json",
  "apps/ronsas/epublisher/package-lock.json",
  "apps/ronsas/creative-studio/package.json",
  "apps/ronsas/creative-studio/package-lock.json",
  "apps/ronsas/syncvision/package.json",
  "apps/ronsas/syncvision/package-lock.json",
  "apps/ronsas/syncvision/scripts/vendor-ffmpeg-core.mjs",
  "apps/ronsas/career-compass/package.json",
  "apps/ronsas/career-compass/package-lock.json",
  "apps/ronsas/sovereign-forge/package.json",
  "apps/ronsas/sovereign-forge/package-lock.json",
  "apps/ronsas/lyricsync-studio/package.json",
  "apps/ronsas/lyricsync-studio/package-lock.json",
  "apps/ronsas/scene-song-spark/package.json",
  "apps/ronsas/scene-song-spark/package-lock.json",
  "apps/ronsas/youtube-optimizer/package.json",
  "apps/ronsas/youtube-optimizer/bun.lock",
  "apps/ronsas/sovereign-backend/requirements-dev.txt",
  "apps/ronsas/syncvision/runtime/musetalk/musetalk_bridge.py",
  "ops/ronsas/ealiophin/START-SYNCVISION-MUSETALK.ps1",
  "ops/ronsas/ealiophin/RONSAS-MODULES.json",
  "ops/ronsas/ealiophin/START-RONSAS-DATANEST.ps1",
  "ops/ronsas/ealiophin/INSTALL-RONSAS-SUPERVISOR.ps1",
  "ops/ronsas/ealiophin/RONSAS-SUPERVISOR.ps1",
];

const controlRequired = [
  "ops/ronsas/ealiophin/RONSAS-MODULES.json",
  "ops/ronsas/ealiophin/START-RONSAS-DATANEST.ps1",
  "ops/ronsas/ealiophin/STATUS-RONSAS-DATANEST.ps1",
  "ops/ronsas/ealiophin/STOP-RONSAS-DATANEST.ps1",
  "ops/ronsas/ealiophin/rons-control.example.json",
  "ops/ronsas/ealiophin/README.md",
];

const syncVisionCore = {
  version:"0.12.10",
  resolved:"https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz",
  integrity:"sha512-dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA==",
};

const syncVisionFallbackAssets = new Map([
  ["apps/ronsas/syncvision/public/og-v2.png", 89407],
  ["apps/ronsas/syncvision/public/og-v3.png", 89407],
  ["apps/ronsas/syncvision/src/assets/resonance-app-dev-logo.png", 632680],
]);

const jsonPaths = [
  "apps/ronsas/epublisher/package.json",
  "apps/ronsas/creative-studio/package.json",
  "apps/ronsas/syncvision/package.json",
  "apps/ronsas/career-compass/package.json",
  "apps/ronsas/sovereign-forge/package.json",
  "apps/ronsas/lyricsync-studio/package.json",
  "apps/ronsas/scene-song-spark/package.json",
  "apps/ronsas/youtube-optimizer/package.json",
  "ops/ronsas/ealiophin/RONSAS-MODULES.json",
  "ops/ronsas/ealiophin/rons-control.example.json",
];

const sourceAuthorities = new Map([
  ["apps/ronsas/epublisher/RONSAS-SOURCE-AUTHORITY.json", "apps/ronsas/epublisher"],
  ["apps/ronsas/creative-studio/RONSAS-SOURCE-AUTHORITY.json", "apps/ronsas/creative-studio"],
  ["apps/ronsas/syncvision/RONSAS-SOURCE-AUTHORITY.json", "apps/ronsas/syncvision"],
  ["apps/ronsas/youtube-optimizer/RONSAS-SOURCE-AUTHORITY.json", "apps/ronsas/youtube-optimizer"],
  ["apps/ronsas/sovereign-backend/RONSAS-SOURCE-AUTHORITY.json", "apps/ronsas/sovereign-backend"],
]);

const expectedSources = new Map([
  ["epublisher", "apps/ronsas/epublisher"],
  ["creative-studio", "apps/ronsas/creative-studio"],
  ["syncvision", "apps/ronsas/syncvision"],
  ["youtube-optimizer", "apps/ronsas/youtube-optimizer"],
  ["career-compass", "apps/ronsas/career-compass"],
  ["sovereign-forge", "apps/ronsas/sovereign-forge"],
  ["lyricsync-studio", "apps/ronsas/lyricsync-studio"],
  ["scene-song-spark", "apps/ronsas/scene-song-spark"],
  ["sovereign-backend", "apps/ronsas/sovereign-backend"],
]);

const legalRoutes = {
  legal:"/legal",
  governance:"/governance",
  privacy:"/privacy",
  terms:"/terms",
  disclaimers:"/disclaimers",
  acceptableUse:"/acceptable-use",
  intellectualProperty:"/intellectual-property",
  accessibility:"/accessibility",
};

export function validateLaunchRegistryText(launchRegistry) {
  const failures = [];
  const staticLaunches = launchRegistry.match(/\{slug:"[^"]+"[^}\n]*launchKind:"datanest-pages"/g) || [];
  if (staticLaunches.length !== 7) {
    failures.push(`RONSAS launch registry must expose exactly seven DataNest Pages apps; found ${staticLaunches.length}`);
  }
  const youtubeEntry = launchRegistry.match(/\{[^}]*slug:"youtube-optimizer"[^}]*\}/)?.[0] || "";
  if (!/launchKind:"external-ssr"/.test(youtubeEntry) || !youtubeEntry.includes('href:"https://youtubeoptimizer.life"')) {
    failures.push("YouTube Optimizer must remain a governed external SSR launch at https://youtubeoptimizer.life");
  }
  return failures;
}

export function validateSyncVisionVendoringContract(pkg, lock, vendor) {
  const failures = [];
  const locked = lock.packages?.["node_modules/@ffmpeg/core"];
  if (pkg.dependencies?.["@ffmpeg/core"] !== syncVisionCore.version) failures.push("SyncVision must pin @ffmpeg/core 0.12.10");
  if (pkg.scripts?.["vendor:ffmpeg-core"] !== "node scripts/vendor-ffmpeg-core.mjs") failures.push("SyncVision FFmpeg vendor script is not canonical");
  if (pkg.scripts?.prebuild !== "npm run vendor:ffmpeg-core" || pkg.scripts?.predev !== "npm run vendor:ffmpeg-core") {
    failures.push("SyncVision must vendor FFmpeg before build and dev");
  }
  if (lock.packages?.[""]?.dependencies?.["@ffmpeg/core"] !== syncVisionCore.version) {
    failures.push("SyncVision lock root does not pin @ffmpeg/core 0.12.10");
  }
  if (!locked || locked.version !== syncVisionCore.version || locked.resolved !== syncVisionCore.resolved || locked.integrity !== syncVisionCore.integrity) {
    failures.push("SyncVision @ffmpeg/core lock integrity does not match the governed package");
  }
  for (const token of ["node_modules", "@ffmpeg", "core", "dist", "esm", "ffmpeg-core.js", "ffmpeg-core.wasm", "public", "ffmpeg-core"]) {
    if (!vendor.includes(token)) failures.push(`SyncVision vendor script missing token: ${token}`);
  }
  return failures;
}

export function validateRegistryPolicy(registry) {
  const failures = [];
  if (registry.schema !== "datanest.ronsas.module-registry.v2") {
    failures.push(`unexpected RONSAS registry schema: ${registry.schema}`);
  }
  if (registry.repository !== "DataNest-Supository/DataNest") {
    failures.push(`RONSAS registry authority is not DataNest-Supository/DataNest: ${registry.repository}`);
  }
  if (registry.policy?.singleRepositoryAuthority !== true) {
    failures.push("RONSAS registry must assert singleRepositoryAuthority=true");
  }
  if (registry.policy?.billingState !== "free-promotion" || registry.policy?.paidCheckoutActive !== false) {
    failures.push("RONSAS registry must preserve free-promotion / no-paid-checkout policy");
  }
  for (const [id, expectedSource] of expectedSources) {
    const module = registry.modules?.find((entry) => entry.id === id);
    if (!module) {
      failures.push(`RONSAS registry missing module: ${id}`);
    } else if (module.source !== expectedSource) {
      failures.push(`RONSAS registry source mismatch for ${id}: expected ${expectedSource}, got ${module.source}`);
    }
  }
  return failures;
}

export function validateRegistryRuntime(registry) {
  const failures = [];
  if (registry.repository !== "DataNest-Supository/DataNest") {
    failures.push("RONSAS module registry source authority is not DataNest-Supository/DataNest");
  }
  if (registry.policy?.paidCheckoutActive !== false || registry.policy?.billingState !== "free-promotion") {
    failures.push("RONSAS module registry does not preserve the free-promotion billing policy");
  }
  const museTalk = registry.modules?.find((module) => module.id === "syncvision-musetalk");
  if (!museTalk) {
    failures.push("RONSAS module registry is missing syncvision-musetalk");
  } else {
    if (museTalk.health !== "http://127.0.0.1:7863/health") {
      failures.push("SyncVision MuseTalk health endpoint must remain localhost-only on port 7863");
    }
    if (museTalk.required !== false) {
      failures.push("SyncVision MuseTalk must remain optional until machine-local model prerequisites are installed");
    }
  }
  return failures;
}

export function validateSourceAuthority(authority, rel, expectedSource) {
  const failures = [];
  if (authority.repository !== "https://github.com/DataNest-Supository/DataNest") {
    failures.push(`RONSAS source authority is not DataNest in ${rel}: ${authority.repository}`);
  }
  if (authority.ronsas_repository && authority.ronsas_repository !== "https://github.com/DataNest-Supository/DataNest") {
    failures.push(`RONSAS control authority is stale in ${rel}: ${authority.ronsas_repository}`);
  }
  if (authority.control_repository && authority.control_repository !== "https://github.com/DataNest-Supository/DataNest") {
    failures.push(`RONSAS control authority is stale in ${rel}: ${authority.control_repository}`);
  }
  if (authority.source_path !== expectedSource) {
    failures.push(`RONSAS source path mismatch in ${rel}: expected ${expectedSource}, got ${authority.source_path}`);
  }
  if (authority.authority_state !== "active" || authority.historical_authority !== "evidence-only") {
    failures.push(`RONSAS authority state is not active/evidence-only in ${rel}`);
  }
  return failures;
}

export function validateLegalContract(raw) {
  const failures = [];
  const contract = JSON.parse(raw);
  if (contract.schema !== "datanest.ronsas.legal-contract.v1") failures.push("unexpected cross-app legal contract schema");
  if (contract.legalOperator !== "Resonance Sole Proprietorship") failures.push("cross-app legal contract legal operator mismatch");
  if (contract.businessBrand !== "Resonance App Development") failures.push("cross-app legal contract business brand mismatch");
  if (contract.platform !== "Resonance DataNest") failures.push("cross-app legal contract platform mismatch");
  if (contract.governanceLabel !== "RSGP Governed") failures.push("cross-app legal contract governance label mismatch");
  if (contract.policyState !== "review-gated") failures.push("cross-app legal contract must remain review-gated");
  if (contract.commercialState !== "free-promotion" || contract.paidCheckoutActive !== false) {
    failures.push("cross-app legal contract must preserve free-promotion / no-paid-checkout policy");
  }
  if (JSON.stringify(contract.routes) !== JSON.stringify(legalRoutes)) failures.push("cross-app legal contract route map mismatch");
  if (/RSGP\s+(?:means|stands for|is short for)/i.test(raw)) failures.push("cross-app legal contract invents an RSGP expansion");
  if (/"policyState"\s*:\s*"approved"/i.test(raw)) failures.push("cross-app legal contract cannot mark policy approved before human/legal review");
  if (/encryption|retention|jurisdiction|waiver|indemnif|liabilit/i.test(raw)) {
    failures.push("cross-app legal contract must stay structural and avoid substantive policy promises");
  }
  return failures;
}

function validateLaunchRegistry(root, failures) {
  const file = resolve(root, "src/lib/resonanceAppRegistry.ts");
  if (!existsSync(file)) {
    failures.push("missing canonical Resonance app registry: src/lib/resonanceAppRegistry.ts");
    return;
  }
  const source = readFileSync(file, "utf8");
  const requiredPages = [
    "career-compass",
    "creative-studio",
    "lyricsync-studio",
    "syncvision",
    "epublisher",
    "scene-song-spark",
    "sovereign-forge",
  ];
  for (const slug of requiredPages) {
    const pattern = new RegExp(`slug:"${slug}"[\\s\\S]*?launchKind:"datanest-pages"`);
    if (!pattern.test(source)) {
      failures.push(`Canonical Resonance app registry is missing DataNest Pages launch for ${slug}`);
    }
  }
  const youtubeEntry = source.match(/\{[^}]*slug:"youtube-optimizer"[^}]*\}/)?.[0] || "";
  if (!/launchKind:"external-ssr"/.test(youtubeEntry) || !youtubeEntry.includes('href:"https://youtubeoptimizer.life"')) {
    failures.push("YouTube Optimizer must remain a governed external SSR launch at https://youtubeoptimizer.life");
  }
}

function validateRequiredFiles(root, failures) {
  for (const rel of [...required, ...controlRequired]) {
    const file = resolve(root, rel);
    if (!existsSync(file)) {
      failures.push(`missing required RONSAS source/control file: ${rel}`);
      continue;
    }
    if (statSync(file).size === 0) failures.push(`required RONSAS source/control file is empty: ${rel}`);
  }
}

function validateFallbackAssets(root, failures) {
  for (const [rel, expectedSize] of syncVisionFallbackAssets) {
    const file = resolve(root, rel);
    if (!existsSync(file)) {
      failures.push(`missing governed SyncVision fallback asset: ${rel}`);
      continue;
    }
    const actual = statSync(file).size;
    if (actual !== expectedSize) {
      failures.push(`SyncVision fallback asset size mismatch: ${rel} expected ${expectedSize} bytes, got ${actual}`);
    }
  }
}

function validateSyncVisionVendoring(root, failures) {
  const packagePath = resolve(root, "apps/ronsas/syncvision/package.json");
  const lockPath = resolve(root, "apps/ronsas/syncvision/package-lock.json");
  const vendorPath = resolve(root, "apps/ronsas/syncvision/scripts/vendor-ffmpeg-core.mjs");
  if (!existsSync(packagePath) || !existsSync(lockPath) || !existsSync(vendorPath)) return;
  try {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const vendor = readFileSync(vendorPath, "utf8");
    failures.push(...validateSyncVisionVendoringContract(pkg, lock, vendor));
  } catch (error) {
    failures.push(`invalid SyncVision FFmpeg vendoring contract: ${error.message}`);
  }
}

function validateJsonFiles(root, failures) {
  for (const rel of jsonPaths) {
    const file = resolve(root, rel);
    if (!existsSync(file)) continue;
    try {
      JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      failures.push(`invalid JSON in ${rel}: ${error.message}`);
    }
  }
}

function validateRegistryPolicyFile(root, failures) {
  const file = resolve(root, "ops/ronsas/ealiophin/RONSAS-MODULES.json");
  if (!existsSync(file)) return;
  try {
    failures.push(...validateRegistryPolicy(JSON.parse(readFileSync(file, "utf8"))));
  } catch (error) {
    failures.push(`invalid DataNest RONSAS registry: ${error.message}`);
  }
}

function validateRetiredAuthorityControls(root, failures) {
  for (const rel of controlRequired.filter((entry) => entry.endsWith(".ps1") || entry.endsWith(".json"))) {
    const file = resolve(root, rel);
    if (!existsSync(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const forbidden of [
      "resonance36912-cell/RONSAS",
      "rons-sovereign-codebase",
      "Resonance\\OpenNova",
    ]) {
      if (source.includes(forbidden)) {
        failures.push(`active DataNest RONSAS control plane contains retired authority '${forbidden}' in ${rel}`);
      }
    }
  }
}

function validateRegistryRuntimeFile(root, failures) {
  const file = resolve(root, "ops/ronsas/ealiophin/RONSAS-MODULES.json");
  if (!existsSync(file)) return;
  try {
    failures.push(...validateRegistryRuntime(JSON.parse(readFileSync(file, "utf8"))));
  } catch (error) {
    failures.push(`invalid RONSAS module registry: ${error.message}`);
  }
}

function validateLegacyAuthorityTokens(root, failures) {
  for (const [rel, forbidden] of [
    ["ops/ronsas/ealiophin/START-SYNCVISION-MUSETALK.ps1", ["Resonance\\\\OpenNova", "rons-sovereign-codebase", "resonance36912-cell/RONSAS"]],
    ["ops/ronsas/ealiophin/START-RONSAS-DATANEST.ps1", ["Resonance\\\\OpenNova", "rons-sovereign-codebase", "resonance36912-cell/RONSAS"]],
  ]) {
    const file = resolve(root, rel);
    if (!existsSync(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const token of forbidden) {
      if (source.includes(token)) failures.push(`legacy authority token remains in ${rel}: ${token}`);
    }
  }
}

function validateSourceAuthorities(root, failures) {
  for (const [rel, expectedSource] of sourceAuthorities) {
    const file = resolve(root, rel);
    if (!existsSync(file)) {
      failures.push(`missing RONSAS source-authority file: ${rel}`);
      continue;
    }
    try {
      const authority = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
      failures.push(...validateSourceAuthority(authority, rel, expectedSource));
    } catch (error) {
      failures.push(`invalid RONSAS source-authority JSON in ${rel}: ${error.message}`);
    }
  }
}

function validateLegalContractFile(root, failures) {
  const file = resolve(root, "apps/ronsas/shared/legal-contract.json");
  if (!existsSync(file)) return;
  try {
    failures.push(...validateLegalContract(readFileSync(file, "utf8")));
  } catch (error) {
    failures.push(`invalid cross-app legal contract: ${error.message}`);
  }
}

export function collectRonsasImportFailures(root = process.cwd()) {
  const failures = [];
  validateLaunchRegistry(root, failures);
  validateRequiredFiles(root, failures);
  validateFallbackAssets(root, failures);
  validateSyncVisionVendoring(root, failures);
  validateJsonFiles(root, failures);
  validateRegistryPolicyFile(root, failures);
  validateRetiredAuthorityControls(root, failures);
  validateRegistryRuntimeFile(root, failures);
  validateLegacyAuthorityTokens(root, failures);
  validateSourceAuthorities(root, failures);
  validateLegalContractFile(root, failures);
  return failures;
}

function main() {
  const failures = collectRonsasImportFailures();
  if (failures.length) {
    console.error("RONSAS import/control contract validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("RONSAS import and DataNest control-plane contract validation passed.");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main();
}
