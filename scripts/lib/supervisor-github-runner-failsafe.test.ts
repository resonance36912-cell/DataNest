import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const supervisor = readFileSync(
  new URL("../../ops/ealiophin/control-center/RONS-Supervisor.ps1", import.meta.url),
  "utf8",
);
const windowsInstaller = readFileSync(
  new URL("../../ops/ealiophin/ci/INSTALL-RONSAS-WINDOWS-RUNNER.ps1", import.meta.url),
  "utf8",
);

test("legacy control configs fall back to the exact governed runner launcher", () => {
  expect(supervisor).toContain(
    "Documents\\GitHub\\rons-sovereign-codebase\\ops\\ealiophin\\ci\\START-RONSAS-ACTIONS-RUNNER.ps1",
  );
  expect(supervisor).toContain(
    "$configured = ($Config.autonomy.PSObject.Properties.Name -contains 'ensureGitHubRunner')",
  );
  expect(supervisor).toContain(
    "if ($configured -and -not [bool]$Config.autonomy.ensureGitHubRunner) { return }",
  );
  expect(supervisor).toContain("$startup = $DefaultGitHubRunnerStartup");
});

test("supervisor invokes the launcher without ForceRecycle and preserves launcher safety gates", () => {
  expect(supervisor).toContain(
    "$output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startup 2>&1)",
  );
  expect(supervisor).not.toContain("-ForceRecycle");
});

test("runner recovery failures use bounded exponential backoff", () => {
  expect(supervisor).toContain("$runnerFailures = 0");
  expect(supervisor).toContain("$nextRunnerAttempt = [datetime]::MinValue");
  expect(supervisor).toContain("if ((Get-Date) -lt $script:nextRunnerAttempt) { return }");
  expect(supervisor).toContain("$script:runnerFailures++");
  expect(supervisor).toContain(
    "[int]$Config.autonomy.maxRestartBackoffSeconds",
  );
  expect(supervisor).toContain(
    "[int](60 * [math]::Pow(2, [math]::Min($script:runnerFailures - 1, 5)))",
  );
  expect(supervisor).toContain(
    "$script:nextRunnerAttempt = (Get-Date).AddSeconds($delay)",
  );
});

test("successful recovery resets supervisor runner backoff state", () => {
  expect(supervisor).toContain("$script:runnerFailures = 0");
  expect(supervisor).toContain("$script:nextRunnerAttempt = [datetime]::MinValue");
  expect(supervisor).toContain("if ($exitCode -eq 0)");
});


test("Windows runner watchdog only restores an existing installation", () => {
  expect(supervisor).toContain(
    "Documents\\GitHub\\rons-sovereign-codebase\\ops\\ealiophin\\ci\\INSTALL-RONSAS-WINDOWS-RUNNER.ps1",
  );
  expect(supervisor).toContain(
    "Resonance\\RONS-GitHubRunner-Windows",
  );
  expect(supervisor).toContain(
    "$DefaultWindowsRunnerTask = 'RONSAS GitHub Windows Runner'",
  );
  expect(supervisor).toContain(
    "if (-not $existingTask -and -not $existingRoot) { return }",
  );
  expect(supervisor).toContain("Ensure-WindowsGitHubRunner");
});

test("Windows runner watchdog respects explicit disables and uses no forced recycle", () => {
  expect(supervisor).toContain(
    "if ($overallConfigured -and -not [bool]$Config.autonomy.ensureGitHubRunner) { return }",
  );
  expect(supervisor).toContain(
    "if ($windowsConfigured -and -not [bool]$Config.autonomy.ensureWindowsGitHubRunner) { return }",
  );
  expect(supervisor).not.toContain("-ForceRecycle");
});

test("Windows runner recovery has independent bounded backoff", () => {
  expect(supervisor).toContain("$windowsRunnerFailures = 0");
  expect(supervisor).toContain("$nextWindowsRunnerAttempt = [datetime]::MinValue");
  expect(supervisor).toContain(
    "if ((Get-Date) -lt $script:nextWindowsRunnerAttempt) { return }",
  );
  expect(supervisor).toContain("$script:windowsRunnerFailures++");
  expect(supervisor).toContain(
    "$script:nextWindowsRunnerAttempt = (Get-Date).AddSeconds($delay)",
  );
});


test("supervisor refuses stale Linux recovery authority before execution", () => {
  expect(supervisor).toContain("Runner.Worker");
  expect(supervisor).toContain("Get-ActiveRunnerAssignments");
  expect(supervisor).toContain(
    "for ($settleAttempt = 1; $settleAttempt -le 18; $settleAttempt++)",
  );
  expect(supervisor).toContain(
    "ForceRecycle deferred because online runner registration deletion was not proven safe.",
  );
  expect(supervisor).toContain(
    "GitHub runner recovery authority is stale; missing safeguard marker",
  );

  const markerIndex = supervisor.indexOf("$requiredMarkers = @(");
  const launchIndex = supervisor.indexOf(
    "$output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startup 2>&1)",
  );
  expect(markerIndex).toBeGreaterThan(-1);
  expect(launchIndex).toBeGreaterThan(markerIndex);
});


