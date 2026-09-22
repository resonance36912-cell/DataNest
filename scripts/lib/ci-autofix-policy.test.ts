import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const remediate = readFileSync("scripts/Invoke-RonsasCiAutofix.ps1", "utf8");
const monitor = readFileSync("scripts/Watch-RonsasGitHubCI.ps1", "utf8");
const installer = readFileSync("scripts/Install-RonsasCiAutofixTask.ps1", "utf8");

describe("guarded CI autofix policy", () => {
  test("pins canonical GitHub account and origin", () => {
    expect(remediate).toContain("resonance36912-cell");
    expect(remediate).toContain("https://github.com/resonance36912-cell/RONSAS.git");
    expect(installer).toContain("resonance36912-cell");
  });

  test("never directly pushes or force-updates main", () => {
    expect(remediate).not.toMatch(/push[^\r\n]*origin[^\r\n]*main/i);
    expect(remediate).not.toMatch(/git push[^\r\n]*(--force|-f)/i);
    expect(remediate).not.toMatch(/gh pr merge[^\r\n]*--admin/i);
    expect(remediate).toContain("--base main");
  });

  test("limits code mutation to a current-main Prettier failure", () => {
    expect(remediate).toContain("Prettier format check");
    expect(remediate).toContain("scope -ne 'main'");
    expect(remediate).toContain("isolated autofix worktree");
    expect(remediate).toContain("bun run prebuild");
    expect(remediate).toContain("bun test");
    expect(remediate).toContain("bun x tsc --noEmit");
  });

  test("uses rerun only for transient run conclusions", () => {
    expect(remediate).toContain("'timed_out','startup_failure'");
    expect(remediate).toContain("gh run rerun");
  });

  test("closes only stale monitor-owned triage issues", () => {
    expect(remediate).toContain("Resolve-StaleTriageIssues");
    expect(remediate).toContain("StartsWith('[RONSAS CI] ')");
    expect(remediate).toContain("Automated RONSAS CI monitor detected a current-head failure.");
    expect(remediate).toContain("'number,title,body,url'");
    expect(remediate).toContain("Contains($monitorMarker)");
    expect(remediate).toContain("$activeTitles.ContainsKey");
    expect(remediate).toContain("gh issue close");
    expect(remediate).toContain("Resolve-StaleTriageIssues -CurrentFailures $failures");
  });

  test("runs remediation after state write even when current heads are green", () => {
    const stateWrite = monitor.indexOf("$state | ConvertTo-Json");
    const remediation = monitor.indexOf("if ($AutoRemediate)");
    const failureBranch = monitor.indexOf("if ($currentFailures.Count -gt 0)");
    expect(stateWrite).toBeGreaterThan(-1);
    expect(remediation).toBeGreaterThan(stateWrite);
    expect(failureBranch).toBeGreaterThan(remediation);
  });

  test("monitor remediation is opt-in and scheduled installer enables it", () => {
    expect(monitor).toContain("AutoRemediate");
    expect(installer).toContain("-AutoRemediate");
    expect(installer).toContain("RONSAS GitHub CI Monitor");
    expect(installer).toContain("EveryMinutes = 15");
    expect(installer).toContain("Register-ScheduledTask");
    expect(installer).not.toContain("schtasks.exe");
  });
});
