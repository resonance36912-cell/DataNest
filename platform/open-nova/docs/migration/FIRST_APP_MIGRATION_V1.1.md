# First Resonance App Migration Pilot — v1.1

Default pilot: `reson8-life`.

The pilot is a proof that one real application can leave hosted-builder dependency without loss of source ownership, data control or rollback capability.

## Sequence

1. Obtain/export complete source.
2. Stage a copy under `imports/projects/reson8-life`.
3. Run migration assessment.
4. Import only after the assessment is accepted.
5. Detect hosted/provider-specific calls.
6. Generate provider-neutral adapters.
7. Resolve ambiguous functions manually rather than guessing.
8. Pin dependencies and populate the local artifact cache.
9. Generate and verify SBOM/integrity evidence.
10. Initialize local backend services and apply non-destructive schema migrations.
11. Run isolated build/test/repair.
12. Preview on loopback.
13. Compare critical behavior with the current application.
14. Record a Git checkpoint and backup/export.
15. Certify operational sovereignty only after critical gates pass.
16. Production cutover remains a separate explicit governance decision.

## Rollback principle

The original application remains untouched during staging/import. Provider cutovers retain migration snapshots and source hashes. Production migration should preserve a tested rollback route until the sovereign deployment is independently verified.
