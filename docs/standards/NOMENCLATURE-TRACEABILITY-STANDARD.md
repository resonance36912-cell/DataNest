# Resonance canonical nomenclature and traceability standard

Version: 1.0-candidate
Date: 2026-10-04
Scope: DataNest, Resonance Hub, RONSAS, Open Nova, RCGF, nodes, services, environments, public assets, evidence and deployment artifacts.

## 1. Principle

Human-readable folders stay short; every governed entity receives a stable canonical ID. Historical names remain aliases. Renaming must never break evidence, routes, repositories, URLs or runtime integrations without an explicit compatibility map.

## 2. Canonical ID grammar

`RSN-<CLASS>-<DOMAIN>-<COMPONENT>[-<ENV>][-<NN>]`

Classes:
- `PLT` platform/control plane
- `APP` end-user/commercial application surface
- `SYS` system/runtime suite
- `GOV` governance framework
- `SVC` bounded service
- `NODE` compute/control node
- `ENV` environment
- `PUB` public asset/operational publication
- `PKG` shared package/contract
- `OPS` operator/control artifact
- `EVD` evidence/audit artifact

Environment codes: `DEV`, `RND`, `TST`, `STG`, `PRD`, `DR`.

## 3. Canonical top-level authorities

| Canonical ID | Canonical name | Short slug | Authority |
|---|---|---|---|
| RSN-PLT-DATANEST | Resonance DataNest | datanest | Governance, certified knowledge, audit/transparency control plane |
| RSN-APP-HUB | Resonance Hub | hub | Runtime/commercial/customer front door |
| RSN-SYS-RONSAS | Resonance Open Nova Sovereign Application Suite | ronsas | Sovereign runtime, module/service orchestration, topology and recovery |
| RSN-PLT-OPENNOVA | Resonance Open Nova Development Platform | open-nova | Provider-neutral development/migration tooling |
| RSN-GOV-RCGF | Resonance Constitutional Governance Framework | rcgf | Constitutional policy/reference authority |

## 4. Node IDs

- `RSN-NODE-EALIOPHIN-PRD-01`: production-master/runtime authority.
- `RSN-NODE-WEED-DR-01`: support/recovery worker; never direct production promotion authority.
- `RSN-NODE-SPIDER-DR-01`: support/recovery worker; current state must be freshly observed before promotion decisions.

Node IDs describe role and environment, not hardware ownership. Machine names remain aliases.

## 5. Service IDs

Service IDs use `RSN-SVC-<CAPABILITY>-<ENV>`. Examples:
- `RSN-SVC-HUB-WEB-PRD`
- `RSN-SVC-EPUBLISHER-WEB-PRD`
- `RSN-SVC-CREATIVE-STUDIO-PRD`
- `RSN-SVC-SYNC-VISION-PRD`
- `RSN-SVC-YOUTUBE-OPTIMIZER-PRD`
- `RSN-SVC-AI-BROKER-PRD`
- `RSN-SVC-STT-LOCAL-PRD`
- `RSN-SVC-IMAGE-LOCAL-PRD`
- `RSN-SVC-LLM-LOCAL-PRD`
- `RSN-SVC-FOUNDRY-PRD`
- `RSN-SVC-SOVEREIGN-BACKEND-PRD`

Ports are endpoints, not identities. A port change must not create a new service ID.

## 6. Repository paths

Canonical monorepo paths:
- `apps/datanest`
- `apps/hub`
- `platform/ronsas`
- `platform/open-nova`
- `governance/rcgf`
- `packages/*`
- `ops/*`
- `evidence/*`
- `docs/*`
- `tests/*`

No nested `.git` directories are retained in canonical source.

## 7. Public-asset operating plane

Public assets are an explicit operating plane, not merely decorative static files. Each public application may publish sanitized operational metadata under `public/ops/`.

Allowed public operational assets:
- release/version manifest;
- public environment label (`production`, `staging`, etc.);
- public service/application catalog containing public URLs only;
- public health/readiness marker with no private dependency detail;
- public traceability ID and release commit/hash;
- robots, web manifests, icons and content feeds;
- transparency/audit publications approved for public release.

Forbidden in public assets:
- secrets, tokens, credentials, private keys or signing material;
- local/absolute filesystem paths;
- private node names/IP addresses unless separately approved for publication;
- internal-only ports or topology;
- database connection strings;
- privileged mutation endpoints or admin capability metadata;
- raw logs, private evidence, user/member data or unpublished audit findings.

Recommended public paths:
- `public/ops/release.json`
- `public/ops/environment.json`
- `public/ops/catalog.json`
- `public/ops/health.json`
- `public/ops/traceability.json`
- `public/transparency/...`

Public operational files are generated from the internal registry using an allowlist transformation, never by copying the internal registry wholesale.

## 8. Required traceability fields

Every indexed entity should record: `canonical_id`, `canonical_name`, `slug`, `class`, `authority`, `environment`, `lifecycle`, `aliases`, `repo_path`, `runtime_owner`, `node`, `public_exposure`, `dependencies`, `evidence_refs`, `version_source`, and `last_verified_at`.

## 9. Compatibility rule

Legacy names such as `DataNest-Supository`, `resonance-hub`, `rons-sovereign-codebase`, `RONSAS`, `RONS Hub`, `MYIFY`, and historical repository URLs remain aliases until all source references, CI, runtime configuration, DNS and public links have been migrated and verified.

## 10. Promotion rule

A rename or consolidation is complete only when source, runtime, CI, documentation, public assets, service registry, node registry, audit evidence and rollback metadata all point to the same canonical ID. Human-readable display names may vary; canonical IDs may not.
