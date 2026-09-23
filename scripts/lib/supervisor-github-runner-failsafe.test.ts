import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const supervisor = readFileSync(
  new URL("../../ops/ealiophin/control-center/RONS-Supervisor.ps1", import.meta.url),
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
