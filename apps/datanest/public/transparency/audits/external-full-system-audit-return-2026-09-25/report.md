I’ll start with read-only checks of the public UI, repository, and release markers, then audit whatever source and runtime evidence is accessible. I’ll mark anything I cannot verify as NOT TESTED and separate observed defects from proposed optimizations.The public page and static health marker are reachable, and I’ve retrieved source at the specified baseline commit. Some unpinned `main` responses differ from that snapshot, so I’m using commit-pinned evidence rather than treating those differences as proven production drift.

The source review has identified concrete optimization candidates in external-AI handoff privacy, invitation delivery ordering, refresh behavior, and test coverage. Authenticated UI behavior, deployed database controls, and output quality remain unverified; I haven’t run production mutations.# RESONANCE DATANEST / RONSAS - EXTERNAL AUDIT RETURN

## 1. Executive Summary

**Audit date:** September 25, 2026  
**Audit type:** Read-only public-surface inspection and commit-pinned source review  
**Source baseline examined:** `ac93d51828707d398dfa9c5a471d8a6ed4c9059f`

**Overall state: Meaningful governance foundations are present in source, but production readiness cannot be certified from the available access. The highest-value work is to strengthen evidence integrity, retry behavior, context continuity, and release verification—not remove governance controls.**

- **Coverage limitation:** This is a substantive source audit, not a completed authenticated production audit. No production writes, invitation sends, votes, ledger transactions, or AI requests were executed.
- The public application returned its startup shell; the static health marker returned `ok: true`. This verifies those public artifacts were retrievable—not that authentication or the complete control plane worked. ([datanest-supository.github.io](https://datanest-supository.github.io/DataNest/))
- **Strongest areas:** The pinned authentication component includes startup timeout/error handling, and deployment configuration supports static export and standalone operation. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/AuthGate.tsx))
- Membership source explicitly checks authenticated identity, invitation expiry, and invited-to-active transitions. These are positive implementation signals, not proof of deployed authorization behavior. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/supabase/migrations/20260925070000_datanest_project_member_invitations_v1.sql))
- Governance UI binds ratification to an accepted proposal’s target protocol instead of simply choosing the newest draft. Preserve this behavior. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/GovernanceWorkspace.tsx))
- **Highest privacy risk identified:** External-AI launch code places the handoff—including user email and work context—into a URL query parameter. **AUD-002.** ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/ExternalAiSidebar.tsx))
- **Highest output-integrity defect identified:** The external-intake replay shortcut returns success for an already-linked session before comparing the newly supplied content. **AUD-003.** ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/supabase/functions/datanest-ai-intake/index.ts))
- **Highest context-continuity defect identified:** AI session retrieval selects the earliest 100 events, so later history falls outside the retrieved context. **AUD-004.** ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/supabase/functions/datanest-ai-chat/index.ts))
- **Highest retry concern:** Sparks redemption creates a new request key on each submission rather than retaining one across an uncertain retry. **AUD-005.** ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/SparksWorkspace.tsx))
- **Highest-friction workflows:** Refresh/navigation, thread switching, and historical result interpretation need clearer state ownership and freshness semantics. **AUD-007–009.**
- **Largest assurance gap:** Several acceptance checks inspect function text or UI wording rather than exercise the protected transition. Existing tests remain useful, but do not establish all claimed invariants. **AUD-010.** ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/tests/sql/datanest_project_member_invitations_acceptance.sql))
- **Highest-leverage optimizations:** Content-bound idempotency; recent-context retrieval; intent-preserving retries; project/job-scoped data loading; version-specific result displays; and deployment attestations.
- **Recommendation:** Address the high-priority source findings and complete controlled runtime validation before expanding usage. Do not describe unverified governance, isolation, or ledger controls as passed.

## 2. Audit Coverage

### Tested

**Public read-only observations**
- Retrieved the production startup document.
- Retrieved the static health marker.
- Retrieved the repository and specified baseline commit.

**Static inspection**
- Application shell and navigation.
- Authentication initialization.
- UNIFI and scheduler UI code.
- External-AI handoff, clipboard capture, and intake.
- AI session/context loading.
- Think Tanks, Sparks, Stakeholder, Governance, and Product Lab components.
- Project-member invitation migration and delivery function.
- Release-manifest generation, Pages deployment, certification workflow, and selected SQL/browser/stress tests.

Static findings below apply to the **specified commit**, not automatically to the currently deployed application.

### Not tested

- Rendered authenticated screens, screenshots, responsive layouts, keyboard journeys, screen readers, or measured contrast.
- Real sign-in, email delivery, membership activation, role changes, or cross-project authorization.
- Scheduler execution, fairness, reservations, recovery, and UNKNOWN-state enforcement.
- Production RLS, grants, deployed function bodies, ledger concurrency, voting, or certification.
- Actual AI answers, certified-memory samples, score calculations, exports, or checkpoint usefulness.
- Runtime timings, dependency vulnerability execution, backup restoration, or rollback.

### Access limitations

The available tools retrieve web/source content but do not provide an authenticated interactive browser, shell, test runner, or database session.

The live release manifest and runtime configuration could not be retrieved through the browsing tool. **This is an access limitation, not evidence that either endpoint is broken.**

Unpinned `main` responses differed from commit-pinned files. I therefore excluded those differences from production-regression conclusions.

### Evidence sources

All implementation findings cite repository source pinned to the supplied baseline. Evidence descriptions include file paths and functions so findings remain usable if copied without rendered citation links.

**Evidence convention:**  
- **FAIL / PARTIAL — source:** A code-level issue was observed; production reproduction remains pending.
- **NOT TESTED:** Required runtime or configuration evidence is missing.
- Proposed validation tests below have **not** been executed.

