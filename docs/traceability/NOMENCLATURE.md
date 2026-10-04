# Resonance canonical nomenclature and traceability standard

Schema family: `resonance.traceability/v1`
Status: migration-staging standard

## 1. Identity rules

Every governed resource has two identifiers:

1. `canonical_id`: immutable machine identity using a URN-like namespace, for example `urn:resonance:service:hub-web`.
2. `trace_id`: short immutable human audit key, for example `SVC-HUB-WEB`.

Display names, domains, filenames and vendors may change without changing either identity. Legacy names are recorded only as aliases.

## 2. Resource classes

| Class | URN segment | Trace prefix | Example |
|---|---|---|---|
| Platform | `platform` | `PLT` | `urn:resonance:platform:datanest` / `PLT-DN` |
| Application | `application` | `APP` | `urn:resonance:application:hub` / `APP-HUB` |
| Governance | `governance` | `GOV` | `urn:resonance:governance:rcgf` / `GOV-RCGF` |
| Environment | `environment` | `ENV` | `urn:resonance:environment:production` / `ENV-PRD` |
| Node | `node` | `NOD` | `urn:resonance:node:ealiophin` / `NOD-EAL` |
| Service | `service` | `SVC` | `urn:resonance:service:local-stt` / `SVC-STT` |
| Public asset | `public-asset` | `PUB` | `urn:resonance:public-asset:hub:site-webmanifest` |
| Evidence | `evidence` | `EVD` | migration/audit/release receipt |

## 3. Path and label conventions

Repository paths and slugs use lower-case `kebab-case`. Environment variables remain upper snake case. JSON fields use lower `snake_case` in governance/catalog files. TypeScript may retain existing project conventions until component refactoring is certified.

No folder rename is allowed merely for cosmetic consistency if an active runtime, scheduled task or deployment consumes the old path. Such names are converted through a compatibility alias and removed only after a verified cutover.

## 4. Environment vocabulary

- `ENV-DEV` development
- `ENV-RND` research-and-development
- `ENV-TST` controlled test
- `ENV-STG` staging/certification
- `ENV-PRD` production
- `ENV-DR` disaster-recovery / compatibility recovery
- `ENV-MIG` temporary migration-staging environment

A resource may be declared for several environments, but an observation must name exactly which environment and node were observed.

## 5. Authority fields

Every service/application record distinguishes:

- `source_authority`: source tree allowed to define the resource.
- `runtime_authority`: node/environment allowed to operate it as authoritative runtime.
- `governance_authority`: policy/control plane that may approve promotion.
- `observed_state`: timestamped measurement, never treated as authority by itself.

Current governing boundary: Hub is runtime/commercial application authority; DataNest is governance/knowledge-control authority; RONSAS supplies sovereign control/operations; RCGF supplies constitutional governance policy.

## 6. Public asset standard

Public assets are first-class governed resources. Each deployable application may expose `public/.well-known/resonance/` with public-safe metadata:

- `service-manifest.json`
- `environment.json`
- `release.json`
- `asset-index.json`

Public metadata must never contain passwords, tokens, private keys, private member data, database credentials, unrestricted internal paths, or server-only provider secrets. A static health marker may describe the build, but must not be represented as proof of backend/database health.

Every indexed asset records path, SHA-256, media type where known, provenance/source commit when known, lifecycle state, and exposure classification.

## 7. Evidence and supply-chain traceability

Use ISO-8601 timestamps, SHA-256 content hashes, immutable source commit IDs, versioned schemas, review receipts and reproducible manifests. Generate SPDX or CycloneDX SBOMs and SLSA-like build provenance when the consolidated build pipeline is activated. These are standards-aligned controls; they are not claims of external certification unless separately certified.

## 8. Synchronization rule

Synchronization is `compare -> classify -> validate -> approve -> promote`. Never synchronize by blind overwrite. Dirty worktrees, worker mirrors, runtime state, public assets and configuration each receive a disposition: `authoritative`, `candidate`, `overlay`, `evidence`, `generated`, `runtime-only`, `deprecated`, or `quarantined`.

## 9. Compatibility rule

Legacy runtime manifests (`authority.json`, existing module IDs, existing public URLs) remain operational until their consumers are migrated. New v2 traceability indexes are sidecars. Removal of aliases requires a clean compatibility test plus human-reviewed governance approval.
