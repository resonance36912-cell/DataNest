# Resonance DataNest Certification and Production Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved UI/governance redesign into a traceable release candidate with automated UX/accessibility/security evidence, explicit human/external/legal review references, manual production authorization, exact-SHA deployment, and post-deployment verification.

**Architecture:** Keep normal CI, PR verification, RONSAS validation, and security scans as independent evidence producers. Add a UI-governance evidence manifest and visual/accessibility review suite, then change GitHub Pages from automatic push-to-production into an explicit exact-SHA workflow-dispatch release that requires review references and the GitHub Pages environment gate. The deployed release manifest records the review chain so production evidence can be traced back to the candidate.

**Tech Stack:** GitHub Actions, Next.js static export, Playwright, Node test runner, `@axe-core/playwright`, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-29-resonance-datanest-ui-governance-system-design.md`

## Global Constraints

- A successful merge or build is **not** production authorization.
- Production chain is exactly: **self-audit → automated verification → security validation → visual/UX review → governance-impact review → legal review where applicable → external/human review → production authorization → deployment → post-deployment verification → dossier/evidence update**.
- Deployment must target an explicit commit SHA that is reachable from `main`.
- GitHub Pages deployment must no longer happen automatically from every `main` push once this gate is active.
- Production deployment requires human action plus review references; do not fabricate or auto-fill approval references.
- Legal review is mandatory for this redesign because it changes legal/governance surfaces.
- Seven static user-facing applications must be verified live under `/DataNest/apps/<slug>/`; YouTube Optimizer must be verified through its DataNest-governed external SSR launch contract and canonical live SSR URL.
- Release evidence must identify the approved design spec and all four implementation plans.
- Free-promotion/no-paid-checkout remains active.
- Do not weaken existing security-scan thresholds to make the UI release pass.

## Review Focus

- **Dispatcher supplies a SHA not reachable from main:** deployment fails before build/deploy.
- **Review references are blank, “pending”, or placeholder text:** authorization verification fails closed.
- **Candidate passed UI tests but failed security/RONSAS validation:** production release cannot claim verified status.
- **Post-deploy content comes from a different SHA:** release-manifest/live verification fails.
- **Environment reviewer protection is absent:** workflow documentation explicitly flags production environment setup as required before the gate can be considered fully enforced.

---

### Task 1: Add a UI-governance release-evidence manifest

**Files:**
- Create: `scripts/write-ui-governance-evidence.mjs`
- Create: `tests/unit/ui-governance-evidence.test.mjs`
- Modify: `scripts/write-release-manifest.mjs`
- Modify: `tests/unit/release-manifest-alignment.test.mjs`

**Interfaces:**
- Evidence writer consumes environment values:
  - `DATANEST_UI_RELEASE_SHA`
  - `DATANEST_UI_RELEASE_STATE` = `candidate` or `authorized`
  - `DATANEST_UI_PR_VERIFICATION_REF`
  - `DATANEST_UI_SECURITY_REF`
  - `DATANEST_UI_RONSAS_VALIDATION_REF`
  - `DATANEST_UI_VISUAL_REVIEW_REF`
  - `DATANEST_UI_GOVERNANCE_REVIEW_REF`
  - `DATANEST_UI_LEGAL_REVIEW_REF`
  - `DATANEST_UI_EXTERNAL_REVIEW_REF`
  - `DATANEST_UI_AUTHORIZATION_REF`
- Produces `public/ui-governance-release.json`.
- `write-release-manifest.mjs` adds a `uiGovernance` object only when UI-governance env is supplied, preserving existing non-UI release behavior.

- [x] **Step 1: Write failing unit tests**

Assert candidate evidence cannot claim authorization, authorized evidence requires all review references, and design/plan paths are exact.

- [x] **Step 2: Run tests and verify failure**

Run: `node --test tests/unit/ui-governance-evidence.test.mjs tests/unit/release-manifest-alignment.test.mjs`  
Expected: FAIL because the evidence writer/manifest fields do not exist.

- [x] **Step 3: Implement the evidence writer and release-manifest integration**

Hard-code only artifact paths/contract version; read review identifiers from environment. Reject placeholder values such as empty string, `pending`, `todo`, and `tbd` when state is `authorized`.

- [x] **Step 4: Verify**

Run: `node --test tests/unit/ui-governance-evidence.test.mjs tests/unit/release-manifest-alignment.test.mjs`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add scripts/write-ui-governance-evidence.mjs scripts/write-release-manifest.mjs tests/unit/ui-governance-evidence.test.mjs tests/unit/release-manifest-alignment.test.mjs
git commit -m "feat: add UI governance release evidence manifest"
```