### Current-state system map

The inspected shell defines 13 destinations:

| Group | Destinations |
|---|---|
| Project | Overview, Stakeholder, Sparks, Governance |
| Research | Think Tanks, DataNest AI, Product Lab |
| Tools | UNIFI Planner, TranScheduler |
| Operations | Runs |
| Continuity | Checkpoints, Audit |
| System | Settings |

This is a **component/navigation inventory**, not a verified URL-route map. Capacity and Operations Capabilities are not entries in this inspected navigation array. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/DataNestApp.tsx))

**Source-derived control flow:**

```text
GitHub source
    └─ Build / deployment workflows
         └─ Browser application
              ├─ Supabase Auth
              ├─ User-scoped reads and governed RPCs
              └─ Edge Functions
                   ├─ Production authorization / usage records
                   └─ Configured AI intake/review store
```

The AI intake code explicitly uses a separately configured staging client while checking production session/job access through the caller’s client. The actual deployed mapping remains unverified. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/supabase/functions/datanest-ai-intake/index.ts))

## 3. Scorecard

**No overall production scores are assigned.** Source inspection is recorded as coverage, but is insufficient for the brief’s production-readiness scoring. “NOT TESTED” does not mean broken.

| Domain | Score 0–5 | Confidence | Coverage | Top Gap |
|---|---|---|---|---|
| UI / UX | NOT TESTED | — | Shell/workspace source | Rendered journeys; AUD-007 |
| Accessibility | NOT TESTED | — | Selected markup/CSS | Keyboard, zoom, screen reader |
| Architecture | NOT TESTED | — | Configuration and selected boundaries | Deployed topology; AUD-001/013 |
| Auth / membership | NOT TESTED | — | Auth, invitation SQL/function | Real identity transitions |
| UNIFI / Jobs | NOT TESTED | — | Planner source | Manifest/checkpoint samples |
| TranScheduler | NOT TESTED | — | Queue UI only | Execution safety and recovery |
| DataNest AI | NOT TESTED | — | Context/intake source | Live quality and isolation |
| Think Tanks | NOT TESTED | — | Workspace source | Independent review enforcement |
| Contribution Intelligence | NOT TESTED | — | Workspace source | Recomputed scores and anomalies |
| Sparks | NOT TESTED | — | UI and acceptance-test source | Ledger/concurrency execution |
| Governance | NOT TESTED | — | UI and acceptance-test source | Ratified protocol/vote chain |
| Outputs / artifacts | NOT TESTED | — | Generation/display paths | Representative output corpus |
| Security / privacy | NOT TESTED | — | Selected trust boundaries | Deployed RLS/grants/config |
| Performance / reliability | NOT TESTED | — | Loading/retry/query patterns | Timings and failure injection |
| CI/CD / maintainability | NOT TESTED | — | Workflow/test source | Run evidence and protection rules |
| Operational efficiency | NOT TESTED | — | Selected configuration/query paths | Usage, costs, complete billing inventory |

## 4. Findings

**For every finding:** No screenshot or runtime trace was captured. The cited source is the evidence attachment. Effort estimates are preliminary: **S** localized; **M** cross-component; **L** cross-service or migration work.

### AUD-001 - Release metadata does not independently attest deployed database and function state

- **Domain:** Architecture / Release governance
- **Severity:** HIGH
- **Confidence:** HIGH for source limitation
- **Status:** PARTIAL — source; live reconciliation NOT TESTED
- **Evidence:** `scripts/write-release-manifest.mjs`, lines 3–20, derives database/function versions from environment values or defaults. The pinned Pages workflow checks expected manifest strings. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/scripts/write-release-manifest.mjs))
- **Observed behavior:** Metadata records declared versions; this generator does not query deployed migrations or function digests.
- **Expected behavior:** Distinguish intended release configuration from independently observed deployment evidence.
- **Root-cause hypothesis:** Release description and deployment attestation are treated as equivalent.
- **User impact:** Operators could overestimate release consistency.
- **Optimization proposal:** Produce a promotion attestation linking source SHA, build digest, migration checksums, deployed function digests, environment, and certification run.
- **Expected benefit:** Reproducibility and faster drift diagnosis.
- **Effort:** M–L; deployment integration.
- **Dependencies:** Owner-run, sanitized deployment inventory.
- **Risk / invariant check:** Preserve GitHub authority and exact-candidate certification.
- **Validation test:** Deliberately mismatch one staging function digest; promotion must fail despite matching version labels.

### AUD-002 - External-AI launch places work context and user email in a URL

- **Domain:** Privacy / External AI
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** FAIL — source
- **Evidence:** `ExternalAiSidebar.tsx`: `buildHandoff()` includes email/context; `providerLaunchUrl()` assigns the prompt to a query parameter. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/ExternalAiSidebar.tsx))
- **Observed behavior:** The handoff becomes part of the launch URL.
- **Expected behavior:** Do not place potentially sensitive work content in navigation URLs.
- **Root-cause hypothesis:** Prompt-prefill convenience took precedence over data minimization.
- **User impact:** Creates an unnecessary privacy exposure surface; no actual disclosure incident was observed.
- **Optimization proposal:** Open a clean provider URL. Offer explicit preview, redaction, and user-initiated copy. Exclude email by default.
- **Expected benefit:** Safer handoff with clearer consent.
- **Effort:** S–M.
- **Dependencies:** Approved external-sharing policy.
- **Risk / invariant check:** Preserve project/job/session/trace attribution without secrets.
- **Validation test:** With synthetic sensitive markers, verify launch URLs contain none; sharing occurs only through the approved explicit action.

