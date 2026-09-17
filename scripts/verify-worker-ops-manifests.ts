import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

type FileEntry = { name: string; sha256: string; bytes: number };
type Manifest = { schema: string; node: string; files: FileEntry[] };

const root = resolve("ops/workers");
const failures: string[] = [];

for (const node of ["spider", "weed"]) {
  const dir = resolve(root, node);
  const manifestPath = resolve(dir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  if (manifest.schema !== "ronsas.worker-ops-manifest.v1") failures.push(`${node}: schema`);
  if (manifest.node !== node) failures.push(`${node}: node`);
  const listed = new Set(manifest.files.map((entry) => entry.name));
  const governed = readdirSync(dir).filter((name) => name !== "manifest.json");
  for (const name of governed) if (!listed.has(name)) failures.push(`${node}: unlisted ${name}`);
  for (const entry of manifest.files) {
    const path = resolve(dir, entry.name);
    if (!existsSync(path)) {
      failures.push(`${node}: missing ${entry.name}`);
      continue;
    }
    const bytes = readFileSync(path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== entry.bytes)
      failures.push(`${node}/${entry.name}: bytes ${bytes.length} != ${entry.bytes}`);
    if (sha256 !== entry.sha256)
      failures.push(`${node}/${entry.name}: sha256 ${sha256} != ${entry.sha256}`);
  }
}

if (failures.length) {
  console.error(`verify-worker-ops-manifests: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(2);
}
console.log("✓ verify-worker-ops-manifests: governed worker bytes match manifests.");