### Task 2: Add responsive and accessibility certification coverage

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/browser/ui-governance-accessibility.spec.ts`
- Modify: `tests/browser/auth.smoke.spec.ts`
- Modify: `tests/browser/home-optimization.spec.ts`
- Modify: `tests/browser/legal-centre.spec.ts`

**Interfaces:**
- Add `@axe-core/playwright` as a dev dependency and run WCAG 2A/2AA-relevant checks on stable public/root surfaces; any intentionally excluded third-party/widget region must be listed by selector and reason in the test.
- Responsive certification widths: **320, 390, 768, 1440**.
- Accessibility tests must cover visible focus, keyboard access, semantic landmark/headings, no color-only status, reduced motion, and no page-level horizontal overflow.

- [x] **Step 1: Add failing certification tests**

Cover signed-out entry, Legal Centre, Governance page, authenticated Home fixture, one lifecycle specialist page, and DataNest AI.

- [x] **Step 2: Run new suite**

Run: `npx playwright test tests/browser/ui-governance-accessibility.spec.ts`  
Expected: FAIL on current unmigrated UI issues or missing dependency.

- [x] **Step 3: Add `@axe-core/playwright` and fix violations in owning components**

Do not suppress a violation globally when it can be fixed in DataNest-owned markup.

- [x] **Step 4: Verify responsive suites**

Run:
```bash
npx playwright test   tests/browser/ui-governance-accessibility.spec.ts   tests/browser/auth.smoke.spec.ts   tests/browser/home-optimization.spec.ts   tests/browser/legal-centre.spec.ts
```
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/browser src/components src/app
git commit -m "test: add DataNest UI accessibility certification"
```

### Task 3: Capture successful visual-review evidence without making pixel snapshots the design authority

**Files:**
- Create: `tests/browser/ui-governance-review.spec.ts`
- Modify: `playwright.config.ts` if artifact retention needs an explicit setting
- Modify: `.github/workflows/pr-verification.yml`

**Interfaces:**
- Visual review test renders representative public, Home, DataNest AI, Governance, Execute, Verify, and legal surfaces at 390 and 1440 widths.
- It attaches full-page screenshots and a small JSON context record per surface; it asserts load/focus/overflow but does not use brittle golden-image pass/fail as the sole quality gate.
- PR Verification uploads visual-review evidence on success and failure with bounded retention.

- [x] **Step 1: Write the visual-review test**

Use deterministic fixture data already used by the root browser suites; do not call production services.

- [x] **Step 2: Run locally and verify evidence exists**

Run: `npx playwright test tests/browser/ui-governance-review.spec.ts`  
Expected: PASS only when each target renders and attachments are created.

- [x] **Step 3: Add PR workflow execution and artifact upload**

Name the artifact with the workflow run id, for example `ui-governance-review-<run-id>`; retain long enough for external/human review but not indefinitely.

- [x] **Step 4: Verify workflow YAML/source tests**

