# Forge recovery validation

Recovery is a separate infrastructure gate from release certification.

## Offline bundle gate

Before an isolated restore drill, validate the backup bundle without modifying
any service:

```sh
./scripts/validate-recovery-bundle.sh backups/<UTC-STAMP>
```

This verifies the PostgreSQL dump, Forgejo data archive and SHA-256 manifest.
It does not claim that the services themselves have been restored.

## Restore drill

Perform the actual restore on an isolated Docker host or isolated volumes:

1. Stop the test Forge stack.
2. Restore PostgreSQL into a test database instance from
   `forgejo-db.sql.gz`.
3. Restore the Forgejo `/data` archive into an isolated Forgejo volume.
4. Start the test Forge stack with test-only DNS/hostname settings.
5. Confirm Forgejo starts and the expected repository namespace is present.
6. Confirm the replicated DataNest repository resolves to the expected commit.
7. Re-run the Phase A evidence-ingestion test against an archived envelope.
8. Confirm the resulting evidence index preserves the original repository, exact
   commit SHA, release ID and authority flags.
9. Record restore timestamp, backup timestamp, commit SHA, evidence SHA-256 and
   operator/test identity in the recovery log.
10. Destroy the isolated test resources after validation.

## Authority boundary

A successful offline integrity check or restore drill proves recoverability and
integrity only. It does **not** authorize a production deployment or a Forge
authority cutover.

Production authority remains with DataNest until a separate governed migration
is explicitly approved.

An actual host restore is intentionally not represented as complete by source
control alone; it requires execution on the isolated Forge infrastructure and
an operator/test record.
