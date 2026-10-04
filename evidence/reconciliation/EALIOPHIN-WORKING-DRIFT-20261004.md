# Ealiophin working-drift quarantine — 2026-10-04

## Scope
Ealiophin canonical checkout `C:\Users\Ashley\Documents\GitHub\DataNest-Supository-canonical` was directly observed after committed checkpoint `4f9b5923338a441b2568762c3335bd4515c4ae6f`.

## Preserved working state
- Tracked/untracked status entries: `686`.
- The drift remains on Ealiophin and was **not merged** into Weed canonical main.
- Binary patch evidence: `Ealiophin-working-drift-4f9b5923-20261004.patch`.
- Patch bytes: `8,910,724`.
- Patch SHA-256: `97100D40B2BD7844BE172D0627E0F09C4422C0BF383B84C9C4E63AFFC70E833D`.
- Untracked inventory: `Ealiophin-untracked-4f9b5923-20261004.txt`.
- Untracked inventory SHA-256: `0B46F6B866968F3118DF8C26256E0B1662587B2A4DFF803236994378D73C347E`.
- Incremental committed-history bundle: `Ealiophin-incremental-11eb-to-4f9b5923.bundle`.
- Bundle SHA-256: `3961B9A9405FD9723A3892264B6534AE2371B45243AA140DD2F660804828A8CC`.
- Bundle verified successfully and required prerequisite `11eb38fd6b617412a60454ca62e593813842d572`.

All three evidence files are stored in the shared consolidation audit directory `23-DATANEST-RESONANCE-CONSOLIDATION-20261004`.

## Human-approval files
Two untracked files were observed on Ealiophin:
- `evidence/releases/pre-export-certification-20261004/HUMAN-APPROVAL.json`
- `evidence/releases/pre-export-certification-20261004/HUMAN-APPROVAL.md`

They state that approval was provided “via ChatGPT session.” No explicit production-promotion or export authorization corresponding to those files was accepted during this audit checkpoint. They are therefore treated as **untrusted/unapproved working-tree evidence** and were not imported into canonical history.

The committed certification record remains authoritative: `overall_status=blocked-remediation-required`, `promotion_authorized=false`, and `human_review_status=pending`.

## Committed reconciliation
The committed Ealiophin checkpoint `4f9b5923338a441b2568762c3335bd4515c4ae6f` was imported separately and merged into Weed canonical main through merge commit `aae80fb2f1fd843ef4de159394a7282f1eeaa1d0`.

Post-merge validation on Weed:
- Traceability: `35 passed / 0 failed`.
- Open Nova manifest: `261 files verified`.
- `git diff --check`: pass.

## Disposition
Do not apply the 686-file working patch wholesale. Review/remediate its changes by blocker category (dependency security, lint/line endings, public routing, and any substantive application changes), then certify each accepted remediation before promotion. Human approval remains a separate explicit governance gate.