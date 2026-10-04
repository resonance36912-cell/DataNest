#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { extname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

export const SCANNER_VERSION = "resonance-secret-integrity-v1";
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".cjs",".css",".csv",".env",".graphql",".gql",".html",".ini",".java",".js",".json",".jsx",".mjs",".md",".php",".ps1",".py",".rs",".scss",".sh",".sql",".toml",".ts",".tsx",".txt",".xml",".yaml",".yml"]);
const IGNORED_PATHS = [/^\.git\//,/^\.next\//,/^node_modules\//,/^dist\//,/^coverage\//,/^out\//,/^test-results\//,/^artifacts\//,/\/vendor\//,/\.map$/i,/\.min\.(?:js|css)$/i];

const DETECTORS = [
  ["private-key-block", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/],
  ["github-pat", /\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["stripe-live-key", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ["npm-token", /\bnpm_[A-Za-z0-9]{30,}\b/],
  ["supabase-secret-key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
  ["sendgrid-key", /\bSG\.[A-Za-z0-9_-]{20,}\b/],
  ["twilio-key", /\bSK[0-9a-fA-F]{30,}\b/]
];
const GENERIC_SECRET = /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|secret(?:[_-]?key)?|service[_-]?role[_-]?key|token)\b\s*[:=]\s*["']([^"'\n]{20,})["']/i;
const BEARER_SECRET = /\bBearer\s+([A-Za-z0-9._~-]{30,})\b/i;
const JWT_CONTEXT = /\b(?:service[_-]?role|secret|admin|private[_-]?key|authorization)\b.*\b(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,})\b/i;

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, ...options });
}

function ignored(file) {
  const normalized = file.replaceAll("\\", "/");
  return IGNORED_PATHS.some((pattern) => pattern.test(normalized));
}

function isTextPath(file) {
  const base = file.replaceAll("\\", "/").split("/").pop() || "";
  if (/^(Dockerfile|Makefile|\.env(?:\..*)?|\.npmrc|\.pypirc)$/i.test(base)) return true;
  return TEXT_EXTENSIONS.has(extname(base).toLowerCase());
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (/^(?:\$\{|process\.env\.|import\.meta\.env\.|<[^>]+>|\[.+\]|your[_ -]?|replace[_ -]?me|changeme|change-me|example|dummy|placeholder|redacted|test-secret|not-a-real-secret|real-looking-secret-value|resonance-sovereign-local-|sovereign-local-)/.test(normalized)) return true;
  if (/^(?:x{6,}|0{6,}|1{6,}|a{6,})$/.test(normalized)) return true;
  return false;
}

function redact(line, start, end) {
  const left = line.slice(0, Math.max(0, start));
  const right = line.slice(Math.max(0, end)).trim().slice(0, 120);
  return (left + "[REDACTED]" + right).slice(0, 240);
}

export function findFindings(source, file) {
  const findings = [];
  source.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    for (const [rule, pattern] of DETECTORS) {
      const match = line.match(pattern);
      if (match && !isPlaceholder(match[0])) {
        findings.push({ rule: "secret:" + rule, file, line: lineNumber, detail: redact(line, match.index ?? 0, (match.index ?? 0) + match[0].length) });
      }
    }
    const generic = line.match(GENERIC_SECRET);
    if (generic && !isPlaceholder(generic[1])) {
      const valueIndex = (generic.index ?? 0) + generic[0].lastIndexOf(generic[1]);
      findings.push({ rule: "secret:generic-assignment", file, line: lineNumber, detail: redact(line, valueIndex, valueIndex + generic[1].length) });
    }
    const bearer = line.match(BEARER_SECRET);
    if (bearer && !isPlaceholder(bearer[1])) {
      const valueIndex = (bearer.index ?? 0) + bearer[0].lastIndexOf(bearer[1]);
      findings.push({ rule: "secret:bearer-token", file, line: lineNumber, detail: redact(line, valueIndex, valueIndex + bearer[1].length) });
    }
    const jwt = line.match(JWT_CONTEXT);
    if (jwt && !isPlaceholder(jwt[1])) {
      const valueIndex = (jwt.index ?? 0) + jwt[0].lastIndexOf(jwt[1]);
      findings.push({ rule: "secret:jwt-context", file, line: lineNumber, detail: redact(line, valueIndex, valueIndex + jwt[1].length) });
    }
  });
  return findings;
}

function listCurrentFiles() {
  return git(["ls-files", "-z"]).split("\0").filter(Boolean).filter((file) => !ignored(file) && isTextPath(file));
}

