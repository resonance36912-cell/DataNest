# Resonance Forge Phase A

Phase A is a read-only control-plane prototype. It defines interoperable data contracts without taking production authority.

## Contracts

1. Repository registry identifies authority and environment bindings.
2. Release manifests bind candidates to exact source SHA and backend identity.
3. Evidence envelopes bind verification evidence to the exact candidate SHA.
4. Promotion states are monotonic and fail closed.
5. GitHub remains canonical for source and production.

## Promotion states

`r_and_d` → `live_candidate` → `evidence_complete` → `canonical_review` → `governance_review` → `human_authorized` → `production` → `post_deploy_verified`

Terminal negative state:

`blocked`

A candidate may enter `blocked` from any non-production state when required evidence is missing, stale, mismatched, invalid, or explicitly rejected.

## Exact-SHA invariant

A release candidate is identified by:

`repository + commit_sha + canonical_base_sha + environment + manifest_digest`

Evidence cannot be transferred to a different commit SHA without creating a new evidence envelope.

## Phase A scope

- schemas and validation contracts
- event ingestion contract
- read-only registry projection
- promotion state machine
- evidence/reference validation

## Explicit non-scope

- production deployment
- production credential handling
- GitHub authority replacement
- autonomous governance approval
- automatic merge
- authority cutover
