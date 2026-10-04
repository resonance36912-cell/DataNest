import { isSha } from "./resonance-forge-phase-a.mjs";

export const PROMOTION_SCHEMA_VERSION = 1;

export function createPromotionRecord({ candidateId, commitSha, state = "r_and_d", at }) {
  if (!candidateId || !isSha(commitSha) || !at || Number.isNaN(Date.parse(at))) {
    throw new Error("candidateId, exact commit SHA, and ISO timestamp are required");
  }
  return {
    schemaVersion: PROMOTION_SCHEMA_VERSION,
    candidateId,
    commitSha,
    state,
    history: [{ from: null, to: state, at, evidenceRef: null }]
  };
}

export function appendPromotionTransition(record, transition) {
  if (!record || !isSha(record.commitSha)) throw new Error("promotion record requires exact commit SHA");
  if (!transition?.to || !transition?.at || Number.isNaN(Date.parse(transition.at))) {
    throw new Error("transition requires target state and ISO timestamp");
  }
  if (transition.commitSha && transition.commitSha !== record.commitSha) {
    throw new Error("promotion transition commit SHA must match candidate");
  }
  if (transition.evidenceRef !== undefined && transition.evidenceRef !== null && typeof transition.evidenceRef !== "string") {
    throw new Error("evidenceRef must be a string or null");
  }
  return {
    ...record,
    state: transition.to,
    history: [
      ...record.history,
      {
        from: record.state,
        to: transition.to,
        at: transition.at,
        evidenceRef: transition.evidenceRef ?? null
      }
    ]
  };
}

export function validatePromotionProvenance(record) {
  const errors = [];
  if (record?.schemaVersion !== PROMOTION_SCHEMA_VERSION) errors.push("schemaVersion must be 1");
  if (!record?.candidateId) errors.push("candidateId is required");
  if (!isSha(record?.commitSha)) errors.push("exact commit SHA is required");
  if (!Array.isArray(record?.history) || record.history.length === 0) errors.push("history is required");
  if (Array.isArray(record?.history)) {
    for (let i = 0; i < record.history.length; i += 1) {
      const entry = record.history[i];
      if (!entry?.to || !entry?.at || Number.isNaN(Date.parse(entry.at))) errors.push(`history[${i}] has invalid transition metadata`);
      if (i > 0 && entry.from !== record.history[i - 1].to) errors.push(`history[${i}] does not chain from prior state`);
    }
    if (record.history.at(-1)?.to !== record.state) errors.push("state must equal terminal history state");
  }
  return { valid: errors.length === 0, errors };
}

export function verifyPromotionLineage(record, expectedCommitSha) {
  if (!isSha(expectedCommitSha) || record?.commitSha !== expectedCommitSha) {
    return { valid: false, errors: ["promotion record is bound to a different commit SHA"] };
  }
  return validatePromotionProvenance(record);
}
