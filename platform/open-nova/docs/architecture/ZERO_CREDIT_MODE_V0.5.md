# Resonance Open Nova — Zero-Credit Mode v0.5

## Sovereign Supply Chain & Migration Layer

v0.5 extends the Sovereign App Factory with a local, auditable path for importing existing applications and proving what source and dependencies belong to a build.

### Core flow

```text
Existing local project
  -> Governed imports/projects inbox
  -> Read-only migration assessment
  -> Secret-file gate
  -> Copy-only import
  -> External-service discovery
  -> Dependency governance
  -> Local security scan
  -> CycloneDX SBOM
  -> SHA-256 source-tree manifest
  -> Optional local Ed25519 attestation
  -> Sovereign App Registry
```

### Supply-chain rules

1. No dependency or binary artifact is downloaded by the v0.5 supply-chain controller.
2. Dependency artifacts enter only through `imports/artifacts/`.
3. Cached artifacts use SHA-256 content-addressed storage under `runtime/supply-chain/artifacts/`.
4. A package URL (purl) may be attached to an ingested artifact to prove whether a project's declared dependencies are represented in the local cache.
5. SBOM generation is local and uses CycloneDX 1.5 JSON.
6. `ARTIFACT_MANIFEST.json` records the SHA-256 hash of every governed source file plus the SBOM digest.
7. `ARTIFACT_MANIFEST.sig` can be created with a locally generated Ed25519 owner key.
8. The private attestation key remains under `runtime/secrets/` and is excluded from version control.
9. An attestation is only valid when both the source-tree integrity check and Ed25519 signature verification pass.

### Migration rules

- Migration sources must be placed under `imports/projects/`.
- Assessment never changes the source project.
- Import requires explicit confirmation.
- Import creates a new project under `apps/`; existing destinations are never overwritten.
- `.env`, private key, and certificate-key files block import rather than being silently copied.
- `.git`, `node_modules`, virtual environments, caches, and build outputs are not imported.
- Known hosted-service signals (including Lovable and hosted Supabase patterns) are reported as migration dependencies, not silently rewritten.
- A migrated application is marked `migrated_validated` only when dependency and local security gates pass; otherwise it is registered as `migrated_needs_remediation`.

### Trust boundary

The local model can propose source changes, but it cannot mutate the governance policy, application registry, receipt ledger, supply-chain store, or attestation keys. Supply-chain evidence and trust identity remain controller-owned.

### New API surface

- `POST /v1/migration/assess`
- `POST /v1/migration/import`
- `POST /v1/supply-chain/generate`
- `POST /v1/supply-chain/verify`
- `POST /v1/supply-chain/cache-status`
- `POST /v1/supply-chain/artifacts/ingest`
- `GET /v1/supply-chain/artifacts/verify`
- `POST /v1/supply-chain/signing/init`
- `POST /v1/supply-chain/sign`
- `POST /v1/supply-chain/signature/verify`

## v0.5 exit criteria

- Existing projects can be assessed without mutation.
- Secret-bearing migration sources are denied.
- Imported source is copied into the sovereign `apps/` boundary.
- Local dependencies can be content-addressed and mapped to purls.
- SBOM and source-tree integrity evidence can be generated and verified offline.
- Local Ed25519 attestation can be initialized, signed, and verified without third-party services.
- All inherited and v0.5 governance tests pass.
