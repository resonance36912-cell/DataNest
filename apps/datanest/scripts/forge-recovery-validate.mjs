import fs from "node:fs";
import { validatePortableSnapshot } from "../lib/resonance-forge-recovery.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/forge-recovery-validate.mjs <json-file>");
  process.exit(2);
}

try {
  const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = validatePortableSnapshot(snapshot);
  process.stdout.write(JSON.stringify({
    mode: "read-only-recovery-validation",
    ...result,
    authorizationGranted: false,
    productionMutation: false,
  }, null, 2) + "\n");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
