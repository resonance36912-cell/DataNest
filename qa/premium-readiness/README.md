# Premium-readiness fixtures

This directory contains the acceptance manifest for the RONSAS premium-readiness gate.

A fixture counts only when it is a reviewed, representative input with documented expected checks and source/test provenance. Do not add synthetic placeholder files merely to satisfy the minimum count.

The checked-in corpus contains source-derived reviewed cases mapped to the current spoke implementations and tests. Run `bun run verify:premium-fixtures` before assessment. The validator rejects duplicate IDs, unreviewed entries, missing provenance, placeholder content, weak category coverage, and missing required-check coverage.

Expected directories:

- `fixtures/epublisher/`
- `fixtures/creative-studio/`
- `fixtures/sync-vision/`
- `fixtures/youtube-optimizer/`
- `fixtures/hub-billing/`

Machine-local run receipts are written under `.ronsas/state/` and are not source evidence unless explicitly exported into an approved audit/evidence repository.
