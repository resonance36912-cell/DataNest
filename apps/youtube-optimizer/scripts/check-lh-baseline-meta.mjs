#!/usr/bin/env node
/**
 * Validate Lighthouse baseline provenance.
 *
 *   bun run check:lh-baseline
 *
 * A refreshed baseline must be an auditable change: `.lighthouse/baseline.json`
 * carries a `__meta` block written by scripts/lh-baseline-refresh.mjs, and
 * `.lighthouse/BASELINE_LOG.md` records the same refresh. This check fails the
 * PR before the Lighthouse gate / PR comment step when that provenance is
 * missing, so nobody can quietly move the numbers.
 *
 * When BASE_REF is set (CI pull requests), the baseline is only required to
 * have *fresh* provenance if the file actually changed in the PR.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { baselinePath, resolveTrack } from "./lh-track.mjs";

const TRACK = resolveTrack(process.env);
const BASELINE_PATH = baselinePath(TRACK);
const LOG_PATH = ".lighthouse/BASELINE_LOG.md";
const MIN_REASON_LENGTH = 10;

const fail = (msgs) => {
  console.error("[lh-baseline-meta] FAIL");
  for (const m of msgs) console.error(`  - ${m}`);
  console.error(
    '\n  Refresh baselines with: bun run gate:lighthouse:refresh -- --reason "why the numbers moved"',
  );
  process.exit(1);
};

if (!existsSync(BASELINE_PATH)) {
  console.log(`[lh-baseline-meta] no ${BASELINE_PATH} yet — nothing to validate.`);
  process.exit(0);
}

let stored;
try {
  stored = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch (err) {
  fail([`${BASELINE_PATH} is not valid JSON: ${err.message}`]);
}

const meta = stored.__meta;
const errors = [];

if (!meta || typeof meta !== "object") {
  errors.push(
    `${BASELINE_PATH} has no "__meta" provenance block — it was written by hand or by an older tool.`,
  );
} else {
  const reason = typeof meta.reason === "string" ? meta.reason.trim() : "";
  if (reason.length < MIN_REASON_LENGTH) {
    errors.push(
      `__meta.reason is missing or too short (needs ${MIN_REASON_LENGTH}+ chars describing why the baseline moved).`,
    );
  }
  if (!meta.updatedAt || Number.isNaN(Date.parse(meta.updatedAt))) {
    errors.push("__meta.updatedAt is missing or not an ISO timestamp.");
  }
  if (!meta.by) errors.push("__meta.by is missing — the refresh has no recorded author.");
  if (!meta.commit) errors.push("__meta.commit is missing — the refresh has no recorded commit.");
  if (meta.track && meta.track !== TRACK) {
    errors.push(
      `__meta.track is "${meta.track}" but this run validates the "${TRACK}" track — baselines from another environment must not be committed here.`,
    );
  }
  if (!meta.routes) {
    errors.push('__meta.routes is missing — expected "all" or the list of refreshed routes.');
  }
}

const routeKeys = Object.keys(stored).filter((k) => k !== "__meta");
if (!routeKeys.length) errors.push(`${BASELINE_PATH} contains no route baselines.`);

// The refresh log must mention the recorded refresh, so history stays readable.
if (meta?.updatedAt && !errors.length) {
  if (!existsSync(LOG_PATH)) {
    errors.push(`${LOG_PATH} is missing — every refresh must be logged.`);
  } else if (!readFileSync(LOG_PATH, "utf8").includes(meta.updatedAt)) {
    errors.push(
      `${LOG_PATH} has no entry for __meta.updatedAt (${meta.updatedAt}) — the log and baseline disagree.`,
    );
  }
}

// PR-scoped check: if the baseline changed, its provenance must have changed too.
const baseRef = (process.env["BASE_REF"] ?? "").trim();
if (baseRef && meta?.updatedAt) {
  const show = spawnSync("git", ["show", `${baseRef}:${BASELINE_PATH}`], { encoding: "utf8" });
  if (show.status === 0) {
    let previous = null;
    try {
      previous = JSON.parse(show.stdout);
    } catch {
      previous = null;
    }
    const changed = show.stdout !== readFileSync(BASELINE_PATH, "utf8");
    if (changed && previous?.__meta?.updatedAt === meta.updatedAt) {
      errors.push(
        `${BASELINE_PATH} changed vs ${baseRef} but __meta.updatedAt is unchanged — the numbers were edited without a recorded refresh.`,
      );
    }
  }
}

if (errors.length) fail(errors);

console.log(
  `[lh-baseline-meta] PASS — track "${TRACK}", ${routeKeys.length} route baseline(s), refreshed ${meta.updatedAt} by ${meta.by} (${meta.commit}): ${meta.reason}`,
);
