# Forge Phase A evidence ingestion

This is the host-side ingestion boundary for the already-merged
`release-evidence-envelope-v1` contract.

## Flow

```text
governed repository replication
        |
        v
release-evidence-envelope-v1
        |
        | SHA-256 verification
        v
content-addressed immutable archive
        |
        v
forge-index-release-evidence.mjs
        |
        v
forge-evidence-index-v1
```

The archive is content-addressed by the exact SHA-256 of the envelope bytes.
Existing archive files are never overwritten. The projection may refresh the
same repository/SHA/release key, but it copies the authority flags exactly
and cannot grant production authority.

## Run

From the DataNest checkout replicated onto the Forge host:

```sh
cd /path/to/DataNest
export SOURCE_ENVELOPE=/path/to/release-evidence-envelope.json
export EXPECTED_SHA256=<verified-envelope-sha256>
export ARCHIVE_DIR=/var/lib/reson8-forge/evidence/archive
export INDEX_PATH=/var/lib/reson8-forge/evidence/forge-evidence-index.json
./infra/reson8-forge/scripts/ingest-release-evidence.sh
```

The Forge host must have Node.js available because the ingestion wrapper
delegates schema/provenance projection to the canonical adapter already
shipped in DataNest.

## Security and authority boundary

- Only `release-evidence-envelope-v1` is accepted.
- Operators may optionally require an expected SHA-256 before ingestion.
- The raw envelope is archived content-addressably and made read-only.
- The adapter preserves `productionAuthority` and
  `productionDeploymentAllowed`; ingestion cannot elevate either flag.
- Ingestion does not deploy, merge, certify, approve, or authorize releases.
- DataNest remains canonical during Phase A.
- A future signed-envelope requirement should be introduced as an explicit
  governed security migration rather than silently treating SHA-256 as a
  signature.

## Recovery use

The archive is intended to support provenance and recovery discovery. Backup
and restore validation remains a separate infrastructure gate; an evidence
archive alone is not a production recovery authorization.
