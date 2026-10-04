import crypto from "node:crypto";
import { isSha } from "./resonance-forge-phase-a.mjs";

export const RECONCILIATION_SCHEMA_VERSION = 1;
export const OUTCOMES = Object.freeze(["new", "duplicate", "updated", "conflict", "blocked"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

export function candidateLineage(observation) {
  return [
    observation?.repository ?? "",
    observation?.candidateId ?? "",
    observation?.commitSha ?? "",
    observation?.canonicalBaseSha ?? "",
    observation?.environment ?? "",
    observation?.manifestDigest ?? ""
  ].join("|");
}

function validateObservation(observation) {
  const errors = [];
  if (!observation || typeof observation !== "object") return ["observation is required"];
  if (!observation.sourceId || typeof observation.sourceId !== "string") errors.push("sourceId is required");
  if (!observation.repository || typeof observation.repository !== "string") errors.push("repository is required");
  if (!isSha(observation.commitSha)) errors.push("exact commit SHA is required");
  if (observation.canonicalBaseSha !== undefined && !isSha(observation.canonicalBaseSha)) errors.push("canonicalBaseSha must be an exact SHA when provided");
  if (!observation.candidateId || typeof observation.candidateId !== "string") errors.push("candidateId is required");
  if (!observation.environment || typeof observation.environment !== "string") errors.push("environment is required");
  if (!observation.manifestDigest || typeof observation.manifestDigest !== "string" || !observation.manifestDigest.trim()) errors.push("manifestDigest is required");
  if (!observation.observedAt || Number.isNaN(Date.parse(observation.observedAt))) errors.push("observedAt must be an ISO date-time");
  if (!observation.payloadDigest || !/^[0-9a-f]{64}$/.test(observation.payloadDigest)) errors.push("payloadDigest must be a SHA-256 digest");
  return errors;
}

export function createOperationId(observation) {
  const errors = validateObservation(observation);
  if (errors.length) throw new Error(errors.join("; "));
  return sha256({
    schemaVersion: RECONCILIATION_SCHEMA_VERSION,
    sourceId: observation.sourceId,
    repository: observation.repository,
    commitSha: observation.commitSha,
    candidateId: observation.candidateId,
    canonicalBaseSha: observation.canonicalBaseSha ?? null,
    environment: observation.environment,
    manifestDigest: observation.manifestDigest
  });
}

export function reconcileObservation(observation, prior = []) {
  const errors = validateObservation(observation);
  if (errors.length) {
    return {
      outcome: "blocked",
      operationId: null,
      sourceId: observation?.sourceId ?? null,
      repository: observation?.repository ?? null,
      commitSha: observation?.commitSha ?? null,
      observedAt: observation?.observedAt ?? null,
      inputDigest: observation?.payloadDigest ?? null,
      reason: errors.join("; ")
    };
  }

  const operationId = createOperationId(observation);
  const lineage = candidateLineage(observation);
  const priorRecords = Array.isArray(prior) ? prior : [];
  const sameOperation = priorRecords.find(r => r.operationId === operationId);
  const sameLineage = priorRecords.filter(r => r.lineage === lineage);

  let outcome = "new";
  let reason = null;

  if (sameOperation) {
    outcome = sameOperation.inputDigest === observation.payloadDigest ? "duplicate" : "conflict";
    reason = outcome === "conflict" ? "existing operation identity has a different input digest" : null;
  } else if (sameLineage.length > 0) {
    const latest = [...sameLineage].sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt))).at(-1);
    if (latest.inputDigest === observation.payloadDigest) {
      outcome = "updated";
    } else {
      outcome = "updated";
    }
  }

  return {
    schemaVersion: RECONCILIATION_SCHEMA_VERSION,
    operationId,
    sourceId: observation.sourceId,
    repository: observation.repository,
    commitSha: observation.commitSha,
    candidateId: observation.candidateId,
    lineage,
    observedAt: observation.observedAt,
    inputDigest: observation.payloadDigest,
    outcome,
    reason
  };
}

export function reconcileBatch(observations = [], prior = []) {
  const accepted = [];
  const rejected = [];
  for (const observation of observations) {
    const record = reconcileObservation(observation, prior);
    if (record.outcome === "blocked" || record.outcome === "conflict") rejected.push(record);
    else accepted.push(record);
  }
  accepted.sort((a, b) => a.operationId.localeCompare(b.operationId));
  rejected.sort((a, b) => String(a.operationId ?? "").localeCompare(String(b.operationId ?? "")));
  return { accepted, rejected };
}

export function validateReconciliationRecord(record) {
  const errors = [];
  if (record?.schemaVersion !== RECONCILIATION_SCHEMA_VERSION) errors.push("schemaVersion must be 1");
  if (!record?.operationId || !/^[0-9a-f]{64}$/.test(record.operationId)) errors.push("operationId must be a SHA-256 digest");
  if (!record?.lineage) errors.push("lineage is required");
  if (!OUTCOMES.includes(record?.outcome)) errors.push("invalid reconciliation outcome");
  if (!record?.sourceId) errors.push("sourceId is required");
  if (!record?.repository) errors.push("repository is required");
  if (!isSha(record?.commitSha)) errors.push("exact commit SHA is required");
  if (!record?.observedAt || Number.isNaN(Date.parse(record.observedAt))) errors.push("observedAt must be an ISO date-time");
  if (!record?.inputDigest || !/^[0-9a-f]{64}$/.test(record.inputDigest)) errors.push("inputDigest must be a SHA-256 digest");
  if ((record?.outcome === "conflict" || record?.outcome === "blocked") && !record?.reason) errors.push("conflict/blocked records require a reason");
  return { valid: errors.length === 0, errors };
}
