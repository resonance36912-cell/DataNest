# Workflow Reviewer & Code Cleaner

The Workflow Reviewer & Code Cleaner is DataNest's post-declutter refinement stage. It turns repository and GitHub Actions structure into a repeatable optimization report without silently changing application behavior.

## What it does

1. Scans configured source, script, workflow, and documentation roots.
2. Applies only byte-safe text refinements when `--apply` is requested:
   - remove UTF-8 BOM markers;
   - normalize CRLF to LF;
   - remove trailing whitespace outside Markdown/text files;
   - normalize the terminal newline.
3. Reviews source structure for oversized files/functions, dense deferred-work markers, ad-hoc console logging, and repeated explicit `any` usage.
4. Reviews GitHub Actions for oversized workflows, floating action references, broad `write-all` permissions, and `pull_request_target` trust-boundary risk.
5. Detects repeated setup/build steps across workflows that may be candidates for reusable workflows or composite actions.
6. Generates:
   - `artifacts/workflow-reviewer/report.json` for automation;
   - `artifacts/workflow-reviewer/report.md` for human review;
   - a GitHub Actions job summary when run in CI.

## Commands

```bash
npm run workflow-review
npm run workflow-review:clean
npm run test:workflow-reviewer
```

Use strict mode when high-severity workflow findings should fail the run:

```bash
npm run workflow-review -- --strict
```

## Operating model

This stage is intentionally conservative. Automatic cleanup is limited to formatting-level normalization that should not change runtime behavior. Refactors, module splits, permission changes, workflow extraction, type changes, and observability changes are reported as prioritized next steps for review.

The GitHub Actions workflow runs on relevant pull requests, weekly, and on manual dispatch. Manual dispatch can enable safe refinements and strict failure mode.

## Refinement loop

The intended sequence is:

`declutter -> safe refinement -> reviewer report -> prioritized next steps -> implementation -> tests -> review again`

This keeps optimization measurable and avoids mixing destructive cleanup, behavioral refactoring, and governance evidence into one opaque operation.