function scanCurrentTree() {
  const findings = [];
  for (const file of listCurrentFiles()) {
    const data = readFileSync(resolve(file));
    if (data.length > MAX_TEXT_BYTES || data.includes(0)) continue;
    findings.push(...findFindings(data.toString("utf8"), file));
  }
  return findings;
}

function scanHistory() {
  const findings = [];
  const entries = git(["rev-list", "--objects", "HEAD"]).split("\n").map((line) => line.trim()).filter(Boolean);
  const seenBlobs = new Set();
  for (const entry of entries) {
    const firstSpace = entry.indexOf(" ");
    if (firstSpace === -1) continue;
    const objectId = entry.slice(0, firstSpace);
    const file = entry.slice(firstSpace + 1);
    if (seenBlobs.has(objectId) || ignored(file) || !isTextPath(file)) continue;
    const historicalPath = file.replaceAll("\\", "/");
    if (/^(?:tests?|fixtures?)\//i.test(historicalPath) || historicalPath === "scripts/resonance-secret-scan.mjs") continue;
    seenBlobs.add(objectId);
    let type;
    try { type = git(["cat-file", "-t", objectId]).trim(); } catch { continue; }
    if (type !== "blob") continue;
    let raw;
    try { raw = execFileSync("git", ["cat-file", "blob", objectId], { maxBuffer: MAX_TEXT_BYTES + 1 }); } catch { continue; }
    if (raw.length > MAX_TEXT_BYTES || raw.includes(0)) continue;
    findings.push(...findFindings(raw.toString("utf8"), "history:" + objectId + ":" + file));
  }
  return findings;
}

export function scanRepository({ history = true } = {}) {
  const findings = scanCurrentTree();
  if (history) findings.push(...scanHistory());
  const dedupe = new Map();
  for (const finding of findings) {
    const key = finding.rule + "|" + finding.file + "|" + finding.line;
    dedupe.set(key, finding);
  }
  return [...dedupe.values()];
}

function toSarif(findings) {
  const ids = [...new Set(findings.map((finding) => finding.rule))];
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "Resonance Secret Integrity", version: SCANNER_VERSION, informationUri: "https://datanest-supository.github.io/DataNest/" } },
      automationDetails: { description: "Repository-owned, license-free, fail-closed secret scan." },
      rules: ids.map((id) => ({ id, shortDescription: { text: id } })),
      results: findings.map((finding) => ({
        ruleId: finding.rule,
        level: "error",
        message: { text: "Potential secret detected; value redacted." },
        locations: [{ physicalLocation: { artifactLocation: { uri: finding.file }, region: { startLine: finding.line } } }]
      }))
    }]
  };
}

export function writeSarif(target, findings) {
  writeFileSync(resolve(target), JSON.stringify(toSarif(findings), null, 2) + "\n", "utf8");
}

export function selfTest() {
  const cases = [
    ["aws", "AWS_ACCESS_KEY_ID=" + "AKIA" + "1234567890ABCDEF", true],
    ["private", "-----BEGIN " + "PRIVATE KEY-----", true],
    ["generic", "client" + "_secret = " + String.fromCharCode(34) + ["this","is","a","real","looking","secret","value","123"].join("-") + String.fromCharCode(34), true],
    ["placeholder", ["client","_","secret = "].join("") + "\n" + [String.fromCharCode(34),"YOUR","_","SECRET","_","HERE","_","1234567890",String.fromCharCode(34)].join(""), false]
  ];
  for (const [name, value, expected] of cases) {
    const found = findFindings(value, "self-test/" + name);
    if ((found.length > 0) !== expected) throw new Error("self-test failed for " + name);
  }
}

if (process.argv.includes("--self-test")) {
  selfTest();
  console.log("Resonance Secret Integrity self-test passed.");
  process.exit(0);
}
if (process.argv.includes("--version")) {
  console.log(SCANNER_VERSION);
  process.exit(0);
}

const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : "resonance-secret-scan.sarif";
if (!output) throw new Error("--output requires a file path");
const history = !process.argv.includes("--no-history");
const findings = scanRepository({ history });
writeSarif(output, findings);
console.log("Resonance Secret Integrity " + SCANNER_VERSION);
console.log("History scan: " + (history ? "enabled" : "disabled"));
console.log("Findings: " + findings.length);
if (findings.length) {
  for (const finding of findings) console.error("::error file=" + finding.file + ",line=" + finding.line + "::" + finding.rule + ": potential secret detected (value redacted)");
  process.exit(1);
}
