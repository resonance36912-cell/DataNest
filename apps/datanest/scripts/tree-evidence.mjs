import { createHash } from "node:crypto";

// Shared observation contract. Missing evidence never means a passing check.
export function inspectTreeEvidence(feed, schemaVersion, maxAgeMinutes, now = new Date()) {
  const generated = Date.parse(feed?.generatedAt || "");
  const age = (now.getTime() - generated) / 60000;
  const reasons = [];
  if (feed?.schemaVersion !== schemaVersion) reasons.push("missing-or-invalid-schema");
  if (feed?.productionAuthorization !== false) reasons.push("invalid-authority");
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMinutes) reasons.push("missing-future-or-stale-timestamp");
  return {
    valid: reasons.length === 0,
    reasons,
    generatedAt: feed?.generatedAt || null,
    ageMinutes: Number.isFinite(age) ? age : null,
    maxAgeMinutes,
    headSha: feed?.headSha || null,
    digest: "sha256:" + createHash("sha256").update(JSON.stringify(feed ?? null)).digest("hex")
  };
}