### AUD-003 - Changed external-AI content can receive an idempotent-success response without validation

- **Domain:** AI / Output integrity
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** FAIL — source
- **Evidence:** `supabase/functions/datanest-ai-intake/index.ts`, lines 134–148: the existing-event shortcut precedes content hashing; conflict handling occurs later. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/supabase/functions/datanest-ai-intake/index.ts))
- **Observed behavior:** An already-linked session returns its existing event even when a caller submits different nonempty content.
- **Expected behavior:** Same operation/same content returns the original result; changed content returns a conflict or explicit revision flow.
- **Root-cause hypothesis:** Idempotency is keyed to session existence rather than session plus payload identity.
- **User impact:** A correction may appear imported although only the previous content remains.
- **Optimization proposal:** Compare canonical content hashes before every replay-success return; include the original session ID and hash.
- **Expected benefit:** Honest import outcomes and reliable retries.
- **Effort:** M.
- **Dependencies:** Stable content-normalization contract.
- **Risk / invariant check:** Never overwrite original evidence; revisions remain append-only and uncertified.
- **Validation test:** Import A; retry A; submit B under the same session. Expect one event, replay success, then conflict—not success for B.

### AUD-004 - AI context retrieval retains the oldest 100 events rather than recent continuity

- **Domain:** AI / Output quality
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** FAIL — source
- **Evidence:** `datanest-ai-chat/index.ts`, `loadSessionEvents()`, orders ascending and limits to 100; these events feed the governed prompt. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/supabase/functions/datanest-ai-chat/index.ts))
- **Observed behavior:** Later events fall outside the retrieved history once the session exceeds the limit.
- **Expected behavior:** Recent relevant context remains available, with explicit disclosure of omitted history.
- **Root-cause hypothesis:** A display limit was reused as the model-context policy.
- **User impact:** Long sessions may lose recent corrections or decisions. Actual answer degradation was not measured.
- **Optimization proposal:** Retrieve a deterministic recent window, reorder chronologically, and combine with a provenance-linked checkpoint summary and token budget.
- **Expected benefit:** Better continuity with bounded context cost.
- **Effort:** M.
- **Dependencies:** Checkpoint and summarization contracts.
- **Risk / invariant check:** Summaries remain provisional unless separately reviewed.
- **Validation test:** Seed 130 ordered events, with a correction at event 125; verify the next prompt includes that correction and identifies omitted history.

### AUD-005 - Sparks retry requests do not preserve the original user-intent key

- **Domain:** Sparks / Reliability
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** PARTIAL — source
- **Evidence:** `SparksWorkspace.tsx`, `requestRedemption()`, generates `crypto.randomUUID()` inside each submission. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/SparksWorkspace.tsx))
- **Observed behavior:** Resubmitting after an uncertain result generates a different request key.
- **Expected behavior:** Retrying the same intent reuses its key until the outcome is reconciled.
- **Root-cause hypothesis:** Transport attempts and business intents are not distinguished.
- **User impact:** Potential duplicate reservations if a first request committed but its response was lost. Overspend was not demonstrated.
- **Optimization proposal:** Retain an operation ID for the pending intent, query its status after uncertainty, and require a distinct action for a genuinely new request.
- **Expected benefit:** Safer retries and fewer manual reversals.
- **Effort:** M.
- **Dependencies:** Status lookup and server idempotency contract.
- **Risk / invariant check:** Preserve ledger serialization and compensating entries.
- **Validation test:** Drop the response after commit; retry the same intent. Verify exactly one redemption and one corresponding hold pair.

### AUD-006 - Invitation email delivery precedes durable project-invitation registration

- **Domain:** Membership / Reliability
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** PARTIAL — source
- **Evidence:** `send-project-member-invite/index.ts`, lines 147–189, sends the email before calling the registration gateway. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/supabase/functions/send-project-member-invite/index.ts))
- **Observed behavior:** Registration can fail after the external delivery side effect has occurred.
- **Expected behavior:** Delivery and registration have a durable, recoverable operation lifecycle.
- **Root-cause hypothesis:** A multi-system workflow lacks an explicit recovery record.
- **User impact:** Potential sign-in email without the expected membership invitation.
- **Optimization proposal:** Add an idempotent invitation operation/outbox with registration, delivery, retry, and reconciliation states.
- **Expected benefit:** Recoverable invitations and truthful support diagnostics.
- **Effort:** L; schema and delivery orchestration.
- **Dependencies:** Membership migration and email-provider constraints.
- **Risk / invariant check:** Delivery must never activate membership or voting.
- **Validation test:** Fail registration and delivery at each boundary; verify no silent success and deterministic recovery without duplicate active membership.

### AUD-007 - Refresh and queue filtering do not operate on the complete visible data scope

- **Domain:** UI / Workflow / Data loading
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** PARTIAL — source
- **Evidence:** `DataNestApp.tsx`: header Refresh reloads summary/recent jobs/health; scheduler filtering occurs after page retrieval. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/DataNestApp.tsx))
- **Observed behavior:** Refresh is not active-workspace refresh; queue filters only inspect the loaded page.
- **Expected behavior:** Refresh updates the current scope; filters apply before pagination.
- **Root-cause hypothesis:** Data ownership is split between shell state and child workspaces.
- **User impact:** Misleading empty queues and uncertain freshness.
- **Optimization proposal:** Introduce project/view/filter-scoped query contracts, server-side filtering, and explicit “last updated” states.
- **Expected benefit:** More predictable navigation and fewer reloads.
- **Effort:** M.
- **Dependencies:** Shared query-layer conventions.
- **Risk / invariant check:** Cached UI never authorizes actions.
- **Validation test:** Place a matching job outside page one; filtering must find it. Change an active-view record elsewhere; Refresh must update that view.

