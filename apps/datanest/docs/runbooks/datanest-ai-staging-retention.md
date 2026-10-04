# DataNest AI Staging Evidence Retention Runbook

## Purpose

The dedicated Supabase project `DataNest AI Staging` is the long-lived quarantine and evidence environment for DataNest AI. Raw human development input, AI Companion returns, reasoning provenance, trends, learning candidates, validation evidence, and certification history are retained here rather than in production.

Production project ref: `sgqdmfgjbprsoqsmgigi`  
Staging project ref: `qchttpcyqlqnhvahprhz`

## Retention rule

Raw DataNest AI evidence is retained indefinitely under the approved design.

The staging project is not a disposable preview environment. Do not pause, delete, reset, recreate, or repurpose it as routine pull-request cleanup. A Git branch merge never authorizes deletion of the staging project.

Rejected, superseded, and certified evidence stays available for longitudinal trend analysis and later re-audit.

## Recovery hierarchy

1. Use any native Supabase backup/PITR capability available for the staging project as the primary recovery mechanism.
2. Maintain encrypted DataNest AI exports as a secondary recovery mechanism.
3. Before production release, at least one durable encrypted backup copy must be physically stored outside the staging project and a restore/verification drill must pass. An approved local-PC backup location qualifies when the encrypted file and manifest are retained deliberately rather than left as a temporary browser download.

If native recoverable backup/PITR is unavailable for the current Supabase plan, stop the production release and obtain explicit approval for the durable off-staging backup destination. Approved destinations may include a controlled local-PC backup folder or another explicitly approved external store. Do not silently choose a new storage provider.

## Required secrets

Never commit these values:

- `DATANEST_AI_STAGING_URL`
- `DATANEST_AI_STAGING_SERVICE_ROLE_KEY`
- `DATANEST_AI_STAGING_PROJECT_REF`
- `DATANEST_AI_BACKUP_KEY`
- `DATANEST_PRODUCTION_PROJECT_REF`

`DATANEST_AI_BACKUP_KEY` must decode to exactly 32 bytes. Store it in the approved secret store, independently of the encrypted backup file.

## Export

Run:

```bash
node scripts/export-datanest-ai-staging.mjs
```

The exporter reads only governed DataNest AI evidence tables, pages through all rows, encrypts the complete versioned payload using AES-256-GCM, and writes a `.datanest-ai-backup` file under `backups/`.

The export process never logs row content.

## Verify-only recovery drill

Run:

```bash
BACKUP_FILE="$(ls -t backups/*.datanest-ai-backup | head -1)"
node scripts/restore-datanest-ai-staging.mjs "$BACKUP_FILE" \
  --target-ref "$DATANEST_AI_STAGING_PROJECT_REF" \
  --source-ref "$DATANEST_AI_STAGING_PROJECT_REF" \
  --verify-only
```

Every governed evidence table must report matching source/target row counts and canonical SHA-256 hashes.

## Idempotent restore drill

After verify-only succeeds:

```bash
node scripts/restore-datanest-ai-staging.mjs "$BACKUP_FILE" \
  --target-ref "$DATANEST_AI_STAGING_PROJECT_REF" \
  --source-ref "$DATANEST_AI_STAGING_PROJECT_REF"
```

The restore uses primary-key upserts in dependency order. A second restore of the same backup must not create duplicate rows. Re-run verify-only after restore.

The restore utility refuses the known production project ref and refuses any target that does not exactly match the currently configured `DATANEST_AI_STAGING_PROJECT_REF`. It also requires an explicit `--source-ref` matching the encrypted backup's original project ref.

If the original staging project is lost, provision a replacement staging project, configure the staging URL/service key/project-ref variables for that replacement, and restore the encrypted backup with `--source-ref` set to the original staging project ref recorded in the backup. This permits disaster recovery without ever permitting a raw-evidence restore into production.

## Release gate

Production promotion is blocked unless all are true:

- staging evidence project is healthy and long-lived;
- encrypted export succeeds;
- restore/verify drill succeeds;
- a durable encrypted backup copy is physically present outside the staging project and its location is documented;
- the backup manifest records the expected SHA-256 and the stored copy is verified against it;
- the backup key is recoverable from the approved secret store and is not stored alongside the backup file;
- exact-head governed certification CI passes.

A failed retention/recovery gate cannot be downgraded to a warning.


### Approved local-PC acceptance

A local-PC copy satisfies the physical backup gate when all of the following are true:

- the encrypted backup file is saved in a deliberate backup folder outside temporary browser/download cache;
- the non-secret manifest is saved beside it;
- the stored encrypted file's SHA-256 is verified against the recorded manifest value;
- the decryption key remains only in the approved secret store;
- the restore/verification drill has already passed; and
- the operator records the verified local path in the PR release evidence.

A suitable Windows example is `C:\Users\Ashley\Documents\RONSAS\Backups\DataNest-AI\`. The exact path may differ, but it must be durable and intentionally retained.
