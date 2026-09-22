import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const startScript = readFileSync(
  new URL("../../ops/ealiophin/cluster/START-RONSAS-ECOSYSTEM.ps1", import.meta.url),
  "utf8",
);

test("ePublisher STT runtime is refreshed from governed source before listeners start", () => {
  expect(startScript).toContain("$sttSource = Join-Path $opsRuntime 'syncvision-local-stt.py'");
  expect(startScript).toContain("$sttTarget = Join-Path $Runtime 'syncvision-local-stt.py'");
  expect(startScript).toContain("Copy-Item -LiteralPath $sttSource -Destination $sttTarget -Force");

  const copyIndex = startScript.indexOf("Copy-Item -LiteralPath $sttSource -Destination $sttTarget -Force");
  const localStartIndex = startScript.indexOf("Start-PythonService 'local-stt' 7864");
  const epublisherStartIndex = startScript.indexOf("Start-PythonService 'epublisher-stt' 7869");

  expect(copyIndex).toBeGreaterThan(-1);
  expect(copyIndex).toBeLessThan(localStartIndex);
  expect(copyIndex).toBeLessThan(epublisherStartIndex);
});