### AUD-008 - Think Tank thread loads can apply results after selection changes

- **Domain:** Collaboration / Context integrity
- **Severity:** HIGH
- **Confidence:** HIGH for missing guard; MEDIUM for user impact
- **Status:** PARTIAL — source
- **Evidence:** `ThinkTankWorkspace.tsx`, `loadThread()` and selection effects, apply fetched messages/actions/learning without checking the current thread after awaiting. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/ThinkTankWorkspace.tsx))
- **Observed behavior:** No request-generation or current-selection guard is present in this path.
- **Expected behavior:** Only results belonging to the current selection update visible state.
- **Root-cause hypothesis:** Component-local async loading lacks stale-response cancellation.
- **User impact:** Potential wrong-thread display or prompt context during rapid switching; not a proven authorization leak.
- **Optimization proposal:** Key data by project/channel/thread/user; cancel obsolete requests and verify identity before committing results.
- **Expected benefit:** Reliable context switching.
- **Effort:** M.
- **Dependencies:** AUD-007 query conventions.
- **Risk / invariant check:** Keep server authorization independent.
- **Validation test:** Delay thread A, select B, resolve B then A. B’s display and AI prompt must contain no A-only marker.

### AUD-009 - Product Lab summaries do not consistently distinguish current-build evidence from historical samples

- **Domain:** Output quality / Product Lab
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** PARTIAL — source
- **Evidence:** `ProductLab.tsx` loads 150 recent project runs, computes metrics from that array, and resolves `latestRun()` by test-case ID alone. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/ProductLab.tsx))
- **Observed behavior:** Summary scope is bounded; the latest-result selector does not require the current build/test version.
- **Expected behavior:** Current-build acceptance and historical evidence are clearly separated.
- **Root-cause hypothesis:** One recent-run array serves history, metrics, and acceptance display.
- **User impact:** Potentially misleading pass badges or incomplete totals.
- **Optimization proposal:** Query aggregates separately; key current results by surface/build/test/version; label historical windows.
- **Expected benefit:** Defensible release evidence.
- **Effort:** M.
- **Dependencies:** Agreed evidence identity.
- **Risk / invariant check:** Retain all previous results.
- **Validation test:** Add over 150 runs, change the build/version without testing it, and verify the new version shows NOT TESTED with accurate scoped totals.

### AUD-010 - Existing acceptance evidence does not fully exercise critical invariants

- **Domain:** CI / Security assurance
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** PARTIAL — inspected tests
- **Evidence:** Membership/Sparks/governance SQL checks include function-text matching; several browser tests assert boundary wording. The stress isolation check queries for inconsistent rows without attempting unauthorized cross-job access. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/tests/sql/datanest_project_member_invitations_acceptance.sql))
- **Observed behavior:** Structural and smoke checks cover only part of behavioral assurance.
- **Expected behavior:** Protected actions are tested through real lower-privilege paths, including adversarial cases.
- **Root-cause hypothesis:** Fast structural checks have not been complemented sufficiently in the inspected suites.
- **User impact:** False confidence is possible even with green checks.
- **Optimization proposal:** Retain structural guards; add multi-identity functional, concurrency, and failure-injection suites.
- **Expected benefit:** Stronger evidence for governance and integrity claims.
- **Effort:** L.
- **Dependencies:** Isolated fixtures and approved test identities.
- **Risk / invariant check:** Privileged clients may prepare fixtures, not perform the action being validated.
- **Validation test:** Temporarily remove a staging authorization condition; the functional suite must fail even if expected strings remain.

### AUD-011 - Invitation delivery is coupled to the GitHub Pages origin

- **Domain:** Portability / Architecture
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** PARTIAL — source
- **Evidence:** `send-project-member-invite/index.ts` hardcodes the Pages redirect and a fixed origin set. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/supabase/functions/send-project-member-invite/index.ts))
- **Observed behavior:** Invitation destinations do not follow deployment-specific configuration.
- **Expected behavior:** Approved self-hosted and staging deployments use their own configured destinations.
- **Root-cause hypothesis:** Primary-host defaults became implementation constants.
- **User impact:** A self-hosted workflow may send users to the public deployment.
- **Optimization proposal:** Configure trusted app origins and redirect destinations per environment; validate them at startup.
- **Expected benefit:** Safer portability and clearer environment boundaries.
- **Effort:** S–M.
- **Dependencies:** Auth redirect allowlist and deployment configuration.
- **Risk / invariant check:** Never accept arbitrary caller-supplied redirects.
- **Validation test:** Send a controlled staging invitation and verify only its approved staging destination is used.

### AUD-012 - Clipboard auto-capture lacks content-origin discrimination

- **Domain:** Privacy / External AI
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** PARTIAL — source
- **Evidence:** `externalAiClipboard.ts` accepts other nonempty, nonduplicate text; sidebar focus/visibility handlers can capture it when permission is granted. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/lib/externalAiClipboard.ts))
- **Observed behavior:** Clipboard permission is not proof that clipboard content belongs to the active AI session.
- **Expected behavior:** Capture requires explicit workflow consent and preserves user control.
- **Root-cause hypothesis:** Browser permission doubles as application-level auto-fill preference.
- **User impact:** Unrelated clipboard text may replace the return draft. Automatic upload was not observed.
- **Optimization proposal:** Default to manual paste; add session-specific opt-in/off controls; never replace a nonempty draft without confirmation.
- **Expected benefit:** Less accidental sensitive-data handling.
- **Effort:** S–M.
- **Dependencies:** Clipboard UX policy.
- **Risk / invariant check:** Explicit import remains mandatory.
- **Validation test:** Copy unrelated synthetic private text and refocus. It must not replace a draft or be transmitted.

