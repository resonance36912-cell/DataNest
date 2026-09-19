# Premium-readiness fixtures

This directory contains the acceptance manifest for the RONSAS premium-readiness gate.

The app fixture directories are intentionally not pre-populated. A fixture counts only when it is a reviewed, representative input with documented expected checks. Do not add synthetic placeholder files merely to satisfy the minimum count.

Expected directories:

- `fixtures/epublisher/`
- `fixtures/creative-studio/`
- `fixtures/sync-vision/`
- `fixtures/youtube-optimizer/`
- `fixtures/hub-billing/`

Machine-local run receipts are written under `.ronsas/state/` and are not source evidence unless explicitly exported into an approved audit/evidence repository.