Run: `npm test && npm run check`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add tests/browser/ui-governance-review.spec.ts playwright.config.ts .github/workflows/pr-verification.yml
git commit -m "test: capture UI governance visual review evidence"
```

### Task 4: Produce a candidate evidence artifact from PR Verification

**Files:**
- Modify: `.github/workflows/pr-verification.yml`
- Modify: `scripts/write-ui-governance-evidence.mjs`
- Create: `docs/governance/platform-dossier/README.md`

**Interfaces:**
- PR Verification writes evidence with `releaseState:"candidate"`, current SHA, workflow run reference, design spec path, and plan paths.
- Candidate evidence explicitly leaves security, RONSAS, legal, external, and production authorization references as independently supplied/pending evidence rather than claiming success.
- Candidate artifact is uploaded for reviewers.

- [x] **Step 1: Add unit/source test for candidate semantics**

Assert candidate state never emits `authorized:true` and never fabricates missing independent workflow/review references.

- [x] **Step 2: Generate a local candidate manifest**

Run with only candidate-safe env values; inspect JSON.  
Expected: valid candidate file with explicit pending evidence slots/statuses.

- [x] **Step 3: Wire PR Verification upload**

Do not fail PR Verification merely because separate Security/RONSAS workflows have not yet completed; those are independent gates for production authorization.

- [x] **Step 4: Verify**

Run: `node --test tests/unit/ui-governance-evidence.test.mjs && npm test`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add .github/workflows/pr-verification.yml scripts/write-ui-governance-evidence.mjs docs/governance/platform-dossier/README.md tests
git commit -m "feat: publish DataNest UI release candidate evidence"
```

### Task 5: Convert Pages deployment from automatic main push to governed exact-SHA release

**Files:**
- Modify: `.github/workflows/pages.yml`
- Create: `scripts/verify-ui-production-authorization.mjs`
- Create: `tests/unit/ui-production-authorization.test.mjs`

**Interfaces:**
- Remove automatic `push: branches:[main]` production deployment.
- `workflow_dispatch` requires:
  - `release_sha`
  - `pr_verification_reference`
  - `security_scan_reference`
  - `ronsas_validation_reference`
  - `visual_review_reference`
  - `governance_review_reference`
  - `legal_review_reference`
  - `external_review_reference`
  - `production_authorization_reference`
  - explicit confirmation value `AUTHORIZE PRODUCTION`.
- Checkout/build uses `release_sha`.
- Preflight fetches `origin/main` and requires `git merge-base --is-ancestor "$RELEASE_SHA" origin/main`.
- Deployment continues to use the `github-pages` environment; repository settings must configure required human reviewers on that environment for the full gate.
- Authorized evidence/manifest receives the exact review references from inputs.

- [x] **Step 1: Write failing authorization tests**

Test missing/placeholder references, wrong confirmation text, malformed SHA, and a valid populated authorization payload.

- [x] **Step 2: Run unit tests**

Run: `node --test tests/unit/ui-production-authorization.test.mjs`  
Expected: FAIL because the verifier does not exist.

- [x] **Step 3: Implement the verifier**

Verifier validates structure only; it must not claim to prove the external reviewer’s identity beyond the supplied reference/environment authorization.

- [x] **Step 4: Refactor Pages workflow**

Build and test the requested SHA, write authorized evidence, bundle all eight apps, upload Pages artifact, and deploy only after the preflight plus environment gate.

- [x] **Step 5: Verify workflow source contract**

Add assertions in `ui-production-authorization.test.mjs` that no automatic push deploy remains, all required inputs exist, exact-SHA checkout is used, and `environment.name` remains `github-pages`.

- [x] **Step 6: Configure the GitHub `github-pages` environment review gate**

Require at least one authorized human reviewer in repository Settings → Environments → `github-pages`. If the connected GitHub tooling can configure required reviewers, apply and read back the setting; otherwise stop before production use and have the repository owner configure it manually. The workflow must not be described as a fully enforced human gate until this readback is confirmed.

Read-only GitHub REST verification on 2026-09-30 confirmed the existing required-reviewer rule for `DataNest-Supository`, administrator bypass disabled, and a deployment branch policy restricted to `main`. No environment settings were changed. See the dated verification update below and `docs/governance/platform-dossier/UI_GOVERNANCE_CANDIDATE_88945f1.md` for the evidence and remaining review requirements.

- [x] **Step 7: Commit**

```bash
git add .github/workflows/pages.yml scripts/verify-ui-production-authorization.mjs tests/unit/ui-production-authorization.test.mjs
git commit -m "feat: gate DataNest production Pages releases"
```

### Task 6: Extend live verification to legal/governance UI and all DataNest-hosted apps

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `tests/browser/auth.smoke.spec.ts`
- Modify: `tests/browser/legal-centre.spec.ts`
- Modify: `tests/browser/ui-governance-accessibility.spec.ts`

