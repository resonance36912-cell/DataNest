# Resonance Open Nova v1.0 — Sovereign Release Candidate

## Purpose

Open Nova v1.0 consolidates the Zero-Credit v0.1–v0.9 components into one governed, local-first application-development control plane. The essential development path must remain usable without third-party AI credits.

## Primary flow

Prompt → Specification → Local Generation → Governance → Build → Test → Repair → Preview → Git → Registry → Supply Chain → Local Services → Migration → Sovereignty Score → Certification.

## Trust boundaries

1. The model has proposal authority; the controller owns writes and execution.
2. Governance, receipts, registry, secrets, migration snapshots, supply-chain evidence and certification ledgers are controller protected.
3. External AI is denied by default.
4. Strict offline operation does not download models, images or dependencies.
5. Generated code executes in network-denied, least-privilege containers when the local runner is available.
6. Service bindings contain secret references, never secret values.
7. Release Candidate integrity certification is distinct from Operational Sovereignty certification.
8. Operational certification requires real health/readiness evidence; configuration alone is insufficient.

## v1.0 control plane

`GET /v1/control-plane` aggregates suite migration state, registry integrity, local runner readiness, service-fabric health, backend-runtime health and evidence-based sovereignty scores.

`GET /v1/sovereignty/apps/{app_id}` calculates a 100-point score with critical gates. A high number cannot override a failed critical gate.

`GET /v1/release/preflight` checks static Release Candidate integrity prerequisites.

`POST /v1/release/certify` creates a confirmed, hash-chained local Release Candidate certification. It explicitly records that operational runtime was not verified by that certification.

`POST /v1/sovereignty/apps/{app_id}/certify` is the stricter operational certification endpoint. It refuses certification until the app score and critical gates pass against live backend evidence.

## Certification levels

### Release Candidate Integrity

Validates canonical governance/release/runtime/controller files, Zero-Credit provider policy and registry chain. It does not claim containers or local services are running.

### Operational Sovereignty

Requires the application to pass local-first policy, external-AI denial, registry integrity, dependency policy, security scan, supply-chain integrity, local dependency cache, provider-neutral bindings/adapters and live backend runtime health. Local Ed25519 artifact signing is scored as an additional trust control.

## Current environmental boundary

The handoff environment used to build this package does not provide Podman/Docker, so runtime containers cannot be truthfully certified here. Open Nova keeps those gates red until the local operator machine proves them healthy.
