#!/usr/bin/env node
/**
 * Optional long-term archival of diagnostics.zip to object storage.
 *
 * GitHub Actions artifacts stay on the tiered `retention-days` policy (see the
 * RETENTION_* env block in .github/workflows/ssr-gate.yml). This script is an
 * *additional* copy with a longer, self-chosen TTL for post-mortems that
 * outlive the Actions window.
 *
 * Fully optional: if no storage connection is configured the script prints a
 * skip notice and exits 0, so CI is never blocked by archival.
 *
 * Providers (Lovable connector gateway signed uploads):
 *   aws_s3                  -> requires AWS_S3_API_KEY
 *   google_cloud_storage    -> requires GOOGLE_CLOUD_STORAGE_API_KEY
 * Both also require LOVABLE_API_KEY. Connection scopes must include `write`.
 *
 * TTL: object storage expiry is enforced by a bucket lifecycle rule, so the
 * object key is namespaced by TTL (`ttl-90d/...`). Create one lifecycle rule
 * per prefix you use and the objects delete themselves.
 *
 * Env:
 *   DIAGNOSTICS_ARCHIVE=1|true        enable (default: auto — on when a key exists)
 *   ARCHIVE_PROVIDER=aws_s3|google_cloud_storage   (default: aws_s3)
 *   ARCHIVE_TTL_DAYS=90               TTL namespace for the key (default 90)
 *   ARCHIVE_PREFIX=ci-diagnostics     root prefix (default ci-diagnostics)
 *
 * Usage: node scripts/archive-diagnostics.mjs [file=diagnostics.zip]
 */

import { readFileSync, existsSync, statSync, appendFileSync } from "node:fs";

const API_URL = "https://connector-gateway.lovable.dev";
const file = process.argv[2] ?? "diagnostics.zip";
const env = process.env;

const provider = env["ARCHIVE_PROVIDER"] ?? "aws_s3";
const KEY_BY_PROVIDER = {
  aws_s3: "AWS_S3_API_KEY",
  google_cloud_storage: "GOOGLE_CLOUD_STORAGE_API_KEY",
};

const note = (msg) => {
  console.log(msg);
  if (env["GITHUB_STEP_SUMMARY"]) {
    try {
      appendFileSync(env["GITHUB_STEP_SUMMARY"], `${msg}\n\n`);
    } catch {
      /* best effort */
    }
  }
};

const skip = (reason) => {
  note(`ℹ️ Diagnostics archival skipped — ${reason} (Actions artifact retention is unaffected).`);
  process.exit(0);
};

if (!(provider in KEY_BY_PROVIDER)) {
  console.error(`❌ Unknown ARCHIVE_PROVIDER "${provider}". Use aws_s3 or google_cloud_storage.`);
  process.exit(1);
}

const enabled = /^(1|true|yes)$/i.test(env["DIAGNOSTICS_ARCHIVE"] ?? "");
const explicitlyOff = /^(0|false|no)$/i.test(env["DIAGNOSTICS_ARCHIVE"] ?? "");
const connectionKey = env[KEY_BY_PROVIDER[provider]];
const lovableKey = env["LOVABLE_API_KEY"];

if (explicitlyOff) skip("DIAGNOSTICS_ARCHIVE is off");
if (!connectionKey || !lovableKey) {
  skip(
    `no ${provider} storage connection is linked to this project ` +
      `(needs LOVABLE_API_KEY + ${KEY_BY_PROVIDER[provider]})`,
  );
}
if (!enabled && !connectionKey) skip("archival not enabled");
if (!existsSync(file)) skip(`${file} was not produced by this run`);

// --- key layout: TTL-namespaced so one lifecycle rule expires the whole tier ---
const ttlDays = Number(env["ARCHIVE_TTL_DAYS"] ?? 90);
if (!Number.isFinite(ttlDays) || ttlDays < 1) {
  console.error(`❌ ARCHIVE_TTL_DAYS must be a positive number (got "${env["ARCHIVE_TTL_DAYS"]}").`);
  process.exit(1);
}
const rootPrefix = (env["ARCHIVE_PREFIX"] ?? "ci-diagnostics").replace(/^\/+|\/+$/g, "");
const slug = (s) => (s ?? "unknown").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);

const repo = slug(env["GITHUB_REPOSITORY"]?.split("/").pop());
const branch = slug(env["GITHUB_HEAD_REF"] || env["GITHUB_REF_NAME"]);
const sha = (env["GITHUB_SHA"] ?? "local").slice(0, 7);
const runId = env["GITHUB_RUN_ID"] ?? "local";
const attempt = env["GITHUB_RUN_ATTEMPT"] ?? "1";
const day = new Date().toISOString().slice(0, 10);

const objectKey = `${rootPrefix}/ttl-${ttlDays}d/${repo}/${branch}/${day}/run-${runId}-attempt-${attempt}-${sha}-diagnostics.zip`;

// --- signed upload URL, then direct PUT --------------------------------------
const headers = {
  Authorization: `Bearer ${lovableKey}`,
  "X-Connection-Api-Key": connectionKey,
  "Content-Type": "application/json",
};

const signRes = await fetch(`${API_URL}/api/v1/sign_storage_url?provider=${provider}&mode=write`, {
  method: "POST",
  headers,
  body: JSON.stringify({ object_path: objectKey }),
});

if (!signRes.ok) {
  const body = await signRes.text();
  console.error(`❌ Could not sign upload URL [${signRes.status}]: ${body}`);
  console.error("   If this mentions scopes, the storage connection needs `write` access.");
  process.exit(1);
}

const { url, method = "PUT" } = await signRes.json();
const bytes = readFileSync(file);
const size = statSync(file).size;

const putRes = await fetch(url, {
  method,
  body: bytes,
  headers: { "Content-Type": "application/zip" },
});

if (!putRes.ok) {
  console.error(`❌ Archive upload failed [${putRes.status}]: ${await putRes.text()}`);
  process.exit(1);
}

const mb = (size / 1024 ** 2).toFixed(2);
note(
  [
    "### Diagnostics archive",
    "",
    `Archived \`${file}\` (${mb} MB) to **${provider}** with a ${ttlDays}-day TTL.`,
    "",
    `- Object key: \`${objectKey}\``,
    `- Expiry: bucket lifecycle rule on prefix \`${rootPrefix}/ttl-${ttlDays}d/\``,
    "- GitHub Actions artifacts keep their tiered `retention-days` policy unchanged.",
  ].join("\n"),
);

if (env["GITHUB_OUTPUT"]) {
  try {
    appendFileSync(env["GITHUB_OUTPUT"], `object-key=${objectKey}\nttl-days=${ttlDays}\nprovider=${provider}\n`);
  } catch {
    /* best effort */
  }
}