### AUD-013 - Separation between production AI review storage and CI staging remains unverified

- **Domain:** Architecture / Data integrity
- **Severity:** HIGH — verification priority
- **Confidence:** MEDIUM
- **Status:** NOT TESTED — deployed topology
- **Evidence:** AI runtime supports configured staging storage; certification targets a fixed staging project and seeds E2E fixtures. Deployment configuration was unavailable. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/supabase/functions/datanest-ai-intake/index.ts))
- **Observed behavior:** Source establishes both review-storage and test-staging concepts, but not their deployed isolation.
- **Expected behavior:** Production-origin evidence is protected from test fixtures, cleanup, and experimental migrations.
- **Root-cause hypothesis:** “Staging” may refer to both a knowledge-review state and an environment.
- **User impact:** Conditional risk of evidence contamination or availability coupling; no incident proven.
- **Optimization proposal:** Verify the topology first; separate production review storage from disposable CI resources where they overlap.
- **Expected benefit:** Clear ownership and reduced blast radius.
- **Effort:** S to verify; L if separation is required.
- **Dependencies:** Sanitized owner-produced environment map.
- **Risk / invariant check:** Do not bypass review or silently move authority.
- **Validation test:** Demonstrate that CI seeding, cleanup, and migrations cannot access production-origin review evidence.

### AUD-014 - External-AI resizing lacks a keyboard-operated control

- **Domain:** Accessibility
- **Severity:** MEDIUM
- **Confidence:** HIGH for inspected markup
- **Status:** PARTIAL — source
- **Evidence:** `ExternalAiSidebar.tsx`, lines 563–583, implements resizing through a pointer handler on an `aria-hidden` element. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/ExternalAiSidebar.tsx))
- **Observed behavior:** The resize handle itself is not keyboard-operable.
- **Expected behavior:** Equivalent resizing is available without dragging.
- **Root-cause hypothesis:** Pointer interaction was implemented without an accessible alternative.
- **User impact:** Keyboard-only users cannot operate that control.
- **Optimization proposal:** Add a labeled width control or keyboard-operable separator with min/max/current values.
- **Expected benefit:** Better keyboard and assistive-technology usability.
- **Effort:** S.
- **Dependencies:** Responsive layout review.
- **Risk / invariant check:** Keep Return to DataNest reachable.
- **Validation test:** Resize, close, and reopen using keyboard only at 200% zoom; verify focus and import controls remain usable. Formal WCAG conformance remains untested.

## 5. Cross-System Journey Results

**No end-to-end journey was fully executed.**

| Journey | Result | Available evidence / remaining requirement |
|---|---|---|
| J1 — Sign-in/navigation | NOT TESTED | Public shell retrieved; authenticated browser required |
| J2 — Manifest/external AI/checkpoint | NOT TESTED | Source reviewed; AUD-002/003/012 |
| J3 — Scheduling/recovery | NOT TESTED | Runner, capability fixtures, authorized staging tests required |
| J4 — AI/reviewed memory | NOT TESTED | Context source reviewed; AUD-004/013 |
| J5 — Think Tank/review | NOT TESTED | Source reviewed; independent reviewer identities required |
| J6 — Contribution/scoring | NOT TESTED | Sanitized evidence and calculation fixtures required |
| J7 — Sparks lifecycle | NOT TESTED | AUD-005; controlled concurrency test required |
| J8 — Invitation/activation | NOT TESTED | AUD-006/011; controlled email identities required |
| J9 — Proposal/ratification | NOT TESTED | Target-bound UI inspected; full vote chain required |
| J10 — Dispute/resolution | NOT TESTED | Independent identities and source-hash comparison required |
| J11 — Deployment reconciliation | PARTIAL | Public artifacts retrieved; release/DB/function reconciliation unavailable |
| J12 — Failure/retry | NOT TESTED | Fault injection required; prioritize AUD-003/005/006/008 |

**Important testing boundary:** The inspected shell invokes invitation-acceptance RPCs during core loading. A sign-in journey can therefore activate pending invitations; it should not be assumed read-only. Use an account without pending invitations or explicitly authorize that transition. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/src/components/DataNestApp.tsx))

## 6. Target-State UI / UX

**Proposal—not a claim that the current rendered interface has been usability-tested.**

### Simplify primary navigation

| Proposed destination | Contents |
|---|---|
| **Overview** | Current work, blockers, pending reviews, next action |
| **Work** | UNIFI manifests, queue, runs, checkpoints, artifacts |
| **Collaborate** | Think Tanks and Job-linked DataNest AI |
| **Contribute** | Evidence, recognition, progression |
| **Sparks** | Available/locked balances and service requests |
| **Governance** | Protocol, membership, proposals, decisions, disputes |
| **Product Lab** | Versioned experiments and validation |
| **Administration** | Authorized configuration, diagnostics, release evidence |

Keep Audit accessible as a read-only history/search surface; do not hide evidence merely to simplify navigation.

### Interaction changes

- Preserve project, Job, view, and filters in navigable state.
- Separate **Refresh this view** from **Load a newer application release**.
- Warn before discarding an unsaved draft.
- Show the reason an action is unavailable—not just a disabled button.
- Present “Invited,” “Active member,” “Job collaborator,” and “Formal voter” distinctly.
- On narrow screens, use a dedicated companion workspace instead of competing panels.
- Add a persistent context bar: **Project → Job → Session → Trust state**.
- Move implementation details into authorized diagnostics, while retaining user-readable explanations.

