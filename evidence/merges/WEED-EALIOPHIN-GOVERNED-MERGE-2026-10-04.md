# Weed ↔ Ealiophin Governed Merge Evidence — 2026-10-04

## Scope
This record certifies the governed consolidation of the Weed canonical staging history with the newer Ealiophin DataNest/Supository canonical history. It does **not** certify production deployment.

## Source commits
- Ealiophin canonical source: `de53274100ae1202cae9f1b212b54fff592d2ec9`
- Weed canonical staging source: `e9b09aff76a365a3a3c78d30d66f4b83f0bcb445`
- Governed merge commit: `b9dfb45f80299d7c32b009779fbc32e3dfad742b`
- Merge parents: Ealiophin canonical first; Weed staging second.

## Merge policy
The histories were joined with Git's `ours` merge strategy on a dedicated integration branch. This preserves both histories while retaining the Ealiophin canonical tree as runtime/source authority. A direct content overlay was rejected because the Weed staging tree is intentionally smaller: comparison showed 4,571 Ealiophin paths absent from Weed, 128 Weed-only paths, 383 modified paths, and renamed paths. Blind overlay would therefore delete or regress reviewed canonical content.

## Transfer evidence
- Ealiophin canonical bundle SHA-256: `1DC54AC43FCD7762FFE1F96242C7F0E77D63374CF81C91741BAE257883AF7A20`
- Weed staging bundle SHA-256: `B85599848705BCDDE0FC2D2A2FB2EBA232EE16AF75BBB279285F55089C3EEB3B`
- Ealiophin uncommitted working patch SHA-256: `702811A0DEB1B5EA827D9776AB2FD332DBA284CE034BD00844B345B9144578BC`
- Ealiophin transfer archive: `C:\Users\Ashley\Documents\GitHub.zip`, 1,610,601,772 bytes; 292,720 ZIP entries under `GitHub/`; approximately 5.13 GB uncompressed.

## Validation
- Canonical traceability validator: **35 passed, 0 failed** on the Weed integration branch.
- `git diff --check`: passed for the governed merge.
- Open Nova sealed package verification: **FAILED** byte-size verification; launcher was not executed. This remains an explicit release/certification gate.

## Authority and follow-up
- Ealiophin remains the production/canonical authority per the consolidation runbook.
- Weed remains recovery, validation, and controlled integration capacity.
- The legacy/user-specified `C:\resonance-hub` path was not created because it is absent on Weed and local governance records identify the canonical staging path instead.
- No production deployment, DNS cutover, or public promotion is authorized by this merge record.
