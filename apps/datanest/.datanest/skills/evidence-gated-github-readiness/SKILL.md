---
name: evidence-gated-github-readiness
description: "Use when reviewing a GitHub pull request, branch, release candidate, deployment, or repository change for merge/release readiness. Pin the exact revision, inspect the actual diff and current evidence, separate confirmed findings from unknowns, detect stale or mismatched validation, and return the smallest corrective path plus an evidence-based readiness state. Especially suited to DataNest/Resonance governance reviews."
metadata:
  author: Resonance AppDev
  version: "0.1.0"
---

# Evidence-Gated GitHub Readiness Review

## Purpose

Determine exactly what the available repository evidence proves about a candidate change without transferring stale evidence from another revision, environment, branch, or deployment.

Use this skill for PR reviews, pre-merge checks, release-candidate audits, deployment-readiness reviews, security validation, browser/test reconciliation, and governance evidence checks.

## Core Rule

**Evidence is revision-scoped.**

A passing check, review, screenshot, deployment, audit, or artifact only proves something about the exact source revision and environment it actually evaluated.

Never silently transfer evidence from:

- an older commit,
- a different branch,
- a different PR head,
- another environment,
- an incomplete or queued run,
- a skipped/cancelled job,
- or a deployment whose revision is not proven to match the candidate.

## Trigger Examples

Use this skill when the request resembles:

- "Review this PR and its current diff."
- "Is this ready to merge?"
- "Confirm which claims are evidenced."
- "Review the latest comments and repository status."
- "Separate confirmed issues from unknowns."
- "Check CI, security, browser, visual, or deployment validation."
- "Audit this release candidate."
- "Resume the validation/review."

## Inputs

Minimum:

- repository or repository URL
- target: PR number, branch, commit, release, or deployment

Optional:

- claims to verify
- expected behavior or acceptance criteria
- governance requirements
- deployment target
- known prior review/checkpoint

## Workflow

### 1. Establish Source Authority

Resolve and record:

- repository
- target
- base branch
- head branch
- exact head SHA
- target state: open/draft/merged/conflicted/etc.
- deployment revision, if applicable
- revision actually tested by each material check

If the reviewed, tested, and deployed revisions differ, flag that before making readiness claims.

For DataNest work, also identify the applicable repository role and environment and preserve exact SHA lineage.

### 2. Read the Actual Change Surface

Inspect the current diff, not only the PR description or comments.

Map:

`changed files -> affected behavior -> required validation`

Pay particular attention to:

- implementation changes
- tests and fixtures
- selectors and accessibility attributes
- security and authorization boundaries
- database/RLS/RPC changes
- workflow/deployment configuration
- dependency and lockfile changes
- browser/responsive behavior
- generated artifacts
- release/governance metadata

Look specifically for tests, selectors, fixtures, or docs that still encode behavior removed or changed by the implementation.

### 3. Reconcile Claims Against Evidence

Classify every material claim as exactly one of:

- **CONFIRMED** — direct current evidence supports the claim.
- **PARTIALLY CONFIRMED** — evidence exists but scope or completeness is limited.
- **UNKNOWN** — available evidence cannot establish the claim.
- **CONTRADICTED** — current evidence conflicts with the claim.

Examples:

- "CI passes" is not confirmed while required jobs are queued.
- "Security validated" is not confirmed when the relevant job was skipped.
- "Production fixed" is not confirmed from source changes alone when deployment evidence is absent.
- "The tests cover the new behavior" is contradicted when tests still target removed UI semantics.

### 4. Inspect Validation Evidence

Review the categories relevant to the change:

| Category | Evidence question |
| --- | --- |
| Build/type/lint | Does the exact head pass? |
| Unit/integration | Are affected behaviors exercised? |
| Security | Did SAST, secret, dependency, invariant, RLS/RPC, or equivalent checks run successfully? |
| Browser/E2E | Does the current implementation pass real interaction coverage? |
| Visual | Is current render evidence available where required? |
| Accessibility | Do roles, labels, states, selectors, and keyboard behavior agree with implementation? |
| Deployment | Is the intended revision actually deployed and reachable? |
| Governance | Are required independent review/approval/evidence records traceable? |

Record queued, skipped, cancelled, neutral, stale, inaccessible, credential-dependent, and not-run states explicitly. Do not convert them into passes.

### 5. Diagnose Concrete Mismatches

For each evidence-backed problem, use:

- **Location:** file/test/workflow/component
- **Expected:** what the current implementation or contract requires
- **Observed:** what the evidence actually shows
- **Impact:** why the mismatch matters
- **Smallest correction:** minimum change needed

