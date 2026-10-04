import crypto from "node:crypto";
import fs from "node:fs";
import { validateExactShaIdentity } from "./resonance-forge-phase-a.mjs";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function digestSnapshot(snapshot) {
  return crypto.createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

export function createRegistrySnapshot({ repositories = {}, candidates = {}, evidence = {}, trees = {} } = {}, generatedAt = new Date().toISOString()) {
  const snapshot = {
    schemaVersion: 1,
    generatedAt,
    authority: "read-only-projection",
    repositories: stable(repositories),
    candidates: stable(candidates),
    evidence: stable(evidence),
    trees: stable(trees)
  };
  return { ...snapshot, snapshotDigest: digestSnapshot(snapshot) };
}

export function validateRegistrySnapshot(snapshot) {
  const errors = [];
  if (snapshot?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (snapshot?.authority !== "read-only-projection") errors.push("authority must be read-only-projection");
  if (!snapshot?.generatedAt || Number.isNaN(Date.parse(snapshot.generatedAt))) errors.push("generatedAt must be an ISO date-time");
  if (snapshot?.repositories === undefined || typeof snapshot.repositories !== "object") errors.push("repositories must be an object");
  if (snapshot?.trees !== undefined && typeof snapshot.trees !== "object") errors.push("trees must be an object");
  for (const [id, tree] of Object.entries(snapshot?.trees ?? {})) {
    if (!tree || typeof tree !== "object") {
      errors.push(`tree ${id}: definition must be an object`);
      continue;
    }
    if (tree.productionAuthority === true) errors.push(`tree ${id}: specialized tree cannot assert production authority`);
    if (tree.authority === "production") errors.push(`tree ${id}: specialized tree authority cannot be production`);
  }
  if (snapshot?.candidates !== undefined) {
    for (const [id, candidate] of Object.entries(snapshot.candidates)) {
      const result = validateExactShaIdentity(candidate);
      if (!result.valid) errors.push(`candidate ${id}: ${result.errors.join("; ")}`);
      if (candidate.authorizationState === "production") errors.push(`candidate ${id}: production authorization cannot be asserted by read-only projection`);
    }
  }
  if (snapshot?.snapshotDigest) {
    const { snapshotDigest, ...body } = snapshot;
    if (snapshotDigest !== digestSnapshot(body)) errors.push("snapshotDigest does not match canonical snapshot");
  }
  return { valid: errors.length === 0, errors };
}

export function writeSnapshotFile(snapshot, filename) {
  const validation = validateRegistrySnapshot(snapshot);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  fs.writeFileSync(filename, JSON.stringify(snapshot, null, 2) + "\n", { mode: 0o644 });
}
