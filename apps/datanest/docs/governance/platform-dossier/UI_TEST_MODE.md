# DataNest UI Test Mode

## Purpose

Test Mode provides an evidence-generating release rehearsal before the human governance, legal, independent/external, and production-authorization decisions are complete.

It intentionally **does not require those human review references to run**. This allows reviewers to inspect a tested candidate and use the resulting artifacts as evidence in their own decision records.

## Safety boundary

Test Mode is not a production bypass.

- It checks out an exact SHA that must be reachable from `main`.
- It runs unit, type, static-build, RONSAS-bundle, browser, accessibility/governance-surface, and visual-review checks against a local Pages-compatible preview.
- It records UI governance state as `candidate`, never `authorized`.
- It does not invoke `verify-ui-production-authorization.mjs`.
- It has no `pages: write` or `id-token: write` permission.
- It does not use the protected `github-pages` environment.
- It does not call `actions/deploy-pages`.
- It does not publish to the production GitHub Pages site.
- It reuses the canonical public Supabase client configuration already recorded in the production Pages workflow, avoiding duplicate credential-like literals in Test Mode.

The production workflow in `.github/workflows/pages.yml` remains fail-closed and still requires governance, legal, independent/external review, production authorization, the exact `AUTHORIZE PRODUCTION` confirmation, and the protected environment approval.

## Evidence bundle

A successful run uploads `ui-test-mode-evidence-<run-id>` for 30 days. The bundle contains:

- `test-mode-report.json` — exact candidate SHA, run URL, mode, result, and production-boundary assertions.
- `HUMAN_REVIEW_EVIDENCE.md` — a compact reference suitable for embedding in human review comments or approval records.
- `ui-governance-candidate.json` — candidate-state governance evidence with the Test Mode visual-review reference.
- `release-manifest.json` — release identity and component versions used during the rehearsal.
- Playwright/test result material and the local preview log when available.

Human reviewers may cite or embed this evidence in the governance, legal, independent/external, and production-authorization records. The automated bundle does not make those decisions itself.

## Operation

Use **Actions → DataNest UI Test Mode → Run workflow** and provide the exact 40-character SHA to test. The first merge that enables this workflow also runs it automatically on the resulting `main` SHA so an initial evidence bundle is produced immediately.