## 7. Target-State Architecture

**Proposed direction: retain the existing authorities and strengthen boundaries rather than undertake a platform rewrite.**

```text
Presentation
  └─ Typed domain clients and scoped query state
       ├─ Work / Scheduler
       ├─ Collaboration / AI
       ├─ Membership / Governance
       ├─ Contributions / Sparks
       └─ Product validation / Evidence

Server authorization and command boundaries
  └─ Governed RPCs / Edge Functions
       ├─ Transactions and concurrency control
       ├─ Intent IDs and payload fingerprints
       ├─ Append-only evidence / compensating entries
       └─ Durable external-operation recovery

Data boundaries
  ├─ Production control plane
  ├─ Production-origin review/quarantine evidence
  └─ Isolated CI/test environments

Delivery evidence
  └─ Source SHA → certified artifact → migrations/functions → deployment
```

### Consolidate

- Shared query keys, loading/error/freshness states, pagination, and mutation outcomes.
- A common operation contract: `operation_id`, scope, payload hash, state, result reference.
- Trace-aware output and error envelopes.

### Separate

- Authorization from UI affordances.
- User intent from transport retries.
- Historical evidence from current acceptance state.
- Review status from infrastructure environment.
- Proposed learning from certified knowledge.

### Automate safely

- Release reconciliation.
- Retry-status lookup.
- Missing-link detection between intake and authoritative records.
- Operator reconciliation reports.

Do not automate independent approval, formal voting, certification, or authority changes away.

## 8. Workflow and Automation Optimizations

| Workflow | Proposed optimization | Preserve |
|---|---|---|
| External AI | Preview → clean provider launch → explicit copy → validated return | Attribution and uncertified staging |
| Invitation | Durable intent → registration/delivery states → reconciliation | Matching-account activation |
| Sparks request | One intent key → outcome lookup → safe retry | Serialized append-only accounting |
| Think Tank | Context-bound loading → structured proposals → reviewer queue | Independent confirmation |
| Job execution | One timeline showing queue reason, attempt, checkpoint, artifact | UNKNOWN/no-worker safeguards |
| Review work | Shared “Needs my review” inbox | Separate decision, knowledge, contribution gates |
| Recovery | Resume from authoritative operation/checkpoint IDs | No silent duplicate mutation |

**Success criterion:** Reduce manual copying and navigation without reducing the number or independence of required approvals.

## 9. Output / Result Quality Optimizations

No representative production output corpus was available, so correctness or usefulness scores would be speculative.

### Proposed output contract

```json
{
  "schema_version": "1",
  "artifact_id": "...",
  "project_id": "...",
  "job_id": "...",
  "session_id": "...",
  "trace_id": "...",
  "source_refs": [],
  "content_hash": "...",
  "trust_state": "uncertified",
  "summary": "...",
  "assumptions": [],
  "limitations": [],
  "acceptance_checks": [],
  "next_actions": [],
  "supersedes_id": null
}
```

Validate authorization and authoritative identity server-side; a pasted identifier is not proof of access.

### Output-specific acceptance criteria

| Output | Required quality improvement |
|---|---|
| Job Manifest | Explicit deliverable, constraints, acceptance checks, owner |
| AI answer | Separate recommendation, supporting evidence, uncertainty, actual actions |
| External return | Content-bound replay and explicit correction flow |
| Checkpoint | Completed/remaining work, decisions, artifact versions, resume instruction |
| Think Tank decision | Proposal/reviewer/source links and decision status |
| Contribution score | Inputs, policy version, calculation explanation, anomaly effects |
| Sparks record | Operation ID and hold/release/spend linkage |
| Governance record | Protocol/proposal/decision hashes and vote basis |
| Product Lab result | Exact build and test version; distinguish current from historical |
| Export | IDs and trust states survive copy/export/import |

**Proposed evaluation:** Sample at least five outputs per major type, including a failure and a revision. Score correctness, completeness, clarity, provenance, reproducibility, and next-action usefulness separately. A broken trace link should prevent acceptance even if the prose is strong.

## 10. Security / Privacy / Integrity Hardening

### Immediate priorities

1. Resolve URL-based handoff exposure — **AUD-002**.
2. Make replay identity content-sensitive — **AUD-003**.
3. Preserve retry intent — **AUD-005**.
4. Verify review-store/CI separation — **AUD-013**.
5. Add real authorization tests — **AUD-010**.

### Owner-run verification checklist

Return sanitized results—not credentials—for:

- RLS coverage and policy definitions.
- Direct table privileges and RPC execute grants.
- `SECURITY DEFINER` search paths and ownership.
- Deployed Edge Function JWT/authentication behavior.
- Auth configuration, including leaked-password protection status.
- Cross-project and Job-collaborator isolation.
- Invitation abuse limits and concurrent requests.
- Retention/deletion policies for prompts, intake, and reviewed knowledge.
- Log/export redaction and audit-record tamper resistance.
- Backup restoration and recovery evidence.

Source configuration declares JWT verification for the inspected AI and project-invitation functions; actual deployed configuration was not verified. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/supabase/config.toml))

**Do not interpret missing evidence as a discovered exploit.** No unauthorized access, ledger overspend, secret exposure, or governance bypass was demonstrated.

## 11. Performance / Reliability / Observability

### Measurements

No browser timing, query trace, load profile, or production availability measurement was available. No numerical performance improvement is claimed.

### Proposed initial objectives

These are engineering targets to validate against the operating budget—not measured results or commitments.

