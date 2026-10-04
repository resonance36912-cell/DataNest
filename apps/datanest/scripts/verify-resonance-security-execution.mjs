#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(".");
const profilePath = resolve(root, "config/resonance-security-execution-v1.json");
const workflowPath = resolve(root, ".github/workflows/security-scan.yml");
const scannerPath = resolve(root, "scripts/resonance-secret-scan.mjs");

function fail(message) {
  console.error("::error::Resonance security execution profile failed: " + message);
  process.exit(1);
}

if (!existsSync(profilePath)) fail("execution profile is missing");
if (!existsSync(scannerPath)) fail("secret scanner is missing");
if (!existsSync(workflowPath)) fail("security workflow is missing");

let profile;
try { profile = JSON.parse(readFileSync(profilePath, "utf8")); }
catch (error) { fail("execution profile is not valid JSON: " + error.message); }

if (profile.schemaVersion !== "resonance-security-execution-v1") fail("unexpected profile schema");
if (profile.owner !== "DataNest-Supository/DataNest") fail("execution owner mismatch");
if (profile.mode !== "repository-owned") fail("execution mode must remain repository-owned");
if (profile.externalLicensing?.required !== false) fail("external licensing must be disabled");
if (profile.externalLicensing?.provider !== null) fail("external licensing provider must remain null");
if (!Array.isArray(profile.externalLicensing?.requiredSecrets) || profile.externalLicensing.requiredSecrets.length !== 0) fail("external license secrets are not permitted");
if (profile.runtime?.networkRequired !== false) fail("security execution must remain network-independent");
if (profile.guarantees?.failClosed !== true) fail("fail-closed guarantee is required");
if (profile.guarantees?.secretRedaction !== true) fail("secret redaction guarantee is required");

const workflow = readFileSync(workflowPath, "utf8");
const forbiddenExternalAction = ["gitleaks", "gitleaks-action"].join("/");
const forbiddenLicenseSecret = ["GITLEAKS", "LICENSE"].join("_");
if (workflow.toLowerCase().includes(forbiddenExternalAction)) fail("external secret scanner action remains wired");
if (workflow.includes(forbiddenLicenseSecret)) fail("external scanner license dependency remains wired");

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isInteger(major) || major < Number(profile.runtime?.nodeMajor || 22)) fail("Node " + profile.runtime.nodeMajor + "+ is required; detected " + process.versions.node);

try {
  const gitVersion = execFileSync("git", ["--version"], { encoding: "utf8" }).trim();
  if (!/^git version [0-9]+/.test(gitVersion)) fail("git executable is unavailable");
  console.log("Resonance execution profile: " + profile.profileId);
  console.log("External license: none");
  console.log("Network dependency: none");
  console.log("Deterministic + fail-closed: true");
  console.log(gitVersion);
} catch (error) {
  fail("git executable is unavailable");
}