test("Windows runner scheduled task has logon and periodic restart triggers", () => {
  expect(windowsInstaller).toContain(
    "$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userId",
  );
  expect(windowsInstaller).toContain(
    "$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2)",
  );
  expect(windowsInstaller).toContain(
    "-RepetitionInterval (New-TimeSpan -Minutes 5)",
  );
  expect(windowsInstaller).toContain(
    "Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($logonTrigger,$watchdogTrigger)",
  );
  expect(windowsInstaller).toContain("-MultipleInstances IgnoreNew");
});


test("Windows installer verifies GitHub online state instead of trusting a local listener", () => {
  expect(windowsInstaller).toContain("function Get-GitHubRunnerRegistration");
  expect(windowsInstaller).toContain(
    "if ($running -and $registered -and [string]$registered.status -eq 'online')",
  );
  expect(windowsInstaller).toContain(
    "Runner.Listener exists but GitHub is not online while Runner.Worker PID",
  );
  expect(windowsInstaller).toContain(
    "Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue",
  );
  expect(windowsInstaller).toContain(
    "Stop-Process -Id $running.ProcessId -Force -ErrorAction Stop",
  );

  const workerGuard = windowsInstaller.indexOf(
    "Runner.Listener exists but GitHub is not online while Runner.Worker PID",
  );
  const stopListener = windowsInstaller.indexOf(
    "Stop-Process -Id $running.ProcessId -Force -ErrorAction Stop",
  );
  expect(workerGuard).toBeGreaterThan(-1);
  expect(stopListener).toBeGreaterThan(workerGuard);
});

test("Windows installer requires bounded GitHub re-registration visibility after restart", () => {
  expect(windowsInstaller).toContain(
    "for ($attempt = 1; $attempt -le 12; $attempt++)",
  );
  expect(windowsInstaller).toContain(
    "Waiting for GitHub runner registration to become online; attempt $attempt/12.",
  );
  expect(windowsInstaller).toContain(
    "RONSAS Windows runner process is running locally but GitHub did not report it online within the bounded verification window.",
  );
  expect(windowsInstaller).toContain(
    "Windows runner stayed offline in GitHub while Runner.Worker PID",
  );
});


test("Windows installer can re-register when GitHub registration is missing", () => {
  expect(windowsInstaller).toContain(
    "if (-not $registered -and (Test-Path -LiteralPath $runnerConfig -PathType Leaf))",
  );
  expect(windowsInstaller).toContain(
    "GitHub runner registration is missing while Runner.Worker PID",
  );
  expect(windowsInstaller).toContain(
    "Remove-Item -LiteralPath $runnerConfig -Force -ErrorAction Stop",
  );
  expect(windowsInstaller).toContain(
    "Cleared stale local .runner marker after GitHub registration was proven missing.",
  );

  const workerGuard = windowsInstaller.indexOf(
    "GitHub runner registration is missing while Runner.Worker PID",
  );
  const removeMarker = windowsInstaller.indexOf(
    "Remove-Item -LiteralPath $runnerConfig -Force -ErrorAction Stop",
  );
  expect(workerGuard).toBeGreaterThan(-1);
  expect(removeMarker).toBeGreaterThan(workerGuard);
});


test("supervisor refuses stale Windows recovery authority before execution", () => {
  expect(supervisor).toContain("function Get-LocalRunnerWorker");
  expect(supervisor).toContain(
    "Multiple GitHub runner registrations found for $RunnerName; refusing automatic recovery.",
  );
  expect(supervisor).toContain(
    "GitHub runner registration is missing while Runner.Worker PID",
  );
  expect(supervisor).toContain(
    "RONSAS Windows runner process is running locally but GitHub did not report it online within the bounded verification window.",
  );
  expect(supervisor).toContain(
    "Windows GitHub runner recovery authority is stale; missing safeguard marker",
  );

  const markerIndex = supervisor.indexOf("$requiredWindowsMarkers = @(");
  const launchIndex = supervisor.indexOf(
    "$output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer 2>&1)",
  );
  expect(markerIndex).toBeGreaterThan(-1);
  expect(launchIndex).toBeGreaterThan(markerIndex);
});

test("Windows runner installer has no unrelated Git CLI dependency", () => {
  expect(windowsInstaller).not.toContain("Get-Command git.exe");
});
