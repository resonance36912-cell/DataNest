# DataNest review and optimization — 25 September 2026

Status: partial live review plus source review; not full-system certification.

Baseline: `ac93d51828707d398dfa9c5a471d8a6ed4c9059f` on main, matching the user-supplied release identifier.

## Scope and evidence

The live GitHub Pages application reached its signed-out screen in the review browser. An authenticated session was unavailable, so private workspace interaction, actual role enforcement, database state, invitation delivery, voting, certification and production output quality were not tested. No live records or settings were changed.

Reviewed source: authentication, primary navigation/data loading, external AI handoff/return, clipboard selection, responsive dock styles, build configuration, CI and Pages workflows. This is a targeted review, not an exhaustive security audit.

## Implemented changes

| Finding | Evidence | Change |
|---|---|---|
| Automatic clipboard capture can overwrite a response under review | The existing selector accepted different clipboard text even when currentResponse was populated; a new regression test failed against the baseline | Preserve nonempty drafts by default; explicit Paste from clipboard can replace them. Read the latest draft after asynchronous clipboard reads so edits made while waiting are preserved |
| Job changes retain a cached handoff from the previous job | Job-change effect reset trace/session but did not clear handoff; copy/render preferred handoff over newly prepared context | Clear cached handoff when the selected job changes |
| Pages deployment does not run unit tests before publication | The build job ran npm ci, type checking and build, independently of CI | Add npm test before the Pages build |
| Sign-in introduction is technical and uses legacy framing | Live screen and metadata described UNIFI / TranScheduler rather than the user's workspace tasks | Use plain DataNest project/collaboration copy and explain how to request access |
| CSS compatibility warning | Static build warned about align-items:end in a flex container | Use flex-end for the stakeholder pool controls |

No new dependencies, database migrations, billing, role changes or certification bypasses.

## Remaining priorities

| Priority | Finding or limitation | Recommended acceptance check |
|---|---|---|
| High | ExternalAiSidebar asynchronous job-context loads have no stale-response cancellation; switching jobs quickly may show a previous job's updates. Session creation and clipboard reads also need context-change coverage | Delay job A's response, select B, resolve A last; verify no A context or session is applied to B. Cover provider switching and unmount |
| High | Runs and checkpoints queries lack an explicit project filter; RLS may limit access but the current project's history is not assured by these client queries | With a test user authorized for two projects, verify only the selected project's history appears; inspect schema before choosing a join/filter |
| Medium | AI sidebar's active-session synchronization includes selectedJobId and may reverse a manual job selection while a different AI job remains active | Define which selection owns the context; verify explicit user selection is honored and trace identity stays consistent |
| Medium | Clipboard access alone is not an explicit off switch for auto-fill | Add a user-controlled capture toggle and test focus/visibility transitions, cancellation and permission denial |
| Medium | Normal Refresh updates summary/recent jobs/health, rather than reloading the currently visible paginated list | Test Refresh in scheduler, runs, checkpoints and audit, including page boundaries |
| Medium | Compact layouts intentionally use an overlay AI dock | Verify at 390, 768, 1024 and 1440 pixels; keyboard focus, close controls, Return to DataNest and draft preservation must remain usable |
| Medium | Authenticated end-to-end outcomes were not exercised in this review | Test job creation → AI handoff → edited response → staged intake → independent review → certification, including failure and retry paths |

## Transparency integration

At review time, PR #14 (`feature/datanest-transparency-audit-library-v1`) was already implementing the audit library and public accessible audit brief. This patch does not duplicate that work. Add this review to the registry after that feature lands, retaining the partial-review status and linking remediation commits. A published audit brief is not evidence that the described full audit has passed.

## Validation

- Regression demonstrated before fixing: automatic capture returned unrelated clipboard text over an edited draft.
- Full unit suite: 87 passed, 0 failed.
- TypeScript: npm run check passed.
- GitHub Pages static production build: passed with /DataNest base path.
- Build's flex alignment warning eliminated by the CSS change.
- npm audit --omit=dev --audit-level=high: 0 vulnerabilities reported.
- git diff --check: passed.
- Browser observation: production signed-out screen only; no authenticated acceptance claim.
- Existing Node module-type and npm proxy-configuration warnings remain environment/tooling observations, not test failures.

Merge and deployment remain subject to the PR's exact-head CI and governed certification. Local tests do not constitute live certification.
