/**
 * Resonance Forge Phase A — pure validation/state-machine core.
 * No network, credentials, deployment, or GitHub writes.
 */

export const STATES = Object.freeze([
  "r_and_d",
  "live_candidate",
  "evidence_complete",
  "canonical_review",
  "governance_review",
  "human_authorized",
  "production",
  "post_deploy_verified",
  "blocked"
]);

const ORDER = new Map(STATES.map((state, i) => [state, i]));

export const REQUIRED_EVIDENCE = Object.freeze([
  "mirror_live_evidence_reference",
  "datanest_ai_certification_reference",
  "audit_optimizer_reference",
  "canonical_pr_verification_reference",
  "security_scan_reference",
  "governance_review_reference",
  "human_production_authorization_reference"
]);

export function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

export function validateExactShaIdentity(candidate) {
  const errors = [];
  for (const field of ["commitSha", "canonicalBaseSha"]) {
    if (!isSha(candidate?.[field])) errors.push(field + " must be a 40-character lowercase commit SHA");
  }
  if (!candidate?.repository) errors.push("repository is required");
  if (!candidate?.environment) errors.push("environment is required");
  if (candidate?.manifestDigest !== undefined && candidate.manifestDigest !== null && !String(candidate.manifestDigest).trim()) {
    errors.push("manifestDigest cannot be blank");
  }
  return { valid: errors.length === 0, errors };
}

export function validateEvidenceForCandidate(evidence, candidate) {
  const errors = [];
  if (!evidence || typeof evidence !== "object") return { valid: false, errors: ["evidence is required"] };
  if (evidence.repository !== candidate.repository) errors.push("evidence repository does not match candidate");
  if (evidence.commitSha !== candidate.commitSha) errors.push("evidence commitSha does not match candidate");
  if (!evidence.evidenceId) errors.push("evidenceId is required");
  if (!evidence.type) errors.push("evidence type is required");
  if (!["pass", "fail", "warning", "pending"].includes(evidence.result)) errors.push("invalid evidence result");
  if (!evidence.producer) errors.push("evidence producer is required");
  return { valid: errors.length === 0, errors };
}

export function validateRequiredEvidence(evidenceRefs, required = REQUIRED_EVIDENCE) {
  const refs = Array.isArray(evidenceRefs) ? evidenceRefs : [];
  const missing = required.filter(ref => !refs.includes(ref));
  return { valid: missing.length === 0, missing };
}

export function canTransition(from, to) {
  if (!ORDER.has(from) || !ORDER.has(to)) return false;
  if (to === "blocked") return from !== "production" && from !== "post_deploy_verified";
  if (from === "blocked") return false;
  return ORDER.get(to) === ORDER.get(from) + 1;
}

export function transitionPromotion(state, to, context = {}) {
  if (!canTransition(state?.state, to)) {
    return { ok: false, state: { ...state, state: "blocked" }, reason: `invalid transition: ${state?.state} -> ${to}` };
  }
  if (to === "evidence_complete") {
    const result = validateRequiredEvidence(context.evidenceRefs);
    if (!result.valid) {
      return { ok: false, state: { ...state, state: "blocked" }, reason: "required evidence missing", missing: result.missing };
    }
  }
  if (to === "human_authorized" && context.humanAuthorized !== true) {
    return { ok: false, state: { ...state, state: "blocked" }, reason: "explicit human authorization required" };
  }
  if (to === "production") {
    const identity = validateExactShaIdentity(context.candidate);
    if (!identity.valid) return { ok: false, state: { ...state, state: "blocked" }, reason: "invalid exact-SHA identity", errors: identity.errors };
    if (context.candidate?.environment !== "production") {
      return { ok: false, state: { ...state, state: "blocked" }, reason: "production transition requires production candidate environment" };
    }
  }
  const now = context.at ?? new Date().toISOString();
  return {
    ok: true,
    state: {
      ...state,
      state: to,
      history: [...(state.history ?? []), { from: state.state, to, at: now, evidenceRef: context.evidenceRef ?? null }]
    }
  };
}

export function validateProductionPolicy(candidate, policy) {
  const errors = [];
  if (policy?.canonicalProductionAuthority !== true) errors.push("canonical production authority must remain enabled");
  if (policy?.forgeProductionAuthority === true) errors.push("Forge production authority must remain disabled in Phase A");
  if (policy?.humanProductionAuthorizationRequired !== true) errors.push("human production authorization must be required");
  if (policy?.exactShaPromotionRequired !== true) errors.push("exact-SHA promotion must be required");
  if (candidate?.environment === "production" && candidate?.backend?.mode === "isolated-staging") {
    errors.push("production candidate cannot use isolated-staging backend mode");
  }
  return { valid: errors.length === 0, errors };
}
