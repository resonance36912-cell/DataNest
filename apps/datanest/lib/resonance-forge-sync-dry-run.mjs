import crypto from "node:crypto";
import { ingestEvents } from "./resonance-forge-event-ingestion.mjs";
import { ingestEvidence } from "./resonance-forge-evidence-ingestion.mjs";
import { reconcileBatch } from "./resonance-forge-reconciliation.mjs";
import { validateEvidenceForCandidate } from "./resonance-forge-phase-a.mjs";

export const SYNC_DRY_RUN_SCHEMA_VERSION = 1;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
export function canonicalJson(value) { return JSON.stringify(stable(value)); }
export function sha256(value) { return crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex"); }

function validateCandidate(candidate) {
  const errors = [];
  if (!candidate?.candidateId) errors.push("candidateId is required");
  if (!candidate?.repository) errors.push("repository is required");
  if (!candidate?.commitSha || !/^[0-9a-f]{40}$/.test(candidate.commitSha)) errors.push("candidate exact commit SHA is required");
  if (candidate?.canonicalBaseSha !== undefined && !/^[0-9a-f]{40}$/.test(candidate.canonicalBaseSha)) errors.push("canonicalBaseSha must be an exact SHA");
  if (!candidate?.environment) errors.push("candidate environment is required");
  if (!candidate?.manifestDigest || typeof candidate.manifestDigest !== "string") errors.push("manifestDigest is required");
  return errors;
}

export function createSyncObservation(candidate, event, evidence) {
  const evidenceBinding = validateEvidenceForCandidate(evidence, candidate);
  if (!evidenceBinding.valid) throw new Error(evidenceBinding.errors.join("; "));
  if (event.repository !== candidate.repository || event.commitSha !== candidate.commitSha) {
    throw new Error("event repository/SHA does not match candidate");
  }
  const sourceId = sha256({ eventId: event.eventId, evidenceId: evidence.evidenceId });
  const payloadDigest = sha256({ event, evidence });
  return {
    sourceId,
    repository: candidate.repository,
    commitSha: candidate.commitSha,
    candidateId: candidate.candidateId,
    canonicalBaseSha: candidate.canonicalBaseSha,
    environment: candidate.environment,
    manifestDigest: candidate.manifestDigest,
    observedAt: evidence.observedAt ?? event.observedAt,
    payloadDigest
  };
}

export function runSyncDryRun(input) {
  const candidateErrors = validateCandidate(input?.candidate);
  if (candidateErrors.length) throw new Error(candidateErrors.join("; "));
  const eventsResult = ingestEvents(input.events ?? []);
  const evidenceResult = ingestEvidence(input.evidence ?? [], input.candidate);
  const usable = [];
  const pairingErrors = [];

  for (const event of eventsResult.accepted) {
    for (const evidence of evidenceResult.accepted) {
      try {
        usable.push(createSyncObservation(input.candidate, event, evidence));
      } catch (error) {
        pairingErrors.push({ eventId: event.eventId, evidenceId: evidence.evidenceId, reason: error.message });
      }
    }
  }

  const reconciliation = reconcileBatch(usable, input.prior ?? []);
  return {
    schemaVersion: SYNC_DRY_RUN_SCHEMA_VERSION,
    mode: "read-only-dry-run",
    authority: "github-canonical",
    candidateId: input.candidate.candidateId,
    repository: input.candidate.repository,
    commitSha: input.candidate.commitSha,
    eventIngestion: { accepted: eventsResult.accepted, rejected: eventsResult.rejected },
    evidenceIngestion: { accepted: evidenceResult.accepted, rejected: evidenceResult.rejected },
    pairingErrors,
    reconciliation,
    authorizationGranted: false,
    productionMutation: false
  };
}
