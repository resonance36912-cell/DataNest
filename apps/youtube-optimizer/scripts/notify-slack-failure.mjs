#!/usr/bin/env node
/**
 * Posts a Slack message when a CI job fails, with direct links to the
 * uploaded diagnostic artifacts (Playwright HTML report, traces/screenshots,
 * videos, run logs) plus the Lighthouse diff when the gate produced one.
 *
 * Expects an Incoming Webhook URL in SLACK_WEBHOOK_URL. Artifact URLs come
 * from `actions/upload-artifact@v4` step outputs; any that are empty (the
 * artifact was not produced) are omitted instead of rendered as dead links.
 */
import process from "node:process";

const env = (name) => process.env[name]?.trim() ?? "";

const webhook = env("SLACK_WEBHOOK_URL");
if (!webhook) {
  console.log("[slack] SLACK_WEBHOOK_URL not set — skipping notification.");
  process.exit(0);
}

const runUrl = env("RUN_URL");
const jobName = env("JOB_NAME") || "CI";
const repo = env("GITHUB_REPOSITORY") || "unknown/repo";
const ref = env("GITHUB_REF_NAME") || env("GITHUB_REF") || "unknown";
const sha = env("GITHUB_SHA").slice(0, 7);
const actor = env("GITHUB_ACTOR") || "unknown";
const eventName = env("GITHUB_EVENT_NAME") || "push";
const prNumber = env("PR_NUMBER");

/** label → artifact URL (only non-empty ones are linked). */
const artifacts = [
  ["All diagnostics (zip)", env("BUNDLE_URL")],
  ["Playwright report", env("REPORT_URL")],
  ["Traces & screenshots", env("RESULTS_URL")],
  ["Videos", env("VIDEOS_URL")],
  ["Run logs", env("LOGS_URL")],
  ["Lighthouse diff", env("LH_DIFF_URL")],
].filter(([, url]) => url);

const links = artifacts.length
  ? artifacts.map(([label, url]) => `<${url}|${label}>`).join("  ·  ")
  : "_No artifacts were produced — the job failed before the test steps._";

const context = [
  `*Repo:* ${repo}`,
  `*Branch:* ${ref}${sha ? ` (\`${sha}\`)` : ""}`,
  prNumber ? `*PR:* #${prNumber}` : `*Event:* ${eventName}`,
  `*By:* ${actor}`,
].join("   ");

const payload = {
  text: `❌ ${jobName} failed on ${repo}@${ref}`,
  blocks: [
    {
      type: "section",
      text: { type: "mrkdwn", text: `:x: *${jobName} failed*` },
    },
    { type: "section", text: { type: "mrkdwn", text: context } },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Diagnostics:*\n${links}` },
    },
    ...(runUrl
      ? [
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Open workflow run" },
                url: runUrl,
              },
            ],
          },
        ]
      : []),
  ],
};

// A notification problem must never turn into an extra CI failure, so both
// transport errors and non-2xx webhook responses only log and exit 0.
try {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`[slack] webhook failed [${res.status}]: ${body.slice(0, 500)}`);
    process.exit(0);
  }
  console.log("[slack] failure notification sent.");
} catch (err) {
  console.error(`[slack] webhook request error: ${err.message}`);
  process.exit(0);
}
