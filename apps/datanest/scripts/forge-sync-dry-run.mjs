import fs from "node:fs";
import { runSyncDryRun } from "../lib/resonance-forge-sync-dry-run.mjs";

const [inputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error("usage: node scripts/forge-sync-dry-run.mjs <json-file>");
  process.exit(2);
}
try {
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const report = runSyncDryRun(input);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
