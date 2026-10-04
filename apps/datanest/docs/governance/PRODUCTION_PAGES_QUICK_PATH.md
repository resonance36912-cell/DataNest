# Production Pages Quick Path

The canonical production Pages workflow is intentionally operator-light.

## Normal path

A push to the protected `main` branch automatically starts the Pages release workflow. The workflow resolves the exact current `main` commit itself, validates the canonical production contract, runs technical validation, deploys through the protected `github-pages` environment, and verifies the live site.

No release SHA, Mirror reference, audit reference, PR reference, security reference, RONSAS reference, or governance evidence ID needs to be entered manually.

## Manual path

Use **Actions → Deploy GitHub Pages → Run workflow** only when a manual retry or deliberate release is needed. The workflow has no operator inputs; it always resolves the exact current `main` SHA.

## Authorization boundary

Production authorization remains enforced by the protected `github-pages` environment. Progressive-live evidence gaps are recorded explicitly elsewhere and are never replaced with fabricated references.

## Operator rule

For routine releases, merge the intended change to protected `main` and let the canonical release path handle the remaining mechanical steps.
