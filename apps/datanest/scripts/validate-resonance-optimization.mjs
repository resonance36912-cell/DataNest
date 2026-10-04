import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "config", "resonance-optimization.manifest.json");
const catalogPath = path.join(root, "config", "supository.catalog.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const catalogIds = new Set((catalog.entries ?? []).map((entry) => entry.id));
const requiredApps = Object.keys(manifest.apps ?? {});
const missingApps = requiredApps.filter((id) => !catalogIds.has(id));

if (missingApps.length) {
  throw new Error(`Optimization manifest references missing catalog entries: ${missingApps.join(", ")}`);
}

const requiredShared = ["identity","entitlement","evidence","security","telemetry","content","storage","ai"];
const missingShared = requiredShared.filter((key) => !manifest.sharedCapabilities?.[key]);
if (missingShared.length) {
  throw new Error(`Optimization manifest is missing shared capabilities: ${missingShared.join(", ")}`);
}

for (const [id, app] of Object.entries(manifest.apps)) {
  if (!Array.isArray(app.functions) || app.functions.length === 0) {
    throw new Error(`App ${id} has no optimization function contract`);
  }
}

console.log(`Resonance optimization contract valid: ${requiredApps.length} apps, ${requiredShared.length} shared capability domains.`);
