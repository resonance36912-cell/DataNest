# Resonance Hub Alignment Standard

Canonical runtime authority: Resonance-AppDev/resonance-hub.

## Repository roles

- apps/hub: governed mirror of the Resonance Hub runtime and public assets.
- apps/datanest: governance, evidence, certified knowledge, audit, and transparency control plane.
- platform/ronsas: sovereign orchestration and bounded runtime services.
- platform/open-nova: development and migration tooling.
- governance/rcgf: constitutional governance authority.
- evidence: audit, migration, validation, and certification evidence; no secrets.

## Alignment rule

apps/hub follows the authorized local Resonance Hub working tree. Application code, routes, server functions, CI definitions, operational scripts, tests, and public assets retain the same relative paths for provenance and traceability.

DataNest governance does not silently redefine Hub runtime behavior. Changes flow through evidence capture, validation, human review, and certification before promotion.

## Promotion gates

1. Record source provenance and upstream identity.
2. Pass secret and sensitive-data scans.
3. Pass dependency and lockfile integrity checks.
4. Pass Hub prebuild invariants.
5. Pass the Hub production build in an installed dependency environment.
6. Validate public assets and route surfaces.
7. Validate cross-system contracts.
8. Capture audit evidence.
9. Record human governance approval.
10. Export or promote only after the gates pass.
