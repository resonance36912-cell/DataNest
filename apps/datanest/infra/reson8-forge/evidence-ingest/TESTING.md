# Phase A ingestion test procedure

Run this procedure on a Forge staging host before enabling scheduled ingestion.

1. Replicate a known DataNest commit containing
   `.datanest/release-evidence-envelope.json`.
2. Copy the envelope to a staging intake path.
3. Compute its SHA-256 and provide it as `EXPECTED_SHA256`.
4. Run `scripts/ingest-release-evidence.sh`.
5. Confirm the archive contains exactly one file named by that SHA-256.
6. Confirm the archived file is read-only.
7. Confirm `forge-evidence-index-v1` contains the expected repository, exact
   commit SHA, release ID and authority flags.
8. Re-run the same ingestion and confirm the archive is unchanged and the
   projection still contains one evidence entry for the same key.
9. Change the envelope bytes while retaining the original expected SHA-256;
   ingestion must fail before indexing.
10. Supply an envelope with
    `productionAuthority:true` from a `mirror-rd` repository role; the
    canonical adapter must reject it.

Do not connect this job to a production deployment trigger. Successful
ingestion is evidence correlation only.
