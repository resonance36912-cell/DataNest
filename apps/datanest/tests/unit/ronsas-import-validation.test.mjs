import assert from "node:assert/strict";
import test from "node:test";

import { validateRonsasLaunchRegistryText } from "../../scripts/lib/ronsas-import-validation.mjs";

function sevenStaticApps() {
  return Array.from(
    { length: 7 },
    (_, index) => `{slug:"app-${index}",launchKind:"datanest-pages"}`
  ).join("\n");
}

test("accepts the governed RONSAS launch registry contract", () => {
  const source = [
    sevenStaticApps(),
    '{slug:"youtube-optimizer",launchKind:"external-ssr",href:"https://youtubeoptimizer.life"}',
  ].join("\n");

  assert.deepEqual(validateRonsasLaunchRegistryText(source), []);
});

test("reports the existing static app count failure message", () => {
  const source = [
    '{slug:"app-1",launchKind:"datanest-pages"}',
    '{slug:"youtube-optimizer",launchKind:"external-ssr",href:"https://youtubeoptimizer.life"}',
  ].join("\n");

  assert.deepEqual(validateRonsasLaunchRegistryText(source), [
    "RONSAS launch registry must expose exactly seven DataNest Pages apps; found 1",
  ]);
});

test("reports the existing YouTube Optimizer governance failure message", () => {
  assert.deepEqual(validateRonsasLaunchRegistryText(sevenStaticApps()), [
    "YouTube Optimizer must remain a governed external SSR launch at https://youtubeoptimizer.life",
  ]);
});
