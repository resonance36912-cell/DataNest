import crypto from "node:crypto";
import { isSha, validateEvidenceForCandidate } from "./resonance-forge-phase-a.mjs";

export const EVIDENCE_SCHEMA_VERSION = 1;
const TYPES = new Set(["unit","type","dependency","security","visual","browser","ai-certification","audit-optimizer","ronsas","governance","backend-attestation","human-authorization"]);
const RESULTS = new Set(["pass","fail","warning","pending"]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function createEvidenceEnvelope(input) {
  if (!input?.candidateId || !input?.repository || !isSha(input?.commitSha) || !input?.type || !TYPES.has(input.type) || !RESULTS.has(input?.result) || !input?.producer) {
    throw new Error("candidateId, repository, exact commit SHA, valid type/result, and producer are required");
  }
  const body = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    candidateId: input.candidateId,
    repository: input.repository,
    commitSha: input.commitSha,
    type: input.type,
    result: input.result,
    producer: input.producer
  };
  if (input.artifactRefs !== undefined) body.artifactRefs = [...input.artifactRefs];
  if (input.observedAt !== undefined) body.observedAt = input.observedAt;
  if (input.supersedes !== undefined) body.supersedes = input.supersedes;
  const evidenceId = digest(body);
  return { ...body, evidenceId, digest: digest(body) };
}

export function validateEvidenceEnvelope(evidence, candidate = null) {
  const errors = [];
  if (evidence?.schemaVersion !== EVIDENCE_SCHEMA_VERSION) errors.push("schemaVersion must be 1");
  if (!evidence?.evidenceId) errors.push("evidenceId is required");
  if (!isSha(evidence?.commitSha)) errors.push("exact commit SHA is required");
  if (!evidence?.candidateId) errors.push("candidateId is required");
  if (!evidence?.repository) errors.push("repository is required");
  if (!TYPES.has(evidence?.type)) errors.push("invalid evidence type");
  if (!RESULTS.has(evidence?.result)) errors.push("invalid evidence result");
  if (!evidence?.producer) errors.push("producer is required");
  if (evidence?.observedAt !== undefined && Number.isNaN(Date.parse(evidence.observedAt))) errors.push("observedAt must be an ISO date-time");
  if (candidate) {
    const binding = validateEvidenceForCandidate(evidence, candidate);
    if (!binding.valid) errors.push(...binding.errors);
    if (evidence.candidateId !== candidate.candidateId) errors.push("evidence candidateId does not match candidate");
  }
  if (evidence?.digest) {
    const { evidenceId, digest: ignored, ...body } = evidence;
    if (evidence.evidenceId !== digest(body)) errors.push("evidenceId does not match canonical evidence body");
    if (evidence.digest !== digest(body)) errors.push("digest does not match canonical evidence body");
  }
  return { valid: errors.length === 0, errors };
}

export function ingestEvidence(evidenceItems, candidate = null) {
  const accepted = new Map();
  const rejected = [];
  for (const item of evidenceItems ?? []) {
    try {
      const envelope = item?.evidenceId ? item : createEvidenceEnvelope(item);
      const validation = validateEvidenceEnvelope(envelope, candidate);
      if (!validation.valid) { rejected.push({ item, errors: validation.errors }); continue; }
      if (!accepted.has(envelope.evidenceId)) accepted.set(envelope.evidenceId, envelope);
    } catch (error) {
      rejected.push({ item, errors: [error.message] });
    }
  }
  return {
    accepted: [...accepted.values()].sort((a,b) => a.evidenceId.localeCompare(b.evidenceId)),
    rejected
  };
}
