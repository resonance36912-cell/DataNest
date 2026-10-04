# Resonance Open Nova v1.3 — Real Source Ingestion & Migration Execution

## Purpose

v1.3 closes the gap between a migration framework and execution against an actual local application source tree. The release still refuses production cutover: it ingests, fingerprints, copies, remediates supported provider bindings, verifies integrity, and preserves rollback evidence.

## Sovereign execution flow

**Approved local source → guarded staging → copy-only managed import → supply-chain evidence → real-source baseline → rollback checkpoint → deterministic provider migration → integrity verification → isolated regression → loopback preview → local cutover certification**

## Trust boundaries

1. The original source is read-only from Open Nova's perspective.
2. The absolute source path is not written into ingestion evidence; a SHA-256 path digest is retained only for local provenance correlation.
3. Secret-bearing files, symlinks and filesystem reparse/junction points are rejected before staging.
4. Staging and managed-app destinations are never overwritten.
5. Provider migration requires a current baseline and verified rollback checkpoint.
6. Only explicitly supported deterministic rewrites are executable. Unsupported semantics are blockers.
7. Failed post-rewrite verification triggers rollback of provider-source edits.
8. External AI and network access are not required or enabled by this workflow.
9. Production traffic, DNS and hosted-provider deletion remain outside the v1.3 executor.

## New controller surfaces

- `POST /v1/source-ingestion/{app_id}/stage-local`
- `GET /v1/source-ingestion/{app_id}/status`
- `POST /v1/source-ingestion/{app_id}/import`
- `POST /v1/migration-execution/{app_id}/prepare`
- `POST /v1/migration-execution/{app_id}/execute-supported`
- `GET /v1/migration-execution/{app_id}/verify`
- `POST /v1/migration-execution/{app_id}/rollback`

## Current deterministic migration scope

The executable provider rewrite remains intentionally narrow. Common Supabase JavaScript `createClient` imports can be redirected to the Open Nova compatibility layer after local service bindings and adapters are generated. RPC, realtime/channels, provider Functions, Firebase functional APIs, direct hosted AI SDK semantics and destructive SQL remain explicit blockers until a compatible governed adapter exists.

## Certification rule

A successful source import is not operational sovereignty. A successful provider rewrite is not operational sovereignty. Local cutover certification still requires the inherited v1.2 gates: current baseline, rollback checkpoint, exact/offline dependency readiness, supply-chain integrity, security scan, local services, isolated regression and loopback preview evidence.
