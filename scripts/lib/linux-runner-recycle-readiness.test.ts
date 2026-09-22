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
  const readinessIndex = launcher.indexOf("Wait-RunnerContainerReady $Container 30 2", onlineIndex);
  const connectivityIndex = launcher.indexOf(
    "Wait-GovernedPodmanProxyConnectivity $Container 30 2",
    readinessIndex,
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

test("stale online-busy recycle requires sustained idle proof and observable worker absence", () => {
  expect(launcher).toContain("observed = $false");
  expect(launcher).toContain("observed = $true");
  expect(launcher).toContain(
    "ForceRecycle deferred because the local runner process state could not be observed safely.",
  );
  expect(launcher).toContain("ForceRecycle deferred because local Runner.Worker is active");
  expect(launcher).toContain("$idleProofAttempts = 0");
  expect(launcher).toContain("$idleProofAttempts++");
  expect(launcher).toContain("stale-busy proof $idleProofAttempts/18");
  expect(launcher).toContain(
    "Treating the GitHub busy flag as stale and proceeding with guarded recycle.",
  );
  expect(launcher).toContain(
    "Runner busy state self-cleared during stale-busy proof; preserving the healthy online runner without recycle.",
  );

  const proofIndex = launcher.indexOf("$idleProofAttempts = 0");
  const staleIndex = launcher.indexOf("Treating the GitHub busy flag as stale");
  const disconnectIndex = launcher.indexOf(
    "Stopping the proven-idle runner container so GitHub can release the stale assignment",
  );
  const deleteIndex = launcher.indexOf("Removing GitHub runner registration for");
  expect(proofIndex).toBeGreaterThan(-1);
  expect(staleIndex).toBeGreaterThan(proofIndex);
  expect(disconnectIndex).toBeGreaterThan(staleIndex);
  expect(deleteIndex).toBeGreaterThan(disconnectIndex);
});

test("stale-busy proof still aborts on workflow activity, worker activity, or lost observability", () => {
  expect(launcher).toContain("new in-progress workflow work appeared");
  expect(launcher).toContain("local runner process state became unobservable");
  expect(launcher).toContain("Runner.Worker became active");
  expect(launcher).toContain("Deferring recycle rather than deleting an assigned runner");
});

test("proven stale-busy runner disconnects before deletion and fails closed if the assignment persists", () => {
  expect(launcher).toContain("$staleBusyProven = $false");
  expect(launcher).toContain("$staleBusyProven = $true");
  expect(launcher).toContain("& $podman stop --time 10 $Container");
  expect(launcher).toContain("GitHub released the stale assignment after proven-idle disconnect");
  expect(launcher).toContain("restoring the preserved runner container and deferring recycle");
  expect(launcher).toContain("& $podman start $Container | Out-Null");
});

test("online ForceRecycle deletion requires an explicit proven-release gate", () => {
  expect(launcher).toContain("$forceRecycleDeleteReady = $false");
  expect(launcher).toContain("$forceRecycleDeleteReady = $true");
  expect(launcher).toContain(
    "ForceRecycle deferred because online runner registration deletion was not proven safe.",
  );
  expect(launcher).toContain("($registered.status -ne 'online' -or $forceRecycleDeleteReady)");

  const gateIndex = launcher.indexOf(
    "ForceRecycle deferred because online runner registration deletion was not proven safe.",
  );
  const deleteIndex = launcher.indexOf("Removing GitHub runner registration for");
  expect(gateIndex).toBeGreaterThan(-1);
  expect(deleteIndex).toBeGreaterThan(gateIndex);
});

test("assigned-runner delete stderr is captured for guarded retry instead of terminating PowerShell", () => {
  expect(launcher).toContain("$priorErrorActionPreference = $ErrorActionPreference");
  expect(launcher).toContain("$deleteOutput = @()");
  expect(launcher).toContain("$deleteExit = 1");
  expect(launcher).toContain("$ErrorActionPreference = 'Continue'");
  expect(launcher).toContain(
    '$deleteOutput = @(& $gh api -X DELETE "repos/$Repository/actions/runners/$($registered.id)" 2>&1)',
  );
  expect(launcher).toContain("$deleteExit = [int]$LASTEXITCODE");
  expect(launcher).toContain("$ErrorActionPreference = $priorErrorActionPreference");
  expect(launcher).toContain("currently running a job");
  expect(launcher).toContain("HTTP 422");
});

test("workflow activity guard treats only target-runner job ownership as active", () => {
  expect(launcher).toContain("function Get-OtherInProgressWorkflowRuns");
  expect(launcher).toContain("Unable to inspect jobs for workflow run");
  expect(launcher).toContain("[string]$_.runner_name -eq $RunnerName");
  expect(launcher).not.toContain("$owned = $true");
});

test("stale-busy proof rejects GitHub job assignments on the production runner", () => {
  expect(launcher).toContain("function Get-ActiveRunnerAssignments");
  expect(launcher).toContain("runner_name");
  expect(launcher).toContain("$activeJobStates = @('queued','in_progress')");
  expect(launcher).toContain("active job assignment(s) on");
  expect(launcher).toContain("GitHub assigned work to the production runner");
  expect(launcher).toContain("${RunnerName}: $summary");
  expect(launcher).not.toContain("$RunnerName: $summary");
});

test("every post-stop deferral restores and verifies the preserved runner", () => {
  expect(launcher).toContain("function Restore-PreservedRunnerContainer");
  expect(launcher).toContain("Wait-RunnerContainerReady $Container 30 2");
  expect(launcher).toContain("Wait-GovernedPodmanProxyConnectivity $Container 30 2");
  expect(launcher).toContain(
    "Preserved runner container restored and verified before guarded recycle deferral.",
  );
  expect(launcher).toContain(
    "Restoring the preserved runner before deferring; a later guarded pass can retry.",
  );
});
