# Resonance Forge Phase B — Governed Synchronization Contract

## Purpose

Phase B extends the Phase A read-only control-plane prototype with a governed synchronization contract between the canonical GitHub event stream and a future Resonance Forge registry.

Phase B remains non-authoritative. GitHub remains the canonical source of repository history and production authority.

## Synchronization model

Synchronization is **projection, not replication authority**:

1. GitHub events are observed with exact repository and commit SHA identity.
2. Event envelopes are validated and deduplicated.
3. The Forge registry may project repository refs, candidate metadata, and evidence references.
4. Projection state is reproducible from the accepted event/evidence stream.
5. Projection never mutates GitHub history, canonical production state, or Supabase production data.
6. A projection cannot grant production authorization.

## Exact-SHA invariant

Every synchronized candidate remains bound to:

- repository
- commit SHA
- canonical base SHA
- environment
- manifest digest

A synchronization update for a different SHA is a new candidate lineage, not an overwrite of the prior candidate.

## Reconciliation

A future reconciliation worker must classify observations as:

- `new` — previously unseen valid identity
- `duplicate` — identical deterministic event/evidence identity
- `updated` — same candidate lineage with a valid newer observation
- `conflict` — identity or digest disagreement requiring review
- `blocked` — malformed, unauthorized, stale, or policy-invalid input

Conflicts and blocked inputs must be retained as evidence of the failed synchronization attempt. They must not be silently discarded.

## Authority boundaries

Phase B does **not** provide:

- production deployment
- production database mutation
- automatic merge
- automatic governance approval
- Forge source-of-truth authority
- Forge production authority
- automatic authority cutover
- self-authorization from passing tests

Human production authorization remains a separate required control.

## Failure handling

Synchronization is fail-closed when:

- repository identity is missing or inconsistent
- commit SHA is invalid or mismatched
- evidence is bound to another candidate or SHA
- required policy metadata is missing
- an input claims authority not granted by policy
- an existing identity has a different payload digest

A retry may re-submit an identical deterministic envelope safely. It must not rewrite an accepted identity with different content.

## Evidence and auditability

Every synchronization operation should produce a deterministic operation identity derived from the canonical input identity. The resulting record should retain:

- operation identity
- source event/evidence identity
- repository
- exact commit SHA
- observed timestamp
- input digest
- projection outcome
- conflict/block reason when applicable

The synchronization layer is therefore replayable without making replay an authorization action.

## Implementation sequence

1. Phase A read-only contracts and dashboard — complete.
2. Phase B deterministic reconciliation contract — this document.
3. Phase B read-only reconciliation planner and tests.
4. Evidence-backed synchronization dry runs — implemented as a deterministic, read-only CLI/library path.
5. Review of recovery, retention, and interoperability controls.
6. Only after explicit governance and human approval may later phases consider deployment authority.

## Explicit non-transition

This phase does not change the current authority model:

**GitHub remains canonical and production-authoritative.**

No Forge implementation in Phase B may infer or grant an authority transition.


## Phase B dry-run implementation

The read-only dry-run path accepts a candidate, GitHub event inputs, and evidence inputs. It:

1. validates and deduplicates event envelopes;
2. validates and deduplicates evidence envelopes against the exact candidate SHA;
3. pairs compatible event/evidence identities into deterministic synchronization observations;
4. reconciles those observations using the Phase B reconciliation contract; and
5. emits a deterministic report containing accepted/rejected inputs and conflict/block reasons.

The CLI is:

`node scripts/forge-sync-dry-run.mjs config/forge-sync-dry-run.example.json`

The dry-run contract explicitly reports `authorizationGranted: false` and `productionMutation: false`. It has no network, database, deployment, merge, governance-approval, or production-authorization capability.
