import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const launcher = readFileSync(
  new URL("../../ops/ealiophin/ci/START-RONSAS-ACTIONS-RUNNER.ps1", import.meta.url),
  "utf8",
);

test("replacement runner waits for container and listener readiness", () => {
  expect(launcher).toContain("function Wait-RunnerContainerReady");
  expect(launcher).toContain("Runner.Listener");
  expect(launcher).toContain("Wait-RunnerContainerReady $Container 30 2");

  const onlineIndex = launcher.indexOf("if (-not $online)");
  const readinessIndex = launcher.indexOf("Wait-RunnerContainerReady $Container 30 2");
  const connectivityIndex = launcher.indexOf(
    "Wait-GovernedPodmanProxyConnectivity $Container 30 2",
  );

  expect(onlineIndex).toBeGreaterThan(-1);
  expect(readinessIndex).toBeGreaterThan(onlineIndex);
  expect(connectivityIndex).toBeGreaterThan(readinessIndex);
});

test("transient podman native errors are retryable instead of terminating recovery", () => {
  expect(launcher).toContain("function Test-GovernedPodmanProxyConnectivity");
  expect(launcher).toContain("function Get-RunnerProcessState");
  expect(launcher).toContain("$ErrorActionPreference = 'Continue'");
  expect(launcher).toContain("function Wait-GovernedPodmanProxyConnectivity");
  expect(launcher).toContain("for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++)");
  expect(launcher).toContain("Start-Sleep -Seconds $DelaySeconds");
});

test("existing safety gates remain intact", () => {
  expect(launcher).toContain("refusing unguarded replacement of an active runner");
  expect(launcher).toContain("ForceRecycle deferred because GitHub reports");
  expect(launcher).toContain("Deferring recycle rather than deleting an assigned runner");
});

test("default production labels remain unchanged while canary labels can be isolated", () => {
  expect(launcher).toContain("[string]$RunnerLabels = 'ronsas,ealiophin,sovereign'");
  expect(launcher).toContain('"RUNNER_LABELS=$RunnerLabels"');
});
