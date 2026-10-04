import crypto from "node:crypto";

export const RECOVERY_SCHEMA_VERSION = 1;
export const RETAINED_OUTCOMES = ["accepted", "duplicate", "updated", "conflict", "blocked"];

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

export function createRecoverySnapshot(input) {
  if (!input || typeof input !== "object") throw new Error("snapshot input is required");
  if (!isSha(input.commitSha) || !isSha(input.canonicalBaseSha)) throw new Error("snapshot requires exact commit SHAs");
  if (typeof input.repository !== "string" || !input.repository.includes("/")) throw new Error("repository is required");
  if (typeof input.environment !== "string" || !input.environment) throw new Error("environment is required");
  if (typeof input.manifestDigest !== "string" || !input.manifestDigest) throw new Error("manifestDigest is required");

  const snapshot = {
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    repository: input.repository,
    commitSha: input.commitSha,
    canonicalBaseSha: input.canonicalBaseSha,
    environment: input.environment,
    manifestDigest: input.manifestDigest,
    events: input.events ?? [],
    evidence: input.evidence ?? [],
    reconciliation: input.reconciliation ?? [],
    createdAt: input.createdAt,
  };

  const digest = sha256(snapshot);
  return { ...snapshot, snapshotDigest: digest };
}

export function validateRecoverySnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== RECOVERY_SCHEMA_VERSION) throw new Error("invalid recovery schema");
  if (!isSha(snapshot.commitSha) || !isSha(snapshot.canonicalBaseSha)) throw new Error("invalid snapshot SHA identity");
  if (typeof snapshot.repository !== "string" || !snapshot.repository.includes("/")) throw new Error("invalid repository");
  if (!Array.isArray(snapshot.events) || !Array.isArray(snapshot.evidence) || !Array.isArray(snapshot.reconciliation)) {
    throw new Error("snapshot collections must be arrays");
  }
  if (!/^[0-9a-f]{64}$/i.test(snapshot.snapshotDigest ?? "")) throw new Error("invalid snapshot digest");
  const { snapshotDigest, ...unsigned } = snapshot;
  if (sha256(unsigned) !== snapshotDigest) throw new Error("snapshot digest mismatch");
  if (snapshot.authorizationGranted === true || snapshot.productionMutation === true) {
    throw new Error("recovery snapshot cannot grant authority");
  }
  return true;
}

export function retentionDecision(outcome) {
  if (!RETAINED_OUTCOMES.includes(outcome)) throw new Error("unknown retention outcome");
  return {
    outcome,
    retain: true,
    replayable: true,
    deletionRequiresExplicitReview: outcome === "conflict" || outcome === "blocked",
  };
}

export function validatePortableSnapshot(snapshot) {
  validateRecoverySnapshot(snapshot);
  const text = stableJson(snapshot);
  const roundTrip = Buffer.from(text, "utf8").toString("utf8");
  if (roundTrip !== text) throw new Error("UTF-8 encoding failure");
  if (snapshot.repository !== snapshot.repository.trim()) throw new Error("repository contains surrounding whitespace");
  return { portable: true, encoding: "utf-8", digestAlgorithm: "sha256" };
}