**Interfaces:**
- Live verification checks:
  - root auth shell;
  - `/legal/`;
  - `/governance/`;
  - `/accessibility/`;
  - release manifest;
  - UI governance evidence;
  - the seven static app roots plus the YouTube Optimizer canonical SSR URL/launch contract.
- Release manifest `frontendCommit` must match `release_sha`, not workflow-file `GITHUB_SHA`.
- Post-deploy Playwright runs against the live Pages base URL.

- [x] **Step 1: Add failing workflow/source assertions for the seven static app slugs, the YouTube Optimizer SSR launch target, and legal routes**

- [x] **Step 2: Update live curl checks and Playwright smoke set**

Use the exact release SHA input when verifying manifests.

- [x] **Step 3: Run local static export verification**

Run: `npm run build && node scripts/build-ronsas-pages.mjs`; serve the output under `/DataNest/` and run the smoke/legal/accessibility suites against it.

- [x] **Step 4: Commit**

```bash
git add .github/workflows/pages.yml tests/browser
git commit -m "test: extend DataNest post-deploy verification"
```

### Task 7: Add the human/external review dossier template

**Files:**
- Create: `docs/governance/platform-dossier/UI_GOVERNANCE_RELEASE_REVIEW.md`
- Create: `docs/governance/platform-dossier/UI_GOVERNANCE_EVIDENCE_SCHEMA.md`
- Modify: `docs/governance/platform-dossier/README.md`

**Interfaces:**
- Review record fields:
  - candidate SHA;
  - design spec commit;
  - implementation-plan commits;
  - PR Verification run;
  - RONSAS validation run;
  - Security scan run;
  - visual review artifact;
  - governance-impact review;
  - legal review;
  - external/human review;
  - production authorization;
  - deployment run;
  - post-deployment verification.
- Empty fields explicitly mean “not yet approved”; no sample values may look like real approval.

- [x] **Step 1: Add failing evidence-schema source assertion**

Require every production-chain stage from the spec and prohibit default “approved” values.

- [x] **Step 2: Add dossier docs**

Explain that the workflow evidence JSON is machine traceability and the review record is human/governance traceability; neither substitutes for the other.

- [x] **Step 3: Verify**

