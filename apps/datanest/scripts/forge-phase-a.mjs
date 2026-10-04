#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  validateExactShaIdentity,
  validateEvidenceForCandidate,
  validateRequiredEvidence,
  validateProductionPolicy,
  transitionPromotion
} from "../lib/resonance-forge-phase-a.mjs";

function usage() {
  console.error("Usage: forge-phase-a <validate-release|validate-evidence|validate-promotion> <json-file>");
  process.exitCode = 2;
}

const [, , command, filename] = process.argv;
if (!command || !filename) usage();
else {
  const file = path.resolve(filename);
  let input;
  try { input = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) {
    console.error(JSON.stringify({ valid: false, errors: [`cannot read JSON: ${error.message}`] }, null, 2));
    process.exitCode = 1;
  }

  if (input) {
    let result;
    if (command === "validate-release") {
      result = {
        identity: validateExactShaIdentity(input.candidate),
        productionPolicy: validateProductionPolicy(input.candidate, input.policy),
        evidence: validateRequiredEvidence(input.candidate?.evidenceRefs)
      };
      result.valid = Object.values(result).every(value => value.valid === true);
    } else if (command === "validate-evidence") {
      result = validateEvidenceForCandidate(input.evidence, input.candidate);
    } else if (command === "validate-promotion") {
      result = transitionPromotion(input.state, input.to, input.context ?? {});
    } else usage();
    console.log(JSON.stringify(result, null, 2));
    if (result && result.valid === false) process.exitCode = 1;
    if (result && result.ok === false) process.exitCode = 1;
  }
}
