# Zero-Credit Mode v0.6 — Sovereign Workspace & Suite Migration

## Objective

Manage the Resonance application suite as governed local assets and make independence measurable rather than declarative.

## Trust boundaries

1. **Governance-owned configuration** — suite catalogue and service-replacement rules live under protected `governance/` paths.
2. **Controller-owned state** — generated remediation plans, exports, receipts and registry events live under protected `runtime/` paths.
3. **App-owned source** — application source lives under `apps/<app_id>/` and can be changed only through governed write/repair flows.
4. **Import inbox** — external source first arrives under `imports/projects/`; assessment does not mutate it.
5. **No implicit network** — migration planning, status, evidence, export and verification perform no package/model downloads.

## Sovereign-ready gate

A declared app is `sovereign_ready` only when all are true:

- a managed local source project exists;
- no known hosted/platform-specific coupling is detected in governed source scanning;
- dependency declarations are exact/reproducible;
- every declared dependency with a package URL is available in the local governed artifact cache;
- current supply-chain evidence validates against the project tree.

This state is evidence-driven and can regress to `remediation_required` if the project changes after evidence was generated.

## Migration strategy

Migration is deliberately staged:

1. stage source copy;
2. read-only assess;
3. explicit confirmed copy-only import;
4. dependency/security/supply-chain analysis;
5. generate remediation plan;
6. implement local adapters through governed coding flow;
7. build/test/repair in isolated runner;
8. regenerate SBOM and integrity evidence;
9. fill local dependency cache;
10. promote only when readiness gates pass;
11. create verified sovereign export.

## Destructive operations

v0.6 does not automatically delete hosted projects, production databases, remote repositories or deployment accounts. Decommissioning external infrastructure is outside the automatic migration flow and remains a high-impact human-approved action.