| Indicator | Initial target |
|---|---|
| Authenticated workspace readiness | p95 ≤ 3 seconds on an agreed desktop/network profile |
| Ordinary read interaction | p95 ≤ 1 second, excluding AI generation |
| Critical mutation acknowledgement | p95 ≤ 2 seconds, or explicit pending-operation state |
| AI progress feedback | Acknowledge promptly; show phase/status before 2 seconds |
| Trace completeness | 100% of critical mutations linked to actor, scope, operation, result |
| Integrity regression suite | Zero duplicate effects or unauthorized transitions |
| Core service availability | Proposed 99.5% monthly; monitor frontend and control plane separately |

### Fastest likely improvements

- Active-view refresh and scoped invalidation — **AUD-007**.
- Obsolete-request cancellation — **AUD-008**.
- Recent-context/token-window policy — **AUD-004**.
- Separate Product Lab aggregates from historical pages — **AUD-009**.
- Coalesce rapid change notifications rather than refetching an entire workspace repeatedly.
- Define different freshness policies for immutable records and live queue state.

### Diagnostics

Capture operation ID, trace ID, source release, environment, authorized scope, latency, outcome, and retry classification. Avoid prompt bodies, emails, and credentials by default.

Distinguish:

- Static hosting reachability.
- Authentication readiness.
- Database readiness.
- Edge Function readiness.
- Review-store readiness.
- Scheduler/worker readiness.
- Provider readiness.

## 12. CI / Test / Release Improvements

### Highest-value regression tests

| Test | Required assertion |
|---|---|
| Changed-content replay | Same content returns original event; changed content conflicts |
| Lost Sparks response | Retry produces one redemption only |
| Long AI session | Recent correction survives beyond event 100 |
| Thread-switch race | Old response never overwrites current context |
| Invitation partial failure | Durable recovery; no false activation |
| Cross-project access | Unauthorized user cannot read or mutate target resources |
| Governance independence | Self-support alone cannot satisfy independent support |
| Protocol targeting | A newer draft cannot replace the accepted proposal target |
| Sparks concurrency | Concurrent holds cannot exceed spendable balance |
| Evidence preservation | Dispute/revision cannot rewrite challenged source |
| UNKNOWN capability | Execution remains denied |
| Current-build validation | Historical pass does not certify an untested build |

### Test pyramid

1. **Unit:** State machines, hashes, validation, formatting, calculations.
2. **Database functional:** Real role claims, denied operations, transactions, concurrency.
3. **Edge integration:** Authorization, idempotency, external failures.
4. **Browser:** J1–J12 with independent identities and realistic navigation.
5. **Recovery:** Lost responses, stale sessions, restart, restore.
6. **Quality evaluation:** Representative outputs reviewed against acceptance criteria.

