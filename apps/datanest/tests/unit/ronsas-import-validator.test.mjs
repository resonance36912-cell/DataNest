import assert from "node:assert/strict";
import test from "node:test";
import {
  collectRonsasImportFailures,
  validateLaunchRegistryText,
  validateLegalContract,
  validateRegistryPolicy,
  validateRegistryRuntime,
  validateSourceAuthority,
  validateSyncVisionVendoringContract,
} from "../../scripts/validate-ronsas-imports.mjs";

const datanestModules = [
  ["epublisher", "apps/ronsas/epublisher"],
  ["creative-studio", "apps/ronsas/creative-studio"],
  ["syncvision", "apps/ronsas/syncvision"],
  ["youtube-optimizer", "apps/ronsas/youtube-optimizer"],
  ["career-compass", "apps/ronsas/career-compass"],
  ["sovereign-forge", "apps/ronsas/sovereign-forge"],
  ["lyricsync-studio", "apps/ronsas/lyricsync-studio"],
  ["scene-song-spark", "apps/ronsas/scene-song-spark"],
  ["sovereign-backend", "apps/ronsas/sovereign-backend"],
].map(([id, source]) => ({ id, source }));

test("launch registry contract preserves seven Pages apps and governed YouTube SSR", () => {
  const pages = Array.from({ length:7 }, (_, index) =>
    `{slug:"app-${index}",launchKind:"datanest-pages"}`
  ).join("\n");
  const source = pages + '\n{slug:"youtube-optimizer",launchKind:"external-ssr",href:"https://youtubeoptimizer.life"}';
  assert.deepEqual(validateLaunchRegistryText(source), []);
});

test("SyncVision FFmpeg vendoring contract accepts the governed lock and vendor script", () => {
  const pkg = {
    dependencies:{ "@ffmpeg/core":"0.12.10" },
    scripts:{
      "vendor:ffmpeg-core":"node scripts/vendor-ffmpeg-core.mjs",
      prebuild:"npm run vendor:ffmpeg-core",
      predev:"npm run vendor:ffmpeg-core",
    },
  };
  const lock = {
    packages:{
      "":{ dependencies:{ "@ffmpeg/core":"0.12.10" } },
      "node_modules/@ffmpeg/core":{
        version:"0.12.10",
        resolved:"https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz",
        integrity:"sha512-dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA==",
      },
    },
  };
  const vendor = "node_modules @ffmpeg core dist esm ffmpeg-core.js ffmpeg-core.wasm public ffmpeg-core";
  assert.deepEqual(validateSyncVisionVendoringContract(pkg, lock, vendor), []);
});

test("module registry policy and runtime contracts accept the governed configuration", () => {
  const registry = {
    schema:"datanest.ronsas.module-registry.v2",
    repository:"DataNest-Supository/DataNest",
    policy:{
      singleRepositoryAuthority:true,
      billingState:"free-promotion",
      paidCheckoutActive:false,
    },
    modules:[
      ...datanestModules,
      {
        id:"syncvision-musetalk",
        health:"http://127.0.0.1:7863/health",
        required:false,
      },
    ],
  };
  assert.deepEqual(validateRegistryPolicy(registry), []);
  assert.deepEqual(validateRegistryRuntime(registry), []);
});

test("source authority accepts active DataNest ownership and evidence-only history", () => {
  const authority = {
    repository:"https://github.com/DataNest-Supository/DataNest",
    ronsas_repository:"https://github.com/DataNest-Supository/DataNest",
    control_repository:"https://github.com/DataNest-Supository/DataNest",
    source_path:"apps/ronsas/epublisher",
    authority_state:"active",
    historical_authority:"evidence-only",
  };
  assert.deepEqual(
    validateSourceAuthority(authority, "apps/ronsas/epublisher/RONSAS-SOURCE-AUTHORITY.json", "apps/ronsas/epublisher"),
    []
  );
});

test("legal contract stays structural, review-gated, and free-promotion", () => {
  const raw = JSON.stringify({
    schema:"datanest.ronsas.legal-contract.v1",
    legalOperator:"Resonance Sole Proprietorship",
    businessBrand:"Resonance App Development",
    platform:"Resonance DataNest",
    governanceLabel:"RSGP Governed",
    policyState:"review-gated",
    commercialState:"free-promotion",
    paidCheckoutActive:false,
    routes:{
      legal:"/legal",
      governance:"/governance",
      privacy:"/privacy",
      terms:"/terms",
      disclaimers:"/disclaimers",
      acceptableUse:"/acceptable-use",
      intellectualProperty:"/intellectual-property",
      accessibility:"/accessibility",
    },
  });
  assert.deepEqual(validateLegalContract(raw), []);
});

test("current repository satisfies the complete RONSAS import/control contract", () => {
  assert.deepEqual(collectRonsasImportFailures(process.cwd()), []);
});
