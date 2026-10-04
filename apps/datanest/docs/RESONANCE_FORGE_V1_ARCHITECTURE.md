# Resonance Forge v1 Architecture

Status: design baseline
Authority: proposal only; DataNest remains canonical
Base commit: aa35aee3bbde7d834aa60f954a5738cd7cbf7dc5
Branch: forge/architecture-v1

## 1. Purpose

Resonance Forge is a Resonance-native software delivery control plane designed around DataNest's existing canonical, Mirror, evidence, governance, and exact-SHA promotion model.

Forge is not a second source of truth. In v1 it is a governed mirror/control-plane extension. GitHub remains the canonical repository and current production delivery authority until an explicit authority cutover is separately approved.

## 2. Design principles

1. Git remains the immutable source history primitive.
2. DataNest remains the canonical application/control plane.
3. Production promotion is an authorization event, not merely a merge event.
4. Every production candidate is bound to an exact commit SHA.
5. Evidence is attached to the candidate and is immutable/replay-safe.
6. Automation may collect, validate, and attest evidence but may not self-authorize production.
7. Mirror/R&D environments are isolated from production backend writes.
8. Forge must preserve GitHub interoperability during migration.
9. One release authority exists at a time.
10. Failure to establish required evidence fails closed.

## 3. Logical components

### 3.1 Forge Registry
Stores repository identity, authority class, upstream/downstream mirrors, default branch, environment bindings, and policy version.

Authority classes:
- canonical
- governed-mirror
- rd-candidate
- archive

### 3.2 Git Service
Provides Git-compatible repositories and refs. v1 may use a hosted Git service implementation rather than implementing Git protocol primitives from scratch.

Required capabilities:
- Git push/fetch/clone
- protected refs
- signed/verified commits where available
- immutable release tags
- mirror synchronization
- webhook/event emission

### 3.3 Build/CI Executor
Runs deterministic build, test, type, dependency, security, and packaging jobs.

Each run emits:
- source SHA
- workflow/pipeline ID
- runner/toolchain identity
- dependency lockfile identity
- result
- artifact references

### 3.4 Evidence Registry
Stores immutable evidence envelopes keyed by candidate SHA.

Evidence classes:
- unit
- type
- dependency
- security
- visual/UX
- browser/live
- DataNest AI certification
- Audit Optimizer
- RONSAS
- governance
- backend attestation
- human authorization

### 3.5 Promotion Engine
Implements the state machine:

R&D
→ live candidate
→ candidate evidence complete
→ canonical promotion branch
→ canonical validation
→ governance review
→ human authorization
→ production deployment
→ post-deployment attestation

A candidate cannot skip states.

### 3.6 Deployment Controller
Deploys only an authorized exact SHA to the target environment.

It must independently verify:
- repository
- commit SHA
- release manifest
- backend identity
- required evidence
- authorization state

### 3.7 Governance/Audit Adapter
Consumes existing DataNest governance models rather than creating a parallel governance database.

Forge should integrate with existing models including:
product_surfaces, product_test_cases, product_test_runs, governance_observations, optimizer_runs, optimizer_suggestions, governance_improvement_candidates, security_acceptance_runs, portfolio_lifecycle_events, ai_development_updates, artifacts, and events.

## 4. Release identity

Every candidate has a release manifest containing at minimum:

- candidate ID
- repository
- exact commit SHA
- canonical base SHA
- source authority
- build ID
- workflow/pipeline reference
- artifact digests
- backend/project identity
- environment
- evidence references
- policy version
- generated timestamp
- authorization state
- rollback target

Production release identity is immutable after authorization.

## 5. Environment model

### R&D
Fast iteration. May auto-publish candidate UI when policy allows.

### Staging
Isolated backend and secrets. Production writes are prohibited.

### Candidate
A specific exact-SHA package that has completed required live testing.

### Production
Only canonical, authorized exact-SHA releases may deploy.

## 6. GitHub compatibility

During v1:

GitHub canonical
↕ governed synchronization
Resonance Forge

Forge must not silently rewrite GitHub history, disable existing CI evidence, or change production authority.

GitHub Actions can remain the execution layer while Forge initially acts as policy/evidence/promotion control plane. Later phases may replace individual execution components independently.

## 7. Security boundaries

- Production credentials are never exposed to R&D runners.
- Staging and production Supabase project refs are explicit and independently validated.
- Service credentials are server-side only.
- Promotion tokens carry metadata, not production authority.
- Deployment credentials are scoped to the target environment.
- Evidence objects are append-only.
- Governance completion cannot be inferred from test success.
- A missing, stale, blank, pending, or mismatched required evidence reference fails closed.

## 8. Authority transition

No authority cutover is implied by this design.

A future cutover requires:
1. equivalent repository durability and recovery
2. equivalent or stronger CI/security controls
3. release/evidence parity
4. backup and disaster recovery validation
5. GitHub interoperability validation
6. production deployment rehearsal
7. independent audit evidence
8. explicit human authority approval
9. documented rollback to GitHub authority

## 9. Implementation phases

### Phase A — Evidence/control-plane prototype
- registry schema
- release manifest schema
- evidence envelope schema
- promotion state machine
- GitHub event ingestion
- read-only dashboard

### Phase B — Governed synchronization
- repository mirror service
- exact-SHA synchronization
- candidate import/export
- artifact digest verification
- replay protection

### Phase C — Deployment authority parity
- isolated Forge runner
- staging deployment
- production dry-run
- post-deployment attestation
- rollback rehearsal

### Phase D — Optional authority transition
Only after formal governance approval and parity evidence.

## 10. Non-goals for v1

- replacing Git itself
- cloning every GitHub feature
- creating a parallel production database
- automatically approving governance
- autonomous production deployment
- moving Supabase authority without explicit approval
- deleting or bypassing existing GitHub evidence