Run: `node --test tests/unit/ui-governance-evidence.test.mjs tests/unit/ui-production-authorization.test.mjs`  
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add docs/governance/platform-dossier tests/unit
git commit -m "docs: add DataNest UI production review dossier"
```

### Task 8: Run the complete candidate certification before requesting production authorization

**Files:**
- No new product files expected; fixes belong to the task/file that owns a failing gate.
- Evidence generated by workflows/tests is reviewed, not hand-edited to pass.

**Interfaces:**
- Candidate is eligible for human/external authorization only when all commands/workflows below pass for the same commit SHA.

- [x] **Step 1: Run root gates**

Run: `npm test && npm run check && npm run build`  
Expected: PASS.

- [x] **Step 2: Run root browser certification**

Run the PR Verification browser set plus `tests/browser/legal-centre.spec.ts`, `tests/browser/ui-governance-accessibility.spec.ts`, and `tests/browser/ui-governance-review.spec.ts`.  
Expected: PASS.

- [x] **Step 3: Run RONSAS validation**

Run `node scripts/validate-ronsas-imports.mjs`, `node scripts/validate-ronsas-brand-contract.mjs --complete`, and every application command encoded in `.github/workflows/ronsas-app-validation.yml`. Confirm the seven static apps bundle successfully and YouTube Optimizer passes its SSR build/gate plus DataNest launch-contract tests.  
Expected: PASS.

- [x] **Step 4: Run security invariants locally where supported**

Run: `node scripts/verify-security-invariants.mjs && npm audit --omit=dev --audit-level=high`  
Expected: PASS. Semgrep/gitleaks remain authoritative in GitHub Actions.

- [x] **Step 5: Confirm GitHub workflow evidence for the same candidate SHA**

Required: PR Verification PASS, RONSAS Application Validation PASS, Security Scan PASS, and visual-review artifact available.

- [x] **Step 6: Stop before production deployment**

Hand the candidate SHA and evidence references to authorized human/legal/external reviewers. Do not trigger the production Pages workflow until those reviews and the `github-pages` environment approval are complete.

- [x] **Step 7: Commit any final evidence-only documentation changes separately**

Do not amend the tested candidate code commit after certification; if code changes, generate a new candidate SHA and repeat certification.


## Exact-head candidate certification evidence — 2026-09-29

Candidate implementation SHA: `88945f1002e96d0ca0d9c139d37e86c4fa32b1a1`  
Merged to `main` by PR #282 as merge commit `9111d0915028fa1e53be562295a355c5eb81c9b4`.

Exact candidate workflow evidence:

- CI #2433 / run `36623863165`: **PASS**.
- PR Verification #1311 / run `36623862900`: **PASS**.
  - browser verification: PASS
  - accessibility certification: PASS
  - UI governance visual review: PASS
  - artifact `ui-governance-review-36623862900`
  - artifact `ui-governance-candidate-36623862900`
- RONSAS Application Validation #172 / run `36623863024`: **PASS**.
- Security scan #839 / run `36623863133`: **PASS**.
  - project security invariants: PASS
  - dependency audit: PASS
  - Semgrep: PASS
  - gitleaks: PASS
- DataNest AI Certification #1569 / run `36623863261`: **PASS**.
  - artifact `datanest-ai-certification-2d3a5571d0e02b1c41ba7a719035d02f95ffaf06`
  - artifact `datanest-ai-backend-acceptance-2d3a5571d0e02b1c41ba7a719035d02f95ffaf06`

### Production blockers recorded on 2026-09-29

Task 5 Step 6 remains open. The repository workflow retains `environment.name: github-pages`, but the connected GitHub tooling available for this execution cannot read or configure the repository environment's required-reviewer protection. Therefore the human environment gate is **not claimed as verified**.

Production deployment remains blocked until:

1. the `github-pages` environment is confirmed to require at least one authorized human reviewer;
2. durable governance-impact, legal-review, external/human-review, and production-authorization references exist for the exact release SHA;
3. the manual Pages workflow is dispatched with those non-placeholder references and `AUTHORIZE PRODUCTION`;
4. post-deployment verification passes and the dossier is updated.

No production deployment was triggered while recording this evidence.

## Verification update — 2026-09-30

Task 5 Step 6 is now verified through read-only GitHub REST responses:

- [Environment protection](https://api.github.com/repos/DataNest-Supository/DataNest/environments/github-pages): `required_reviewers` names `DataNest-Supository`; `can_admins_bypass` is `false`; `prevent_self_review` is `false`.
- [Deployment branch policy](https://api.github.com/repos/DataNest-Supository/DataNest/environments/github-pages/deployment-branch-policies): the sole allowed policy is branch `main`.
- The five candidate workflows listed above still report `success` for `88945f1002e96d0ca0d9c139d37e86c4fa32b1a1`. The PR Verification visual-review and candidate artifacts are available and unexpired.

This resolves the environment-readback blocker recorded on 2026-09-29. It does not constitute an environment approval for a particular deployment or replace governance, legal, external/human, or production-authorization review references. Those references remain unrecorded in the release dossier.

The [live release manifest](https://datanest-supository.github.io/DataNest/release-manifest.json) reports `e0f35c7e11b23c11eafd14a96ce288dc6fd702ba`. Git ancestry confirms it contains UI optimization PRs #50 and #115 and UI/governance PR #258, but predates production-gate PR #282. The root auth shell, legal page, governance page, and health marker return HTTP 200. The later `ui-governance-release.json` returns HTTP 404 on this older release; it must not be represented as an authorized release under the new workflow.

Existing UI source checks (63) and release-evidence/authorization checks (16) pass on current main `d0fd26f6931f94bbca2677a11e1ac939bd4b2f2f`. These focused checks do not certify every subsequent mainline change or substitute for exact-candidate workflow evidence. No production workflow was dispatched and no approval reference was created.
