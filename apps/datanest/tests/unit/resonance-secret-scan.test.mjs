import test from "node:test";
import assert from "node:assert/strict";
import { findFindings, selfTest, SCANNER_VERSION } from "../../scripts/resonance-secret-scan.mjs";

test("uses the repository-owned Resonance Secret Integrity contract", () => {
  assert.equal(SCANNER_VERSION, "resonance-secret-integrity-v1");
  selfTest();
});

test("detects high-confidence secret forms", () => {
  const findings = findFindings(
    [
      "AWS_ACCESS_KEY_ID=" + "AKIA" + "1234567890ABCDEF",
      "-----BEGIN " + "PRIVATE KEY-----",
      "client" + "_secret = " + String.fromCharCode(34) + ["this","is","a","real","looking","secret","value","123"].join("-") + String.fromCharCode(34),
    ].join("\n"),
    "fixture/example.txt"
  );
  assert.ok(findings.some((item) => item.rule === "secret:aws-access-key"));
  assert.ok(findings.some((item) => item.rule === "secret:private-key-block"));
  assert.ok(findings.some((item) => item.rule === "secret:generic-assignment"));
  assert.ok(findings.every((item) => !item.detail.includes("real-looking-secret-value")));
});

test("ignores explicit placeholder credentials", () => {
  const findings = findFindings(
    String.fromCharCode(99,108,105,101,110,116,95,115,101,99,114,101,116,32,61,32,34,89,79,85,82,95,83,69,67,82,69,84,95,72,69,82,69,95,49,50,51,52,53,54,55,56,57,48,34),
    "fixture/placeholder.txt"
  );
  assert.equal(findings.length, 0);
});
