import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const recovery = readFileSync(
  "ops/ealiophin/control-center/RONS-Recover-Suite.ps1",
  "utf8",
);
const acceptance = readFileSync(
  "ops/ealiophin/runtime/FINAL-RONS-ACCEPTANCE.ps1",
  "utf8",
);

test("recovery waits for the exact acceptance success marker", () => {
  expect(acceptance).toContain("RONSAS ACCEPTANCE PASSED:");
  expect(recovery).toContain("-SuccessMarker 'RONSAS ACCEPTANCE PASSED:'");
  expect(recovery).not.toContain("-SuccessMarker 'RONS ACCEPTANCE PASSED:'");
});
