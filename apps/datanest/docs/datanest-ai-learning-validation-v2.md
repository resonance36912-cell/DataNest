# DataNest AI Learning Validation v2

This release hardens the governed learning pipeline without automatically promoting memory.

## Runtime invariants

- Synthetic stress/E2E traffic is excluded from learning candidates.
- Low-risk candidates require at least three evidence items before deterministic pre-validation.
- Automated pre-validation covers AUDIT, VERIFY and VALIDATE only.
- STRESS_TEST remains a separate governed gate.
- Every validation run is sealed to the candidate content hash, policy version, evidence-set hash, evidence count, risk class and conflict state.
- Validation runs whose seal no longer matches the current candidate are ignored.
- Mutable pre-certification candidates can absorb later evidence; their evidence links are reconciled to the current set and earlier validation becomes stale.
- CERTIFIED candidates remain frozen against later trend evidence.
- Production memory promotion remains explicit and requires a current certification decision.
- DataNest AI staging routing accepts only the canonical dedicated staging origin.

## Release process

The candidate is tested by CI, deployed to dedicated DataNest AI staging, read back, and then exercised by the governed backend/browser/stress certification workflow before production promotion.