The pinned browser configuration defines Desktop Chromium. Add narrow-screen coverage and browser diversity where supported by the product’s users. ([raw.githubusercontent.com](https://raw.githubusercontent.com/DataNest-Supository/DataNest/ac93d51828707d398dfa9c5a471d8a6ed4c9059f/playwright.config.ts))

### Release governance

- Build an immutable candidate once.
- Bind certification evidence to that artifact and its tested database/function set.
- Verify repository protection rules and exact-head promotion externally.
- Apply migrations to isolated staging first.
- Promote only the attested combination.
- Verify the deployed combination independently.
- Retain a known-good frontend/function artifact and compatible database recovery plan.

**Rollback principle:** Prefer backward-compatible schema expansion and forward correction. Never restore an old database snapshot merely to remove a faulty release if doing so would erase subsequent governed records.

## 13. Prioritized Optimization Backlog

Priorities below are implementation recommendations. **No confirmed CRITICAL/BLOCKER production defect was established.**

| Priority | Finding IDs | Optimization | Impact | Effort | Risk | Dependencies | Validation |
|---|---|---|---|---|---|---|---|
| P1 | AUD-002, AUD-012 | Explicit, privacy-preserving handoff/capture | Privacy and trust | M | Low | Sharing policy | No context in URLs; no unsolicited draft replacement |
| P1 | AUD-003 | Content-bound intake replay | Evidence integrity | M | Medium | Hash contract | A/A/B replay test |
| P1 | AUD-004 | Recent context plus traceable summary | AI usefulness | M | Medium | Context budget | 130-event continuity test |
| P1 | AUD-005 | Durable intent IDs for redemption | Retry safety | M | Medium | Status API | Lost-response test |
| P1 | AUD-006 | Recoverable invitation operation | Membership reliability | L | Medium | Migration/delivery design | Boundary failure injection |
| P1 | AUD-008 | Context-keyed async loading | Wrong-context prevention | M | Low–medium | Query conventions | A/B delayed-response test |
| P1 | AUD-010 | Behavioral invariant suite | Assurance | L | Low in isolated testing | Fixtures/identities | Mutated-control tests fail |
| P1 verify | AUD-013 | Prove environment isolation | Integrity risk reduction | S/L | Depends on topology | Sanitized environment map | CI cannot reach production review data |
| P1 | AUD-001 | Deployment attestation | Release trust | M–L | Medium | Inventory and CI evidence | Deliberate digest mismatch rejected |
| P2 | AUD-007 | Scoped refresh and server filtering | Workflow clarity | M | Low | Domain clients | Current-view refresh/filter tests |
| P2 | AUD-009 | Build-specific result views | Output accuracy | M | Low | Evidence identity | Untested build remains NOT TESTED |
| P2 | AUD-011 | Environment-specific redirects | Portability | S–M | Medium | Auth allowlists | Controlled staging invitation |
| P2 | AUD-014 | Keyboard resize alternative | Accessibility | S | Low | Layout review | Keyboard/zoom journey |

**Suggested owners:** Platform/release for AUD-001/013; AI for AUD-002–004/012; membership for AUD-006/011; Sparks for AUD-005; frontend/domain teams for AUD-007–009/014; quality engineering with domain owners for AUD-010.

## 14. 30 / 60 / 90-Day Plan

### Days 1–30 — Establish trust and fix localized integrity issues

- Reconcile deployed source, migrations, and functions.
- Verify environment boundaries before broadening test execution.
- Address AUD-002, AUD-003, AUD-004, and AUD-005.
- Add regression tests alongside each change.
- Add delayed-response protection for Think Tanks.
- Capture sanitized baseline runtime evidence.

**Exit criteria:** High-priority fixes pass controlled tests; production mapping is documented; no unresolved ambiguity about where production-origin AI evidence resides.

**Rollback:** Feature-flag UX changes; retain compatible Edge Function versions; preserve all intake/ledger evidence.

### Days 31–60 — Consolidate workflow state and test real boundaries

- Implement invitation recovery and configured redirects.
- Introduce shared scoped loading, invalidation, and pagination.
- Correct Product Lab evidence scope.
- Execute authorization, governance, ledger, and scheduler suites.
- Complete keyboard/mobile testing.
- Introduce release attestations and operational dashboards.

**Exit criteria:** Core invariants have behavioral evidence; failure states are recoverable; current-build results cannot be confused with history.

**Dependencies:** Days 1–30 environment isolation and reliable fixtures.

### Days 61–90 — Improve usability and operating efficiency

- Pilot simplified navigation with representative users.
- Add structured output/export contracts.
- Measure and tune the agreed performance objectives.
- Reduce redundant queries and unnecessary context transmission.
- Rehearse restoration and rollback.
- Re-run J1–J12 and issue a runtime-backed scorecard.

**Exit criteria:** Every critical journey has reproducible evidence, an owner, and a regression test. Remaining exceptions have explicit acceptance and review dates.

**Rollback:** Deploy domain-by-domain; preserve old navigation temporarily; use additive schema changes and compensating records.

## 15. Assumptions and Unverified Areas

### Assumptions

- The supplied brief defines expected behavior and invariants.
- The supplied commit is the audit baseline, **not a verified current production SHA**.
- Proposed fixes will undergo governed review.
- Production remains read-only without specific authorization.
- A reviewed-knowledge staging state must not be confused with disposable test infrastructure.

### Evidence required to close the audit

Provide **sanitized exports or owner-run test artifacts**, not passwords, cookies, PATs, service-role keys, or database credentials:

1. Live release manifest and deployment attestation.
2. Current source SHA and relevant CI/certification run results.
3. Migration inventory/checksums and deployed function digests.
4. RLS, grants, and security-definer inventory.
5. Auth/configuration review results.
6. Isolated test identities covering owner, admin, operator, viewer, collaborator, invited, disabled, and unrelated users.
7. Explicit staging authorization for the write journeys.
8. Browser screenshots and traces with personal data and credentials removed.
9. Representative manifests, checkpoints, AI answers, reviewed memory, scores, ledger chains, and governance records.
10. Monitoring, backup, restoration, retention, and incident evidence.
11. Complete route/copy inventory for the free-promotion/no-billing check.
12. Scheduler workers, capability observations, and recovery-test results.

**Final assessment:** The available source supports concrete, actionable optimization work, particularly around privacy, evidence identity, context continuity, retries, and test strength. It does **not** establish that the entire live system passes its invariants. The missing authenticated, database, deployment, and output evidence must be collected before this report can become a full production certification.

*Thinking...*

> **Clarifying source limits**
> 
> I need to broaden the source limits to 200 findings per source, ideally with brief entries. I've noticed inconsistency between older pages and new files, which might be due to caching issues. It seems like having a pinned baseline that’s accessible, along with directories via GitHub as an alternative, could help streamline things. This way, I can work towards achieving a more consistent and reliable output!
> 
> **Checking email function**
> 
> I need to inspect the function related to a critical email sent before registration. It’s important to ensure everything was executed correctly. I wonder if there are any potential issues or if there's something off that could affect the registration process. Maybe I should verify the parameters and settings used when sending that email. It’s crucial to get this right for a smooth registration experience! Let's focus on this task carefully.
> 
> **Confirming certification issues**
> 
> I need to confirm the exact issue with certification and check the workflow to ensure there's no waiting on the baseline CI gating. It's important that we clarify that we cannot claim any failures regarding branching settings that are unknown or partially completed. It seems like we're dealing with a stale fetch with unverified data, and that's not acceptable for our regression tests.
> 
> **Troubleshooting bugs**
> 
> I'm considering a strong bug in ProductLab where the latest run seems to ignore the build/version and 150 totals. It might be useful to add a check for stale accepted output. Also, I need to address SQL migrations—it feels like mapping the full directory is tricky, but maybe exploring the pinned tree could lead to a solution. There’s definitely a lot to unpack here, and I’m eager to find a clean fix!
> 
> **Evaluating data context**
> 
> I’m thinking about the potential data context related to a strong bug that involves the oldest 100 events and the latest one about data loss. I also want to incorporate AUD-004, which should be distinct from imports. The code should validate the first 100 events, and I need to consider how to handle the latest ones while marking the current messages as passed independently. I should be cautious about what I omit from the following provisional context.
> 
> **Finalizing map architecture report**
> 
> I need to make sure the citations for the current map architecture are clear and focus on the user's design markers without needing additional references. I’ll use actual code to strengthen the report. User privacy is a top priority, so I won't expose any secrets or key values. I’ll stick to official documentation and the current API without external searches. I want to finish this thoughtfully and deliver it properly!