Prefer correcting stale tests/fixtures/selectors over modifying correct production behavior merely to satisfy obsolete assertions.

### 6. Separate Findings From Limits

Keep these distinct:

**Confirmed findings** — directly demonstrated by code, diff, checks, logs, artifacts, reviews, or deployment evidence.

**Unknowns / evidence gaps** — unresolved because evidence is absent, stale, skipped, inaccessible, environment-dependent, or outside review scope.

Never report an unknown as a defect unless evidence establishes it.

### 7. Apply Readiness State

Use exactly one state:

- **READY ON AVAILABLE EVIDENCE** — all material required evidence for the defined scope is current and successful.
- **READY AFTER SPECIFIED CORRECTIONS** — only bounded, explicitly identified corrective work remains.
- **NOT YET EVIDENCED** — no confirmed blocker may exist, but required current evidence is incomplete.
- **BLOCKED BY CONFIRMED ISSUE** — a demonstrated issue must be corrected before promotion.

The state describes evidence, not intuition.

Do not claim production certification, release sealing, successful deployment, or merge completion unless that evidence actually exists.

### 8. Recommend the Smallest Corrective Path

Prefer an ordered path such as:

`correct mismatch -> rerun affected validation -> verify exact SHA -> obtain required approval -> promote`

Avoid unrelated refactoring or architectural expansion unless the confirmed problem requires it.

Preserve existing work. Do not recommend destructive resets, rebases, or force pushes unless explicitly authorized.

## Required Output

### Executive Summary

In 2-5 sentences state:

- exact revision reviewed
- principal confirmed result
- important evidence limitation, if any
- current readiness state

### Confirmed Findings

| Severity | Finding | Evidence | Required correction |
| --- | --- | --- | --- |

Only evidence-backed issues belong here.

### Unknowns / Evidence Gaps

| Question | Why unresolved | Evidence needed |
| --- | --- | --- |

### Validation Status

| Gate | Status | Revision/evidence |
| --- | --- | --- |
| Diff/implementation | PASS / FAIL / UNKNOWN | |
| Tests | PASS / FAIL / PARTIAL / UNKNOWN | |
| Security | PASS / FAIL / PARTIAL / UNKNOWN | |
| Browser/E2E | PASS / FAIL / PARTIAL / UNKNOWN | |
| Visual | PASS / FAIL / PARTIAL / N/A | |
| Deployment | PASS / FAIL / UNKNOWN / N/A | |
| Governance approval | PASS / PENDING / UNKNOWN | |

### Readiness

State exactly one readiness state and the concrete conditions required to advance.

### Next Actions

Give the smallest ordered sequence that resolves confirmed findings or closes evidence gaps.

## DataNest / Resonance Governance Profile

When used against DataNest-Supository or related Resonance repositories, also enforce these checks:

1. Treat `DataNest-Supository/DataNest` as canonical only when the repository protocol says so; do not transfer production authority from Mirror or an R&D environment.
2. Pin the exact candidate SHA. A branch name, chat summary, moving `main`, or prior screenshot is not a substitute.
3. Keep technical verification separate from promotion authorization.
4. Do not interpret Mirror/R&D verification as canonical production certification.
5. Require production promotion evidence to reference the exact reviewed candidate revision.
6. Verify required protected-branch checks at the candidate revision.
7. Treat skipped/queued/cancelled/missing required checks as unresolved rather than passing.
8. Preserve repository-visible review/checkpoint lineage when the coordination protocol applies.
9. Require traceable human authorization where governance requires it.
10. Do not declare deployment/version certification until the relevant validation, evidence, and approval gates are complete.

Where repository coordination tags are in use, respect their semantics, including `DN:VERIFY`, `DN:PROMOTE`, `DN:BLOCK`, `DN:FREEZE`, `DN:CHECKPOINT`, and exact-SHA handoffs.

## Guardrails

Never:

- infer that queued or skipped checks passed
- rely on an older tested SHA without disclosing it
- treat PR claims or comments as proof by themselves
- confuse source readiness with deployment readiness
- mark governance requirements complete without traceable evidence
- label an unknown as fixed
- hide limitations caused by unavailable credentials, tools, or environments
- broaden a focused correction into an unrelated rewrite
- merge or promote merely because the review found no confirmed defect

## Compact Invocation

> Review `<repository / PR / branch / release>`. Pin the exact current revision, inspect its actual diff and latest review/CI evidence, reconcile implementation with tests and stated claims, and separate confirmed findings from unknowns or stale evidence. Check relevant build, security, browser, visual, deployment, and governance gates. Recommend only the smallest corrective changes required, then give one evidence-based readiness state and ordered follow-up actions.
