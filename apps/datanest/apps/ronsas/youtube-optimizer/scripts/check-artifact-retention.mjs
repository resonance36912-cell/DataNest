#!/usr/bin/env node
/**
 * Artifact retention policy check.
 *
 * 1. Resolves the expire-days (retention-days) value for every diagnostic
 *    artifact lane and prints it as a table (stdout + $GITHUB_STEP_SUMMARY).
 * 2. Asserts each `actions/upload-artifact` step in the workflow uses the
 *    retention variable this policy expects — so a lane can never silently
 *    fall back to the repo default (90 days) or lose its expiry.
 * 3. When run after the upload steps (`--verify-uploads`), confirms every
 *    artifact that was actually uploaded reports the expected retention.
 *
 * Usage:
 *   node scripts/check-artifact-retention.mjs
 *   node scripts/check-artifact-retention.mjs --verify-uploads
 */

import { readFileSync, appendFileSync, existsSync } from "node:fs";

const WORKFLOW = ".github/workflows/ssr-gate.yml";

/** artifact name -> { env var, purpose, min/max sane expire-days } */
const POLICY = {
  diagnostics: { env: "RETENTION_BUNDLE", purpose: "One-stop diagnostics.zip", min: 14, max: 90 },
  "playwright-report": { env: "RETENTION_REPORT", purpose: "Playwright HTML report", min: 7, max: 30 },
  "test-results": { env: "RETENTION_RESULTS", purpose: "Traces + screenshots", min: 7, max: 30 },
  "test-logs": { env: "RETENTION_LOGS", purpose: "Server/test stdout logs", min: 7, max: 90 },
  "playwright-videos": { env: "RETENTION_VIDEOS", purpose: "Failure screen recordings", min: 3, max: 14 },
  "lighthouse-diff": { env: "RETENTION_LIGHTHOUSE", purpose: "Lighthouse diff + summary", min: 30, max: 90 },
};

const verifyUploads = process.argv.includes("--verify-uploads");
// Only these lanes are expected in the current job (comma list); default: all.
const verifyLanes = (process.env.VERIFY_LANES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const errors = [];
const warnings = [];

if (!existsSync(WORKFLOW)) {
  console.error(`❌ Workflow not found: ${WORKFLOW}`);
  process.exit(1);
}
const yml = readFileSync(WORKFLOW, "utf8");

// --- workflow-level env defaults (RETENTION_*: <n>) ---------------------------
const declared = {};
for (const [, key, value] of yml.matchAll(/^\s{2}(RETENTION_[A-Z_]+):\s*(\d+)\s*$/gm)) {
  declared[key] = Number(value);
}

// --- retention-days actually wired to each upload step ------------------------
// Blocks look like: `name: <artifact>` ... `retention-days: ${{ env.VAR }}`
const wired = {};
for (const [, name, rest] of yml.matchAll(
  /^\s+name:\s*([a-z0-9-]+)\s*$\n([\s\S]{0,600}?retention-days:.*)$/gm,
)) {
  if (!(name in POLICY)) continue;
  const m = rest.match(/retention-days:\s*(\S.*)$/m);
  if (m) wired[name] = m[1].trim();
}

// --- resolve + validate ------------------------------------------------------
const rows = [];
for (const [artifact, spec] of Object.entries(POLICY)) {
  const expected = `\${{ env.${spec.env} }}`;
  const actual = wired[artifact];
  const declaredDays = declared[spec.env];
  // In CI the workflow env is real; locally fall back to the declared default.
  const resolved = Number(process.env[spec.env] ?? declaredDays);

  if (!actual) {
    errors.push(`No upload step found for artifact "${artifact}" (expected retention-days: ${expected}).`);
  } else if (actual !== expected) {
    errors.push(
      `Artifact "${artifact}" uses \`retention-days: ${actual}\` but policy requires \`${expected}\`. ` +
        `Fix the upload step in ${WORKFLOW}.`,
    );
  }
  if (declaredDays === undefined) {
    errors.push(`Workflow env is missing \`${spec.env}\`; add it to the top-level env block in ${WORKFLOW}.`);
  }
  if (Number.isFinite(resolved)) {
    if (resolved < spec.min || resolved > spec.max) {
      errors.push(
        `${spec.env}=${resolved} is outside the sane window for "${artifact}" ` +
          `(${spec.min}-${spec.max} days). Long enough to debug, short enough to expire.`,
      );
    }
    if (resolved > 90) errors.push(`${spec.env}=${resolved} exceeds GitHub's 90-day maximum.`);
  } else {
    errors.push(`Could not resolve a numeric expire-days value for ${spec.env}.`);
  }

  // Was it actually uploaded this run? Upload steps export artifact-url outputs,
  // which the workflow passes in as UPLOADED_<ARTIFACT>.
  const key = `UPLOADED_${artifact.toUpperCase().replace(/-/g, "_")}`;
  const uploadedUrl = process.env[key];
  const uploaded = Boolean(uploadedUrl);
  const inScope = verifyLanes.length === 0 || verifyLanes.includes(artifact);
  if (verifyUploads && inScope && !uploaded) {
    warnings.push(`Artifact "${artifact}" was not uploaded in this run (step skipped or no matching files).`);
  }

  rows.push({
    artifact,
    purpose: spec.purpose,
    variable: spec.env,
    days: Number.isFinite(resolved) ? resolved : "?",
    window: `${spec.min}-${spec.max}`,
    uploaded: verifyUploads && inScope ? (uploaded ? "yes" : "no") : "n/a",
  });
}

// --- report ------------------------------------------------------------------
const lines = [];
lines.push("### Artifact retention policy");
lines.push("");
lines.push("| Artifact | Contents | Variable | Expire-days | Allowed | Uploaded |");
lines.push("| --- | --- | --- | --: | :--: | :--: |");
for (const r of rows) {
  lines.push(`| \`${r.artifact}\` | ${r.purpose} | \`${r.variable}\` | ${r.days} | ${r.window} | ${r.uploaded} |`);
}
if (warnings.length) {
  lines.push("");
  for (const w of warnings) lines.push(`- ⚠️ ${w}`);
}
if (errors.length) {
  lines.push("");
  for (const e of errors) lines.push(`- ❌ ${e}`);
} else {
  lines.push("");
  lines.push(
    verifyUploads
      ? "✅ Every uploaded artifact matches its expected expire-days policy."
      : "✅ Every artifact lane is wired to its expected expire-days policy.",
  );
}

const out = lines.join("\n");
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out}\n\n`);
  } catch {
    /* summary is best-effort */
  }
}

if (errors.length) {
  console.error(`\n${errors.length} retention policy violation(s).`);
  process.exit(1);
}
