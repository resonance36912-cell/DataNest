# Resonance Forge Phase B — Recovery, Retention, and Interoperability Controls

## Purpose

This control layer makes Phase B synchronization records recoverable, retention-aware, and portable without changing authority.

It is **read-only with respect to production authority**. It does not deploy, merge, mutate production data, approve governance, or authorize a candidate.

## Recovery contract

A recoverable synchronization snapshot contains:

- schema version;
- canonical repository identity;
- exact candidate SHA and canonical base SHA;
- environment and manifest digest;
- accepted event/evidence records;
- reconciliation records;
- snapshot digest;
- creation timestamp.

Recovery validation must verify:

1. schema and required fields;
2. exact-SHA identity;
3. deterministic snapshot digest;
4. event/evidence provenance;
5. reconciliation record integrity;
6. absence of production-authorization claims.

A restored snapshot is a projection input only. Restoration cannot advance promotion state or grant authority.

## Retention contract

Records are retained by provenance class:

- **accepted** — retain as replayable synchronization history;
- **duplicate** — retain operation identity and source identity;
- **updated** — retain prior and current observation lineage;
- **conflict** — retain indefinitely until explicitly resolved;
- **blocked** — retain indefinitely as failed-control evidence.

Retention metadata must never permit deletion of conflict/blocked evidence merely because a later retry succeeds.

## Interoperability contract

Portable snapshots must use:

- UTF-8 JSON;
- stable canonical JSON serialization;
- SHA-256 digests;
- exact Git commit SHAs;
- explicit repository/environment identifiers;
- versioned schema fields.

No GitHub-specific mutable URL or branch name may substitute for the exact commit SHA in candidate identity.

## Non-transition

Recovery, retention, and interoperability controls do not change the authority model:

**GitHub remains canonical and production-authoritative.**
