#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";

type Check = { label: string; ok: boolean; detail?: string };

const read = (path: string) => readFileSync(path, "utf8");
const manifestPath = "qa/premium-readiness/fixture-manifest.json";
const prereqScriptPath = "scripts/Test-RonsasPremiumReadiness.ps1";
const k6Path = "qa/performance/reson8-staging.k6.js";

const checks: Check[] = [
  { label: "fixture manifest exists", ok: existsSync(manifestPath) },
  { label: "staging prerequisite harness exists", ok: existsSync(prereqScriptPath) },
  { label: "k6 staging workload exists", ok: existsSync(k6Path) },
];

if (checks.every((check) => check.ok)) {
  const manifest = JSON.parse(read(manifestPath));
  const prereq = read(prereqScriptPath);
  const k6 = read(k6Path);

  const requiredApps = ["epublisher", "creative-studio", "sync-vision", "youtube-optimizer"];
  const apps = Array.isArray(manifest.apps) ? manifest.apps : [];
  const appMap = new Map(apps.map((app: any) => [app.id, app]));

  checks.push(
    {
      label: "minimum representative fixture count is at least 30",
      ok: Number(manifest.minimum_representative_fixtures_per_generative_app) >= 30,
    },
    {
      label: "generative cases require at least three repeat runs",
      ok: Number(manifest.repeat_runs_per_generative_case) >= 3,
    },
    {
      label: "representative categories cover normal/boundary/malformed/multilingual/ambiguous",
      ok: ["normal", "boundary", "malformed", "multilingual", "ambiguous"].every((value) =>
        Array.isArray(manifest.representative_categories) && manifest.representative_categories.includes(value),
      ),
    },
    {
      label: "critical failure allowance is zero",
      ok: Number(manifest.pass_targets?.critical_failures_max) === 0,
    },
    {
      label: "representative pass-rate target is at least 95%",
      ok: Number(manifest.pass_targets?.representative_run_pass_rate_min) >= 0.95,
    },
    {
      label: "ordinary API p95 target is no more than 750 ms",
      ok: Number(manifest.pass_targets?.ordinary_api_p95_ms_max) <= 750,
    },
    {
      label: "unexpected-error target is below 1%",
      ok: Number(manifest.pass_targets?.unexpected_error_rate_max) <= 0.01,
    },
  );

  for (const id of requiredApps) {
    const app: any = appMap.get(id);
    checks.push({
      label: `${id} fixture gate is configured at 30 or more`,
      ok: Boolean(app?.generative) && Number(app?.minimum_fixtures) >= 30 && typeof app?.fixture_directory === "string",
    });
  }

  const protectedHosts = [
    "reson8.life",
    "epublisher.reson8.life",
    "creative.reson8.life",
    "sync.reson8.life",
    "youtube.reson8.life",
    "career-compass.org",
    "career-compass-admin.org",
    "resonance-podcast.com",
  ];
  for (const host of protectedHosts) {
    checks.push({
      label: `PowerShell harness blocks production host ${host}`,
      ok: prereq.includes(host),
    });
    checks.push({
      label: `k6 harness blocks production host ${host}`,
      ok: k6.includes(host),
    });
  }

  checks.push(
    {
      label: "PowerShell harness requires explicit staging traffic opt-in",
      ok: /AllowStagingTraffic/.test(prereq) && /Traffic is disabled by default/.test(prereq),
    },
    {
      label: "PowerShell load mode requires explicit load-test approval",
      ok: /RONSAS_ALLOW_LOAD_TEST/.test(prereq),
    },
    {
      label: "k6 load script requires explicit load-test approval",
      ok: /RONSAS_ALLOW_LOAD_TEST/.test(k6) && /Load traffic is disabled/.test(k6),
    },
    {
      label: "k6 profiles do not invent non-smoke concurrency",
      ok: /requirePositiveInt\("RONSAS_BASELINE_VUS"\)/.test(k6)
        && /requirePositiveInt\("RONSAS_PEAK_VUS"\)/.test(k6)
        && /requirePositiveInt\("RONSAS_SPIKE_VUS"\)/.test(k6),
    },
    {
      label: "load thresholds enforce audit targets",
      ok: /http_req_failed:\s*\["rate<0\.01"\]/.test(k6)
        && /http_req_duration:\s*\["p\(95\)<750"\]/.test(k6),
    },
  );
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? "✓" : "✗"} ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
}

if (failed.length) {
  console.error(`\nverify-premium-readiness-harness failed: ${failed.length} invariant(s) violated.`);
  process.exit(1);
}

console.log("\n✓ premium-readiness harness invariants hold.");
