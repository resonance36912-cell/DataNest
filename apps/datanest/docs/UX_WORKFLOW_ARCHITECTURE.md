# Resonance DataNest UX Workflow Architecture

Updated: 2026-09-27

## Goal

Reduce cognitive load across DataNest without removing specialist workspaces or breaking existing deep links. DataNest AI remains the primary intelligence surface while the rest of the platform follows a visible operating lifecycle.

## Information architecture

### Core
- AI & I — project orientation and current operating signal.
- DataNest AI — governed intelligence core and primary AI collaboration surface.

### Discover
- Stakeholder — capture stakeholder context.
- Sparks — earned contribution utility for approved project services.
- Think Tanks — expand and structure research.

### Govern & Build
- Governance — apply policy and accountability controls.
- Products — inspect governed product architecture and evidence.
- Product Lab — validate product surfaces before release.

### Execute
- UNIFI Planner — turn intent into complete Job Manifests.
- TranScheduler — route work through capability-aware execution.
- Runs — observe execution history and outcomes.

### Verify
- Checkpoints — resume durable work states.
- Audit — inspect traceable operational events.
- Transparency — review published evidence, methodology, and findings.

### System
- Settings — administration, policies, tools, and project configuration.

## Governance and execution authority

Governance has three sibling sections:

- **Sovereign Governance** — protocols, proposals, decisions and disputes.
- **Trust & Data Policy** — visibility/processing, reuse/learning, provider trust and retention policy.
- **Authority & Execution** — canonical Authority Envelopes, approvals, Capability Leases, circuit breakers, route modes and recent execution decisions.

Sovereign Governance remains the default; `?view=governance&section=trust` and `?view=governance&section=authority` are explicit deep links.

TranScheduler also retains an operational **Authority & Execution** mode beside Queue and Gantt. The two surfaces share the same governed backend state: Governance is the policy/review context, while TranScheduler is the execution context.

Authority copy follows these boundaries:

- **Capability Lease != capacity reservation.** Permission and resource allocation are separate.
- **AVAILABLE != authorized.** Capability health never creates execution permission.
- **Report only** means Phase D records the computed decision but does not block the existing route.
- **Enforced** means a canonical non-allow decision blocks that selected route.
- Job readiness may show Authority not evaluated, Report only, Ready for authority check, Approval required, Lease missing/expired, Paused/Blocked by policy, or Authorized.
- **Authorized** is shown only when the latest matching enforced decision is `allow`; it is never derived from capability availability.
- A4 remains exact-action human approval; the UI exposes no generic destructive, legal, financial or ownership executor.
- Authority forms contain policy/evidence references only and never request credentials or secrets.

## Primary user journey

Discover → Govern → Build → Execute → Verify

DataNest AI is cross-cutting rather than a single step. It is visually privileged in navigation and remains accessible from the global shell and AI companion controls.

## Shell behavior

- Existing ?view= deep links remain compatible.
- Navigation groups automatically expand for the active workspace.
- Core remains open so AI & I and DataNest AI are always one click away.
- The page header shows the current lifecycle group.
- Every eligible workspace ends with a workflow-continuity control that offers the previous and suggested next workspace.
- View changes receive a short entrance transition; reduced-motion preferences disable it.
- The command palette continues to index all workspaces using the new lifecycle groups.

## Home behavior

The AI & I home now exposes the five-stage lifecycle:
1. Discover
2. Govern
3. Build
4. Execute
5. Verify

The hero action continues to prioritize DataNest AI.

## UX principles

1. Orientation before options — users see their current phase before secondary controls.
2. AI as a persistent collaborator — DataNest AI is emphasized, not buried under Research.
3. Progressive disclosure — specialist workspaces remain grouped and collapsible.
4. Continuity — each page provides a clear suggested next move without forcing a linear flow.
5. Preserve power-user speed — Ctrl/Cmd + K and direct URL routing remain intact.
6. Respect accessibility — semantic navigation, focus-visible states, and reduced-motion behavior are retained.


## State-aware continuation

The deterministic lifecycle remains the fallback, but the shell can override the next-step recommendation when already-loaded project state provides a stronger operational signal.

- Blocked Jobs route attention toward TranScheduler.
- Running Jobs route attention toward Runs.
- An empty project routes intent through DataNest AI and then UNIFI planning.
- A scheduler with blocked work and no running Jobs can route back to UNIFI for manifest or capability adjustment.
- Missing run or checkpoint evidence can route users back to the workspace that must produce it.

Adaptive recommendations are labeled `STATE-AWARE`; ordinary sequence guidance is labeled `LIFECYCLE`. The rule set is intentionally narrow so recommendations remain explainable and do not replace human judgment.


## Actionable empty states

Operational empty states are treated as workflow junctions rather than blank screens.

- An empty TranScheduler links directly to UNIFI; an empty filter can reset to all Jobs.
- Runs links back to TranScheduler when nothing has been dispatched.
- Checkpoints links back to Runs when no resumable evidence exists.
- Audit links back to Checkpoints when no immutable events are present.

These controls do not create or mutate operational records. They only move the user to the prerequisite workspace that can produce the missing state or evidence.


## Persistent phase orientation

The five lifecycle phases use one shared definition across the AI & I PurposeJourney and specialist workspace shell:

`Discover → Govern → Build → Execute → Verify`

Specialist workspaces show a compact lifecycle phase rail below the workspace breadcrumb. The active phase is highlighted without implying that earlier phases are completed, and users can jump directly to another phase's representative workspace. DataNest AI remains separate from the linear sequence as a cross-phase intelligence core.

Phase mapping:
- Discover: Stakeholder, Sparks, Think Tanks
- Govern: Governance
- Build: Products, Product Lab
- Execute: UNIFI Planner, TranScheduler, Runs
- Verify: Checkpoints, Audit, Transparency

The rail may scroll on compact tablet widths, but at phone width it collapses into a five-column phase grid with AI Core on its own row so every control remains physically inside the viewport.


## Active work context handoff

Selecting a Job inside DataNest AI establishes a browser-local active work context for the current project and user.

The context carries:
- Job identifier and display number
- Job title and status
- Linked DataNest AI session state

The context persists in `sessionStorage`, so it survives workspace navigation and page reloads but is not treated as governed project state. Specialist workspaces surface it in a compact Active Work Context strip with actions to return to DataNest AI, open TranScheduler, or clear the local context.

When users return to DataNest AI, the handed-off Job is preferred over the first accessible Job in the list. Unmounting the AI workspace no longer clears the context; project/user changes and explicit clearing remain the boundaries.

This layer is navigation state only. It does not change Job status, create runs, alter checkpoints, or write audit records.


## Context-focused operational evidence

Active Work Context provides focus inside operational and evidence workspaces without filtering the project record.

When the active Job is present on the current page:
- TranScheduler highlights its queue row and Gantt row.
- Runs highlights execution records belonging to that Job.
- Checkpoints highlights resumable evidence belonging to that Job.
- Audit highlights immutable events belonging to that Job.

Matching records expose an accessible active-context marker and a restrained visual treatment. Non-matching Jobs, runs, checkpoints, and events remain visible and retain their existing order.

This is deliberately a focus layer, not a data filter. A local browser context must never hide project evidence or change scheduling/audit semantics.


## Active-context continuation actions

The Active Work Context strip is actionable, not only descriptive. Its primary action changes with the current workspace while remaining navigation-only:

- Product Lab → Plan active Job in UNIFI
- UNIFI → Schedule active Job
- TranScheduler → Review active Job runs
- Runs → Open active Job checkpoints
- Checkpoints → Trace active Job audit
- Audit → Review transparency evidence
- Other specialist workspaces → Return active Job to DataNest AI

The strip also keeps a secondary Return to DataNest AI action whenever the primary action leads elsewhere.

These actions do not mutate Job state, create execution records, or write governance evidence. They only preserve orientation and reduce navigation search cost around the already-selected Job.


## Page-scoped evidence confidence

Active Work Context shows a small evidence-confidence signal derived only from records currently loaded in the workspace.

Examples:
- UNIFI / TranScheduler: matching Job record visible on this page
- Runs: matching run records visible on this page
- Checkpoints: matching checkpoint records visible on this page
- Audit: matching audit events visible on this page

The signal deliberately uses language such as `On this page` and `not visible`. It does not claim that a Job is complete, verified, absent from the project, or ready for promotion. Pagination and unloaded data remain outside the signal's authority.

This is an orientation aid, not governed state. It performs no writes and must not be used as a substitute for authoritative completion, audit, or governance decisions.


## DataNest AI task-guide action

The DataNest AI START HERE guidance includes a direct **Select Job Manifest** action.

- When an accessible Job selector exists, the action scrolls and focuses that governed Job control.
- Reduced-motion preferences use immediate scrolling rather than smooth animation.
- When no Job selector exists, the action routes to UNIFI Planner so the user can create the missing Job Manifest instead of encountering a dead control.

The action changes navigation/focus only. It does not select a Job automatically, create a Job, or mutate governed state.

## Governance membership invite lifecycle

Governance membership controls are state-aware so invite actions match the project record already visible to the user.

- Entering an email that already belongs to an active project member disables duplicate invitation delivery and explains the existing role.
- Entering an email with a pending invitation changes the primary action to **Resend project invite** and preserves the pending invite's governed role.
- Pending invitation rows expose explicit Resend and Revoke actions while historical rows remain read-only.
- Member and invitation identifiers use compact display forms, while the complete identifier remains available as metadata.
- At mobile widths, membership rows become labeled, self-contained cards rather than forcing horizontal scrolling.

These controls do not change governance eligibility. Formal voting still requires the authenticated account to accept project access and hold active membership.



## Active Job journey rail

Active Work Context includes a compact Job-specific journey rail:

`Plan → Schedule → Run → Checkpoint → Audit`

This rail is intentionally separate from the platform lifecycle rail. The platform rail answers where the user is in DataNest's broader Discover → Govern → Build → Execute → Verify lifecycle; the Job journey rail answers which operational view of the currently selected Job is open.

Only the current Job view receives an active marker. Earlier steps are not marked complete, passed, verified, or done. The rail does not infer progress from Job status, run status, checkpoints, audit events, authority decisions, or resource-capability state.

Every step is directly navigable while preserving the existing browser-local Active Work Context. Navigation performs no governed writes and does not change Job state.

At phone widths the five Job steps remain inside the viewport as an equal-width grid, with the location disclaimer retained: `Location only · not completion state`.


## Active-record anchoring

When Active Work Context has matching evidence loaded in the current workspace, the context strip exposes a **Jump to visible evidence** control.

The control scrolls to and keyboard-focuses the first rendered record marked as belonging to the active Job:
- UNIFI prepared Job Manifest
- TranScheduler queue or Gantt record
- Run record
- Checkpoint
- Audit event

Reduced-motion preferences disable smooth scrolling. If matching data is loaded but the current subview does not render the matching record, DataNest reports that limitation instead of pretending the jump succeeded.

This feature does not filter, reorder, mutate, or select governed records. It only anchors viewport and focus to evidence that is already rendered.


## Scheduler subview resilience

Active Work Context can recover when TranScheduler temporarily hides the active Job because of a local status filter or a non-record subview.

If **Jump to visible evidence** cannot find a rendered active-Job record while the Scheduler still has that Job loaded, DataNest:
1. clears the local Scheduler status filter to `ALL`;
2. returns to the Gantt record view;
3. waits for the record view to render;
4. scrolls to and keyboard-focuses the active Job.

This recovery is view-local only. It does not mutate Job status, execution authority, resource reservations, ILM state, or persisted scheduler policy.

UNIFI evidence is narrower: only prepared Job records (`PLANNED`, `READY`, or `QUEUED`) count as visible evidence there, because completed or otherwise non-prepared Jobs are not rendered in the planning list.


## Active Job pagination resilience

When an active Job is not present on the currently loaded UNIFI or TranScheduler page, Active Work Context exposes **Locate active Job page**.

The locator performs a read-only page scan using the same Job ordering as the operational Job query:
1. priority descending;
2. creation time descending;
3. the existing 20-record page size.

Only Job identifiers and status are read during the scan. Exact Job counts are used when available, but the locator does not depend on them: it can continue until it reaches a short/end page and also detects non-advancing pagination defensively. When the matching Job is found, DataNest moves the local Job pagination to that page and reuses the existing reveal/focus behavior. TranScheduler then restores an unfiltered Gantt view and focuses the active Job.

UNIFI keeps its narrower prepared-state boundary. If the Job exists but is no longer `PLANNED`, `READY`, or `QUEUED`, DataNest reports that fact instead of navigating to a page where the record would still not render.

The locator changes only local pagination and presentation state. It does not update Job status, authority decisions, reservations, ILM state, scheduler policy, or audit evidence.


## Downstream evidence pagination resilience

Active Work Context extends page recovery beyond Job manifests into **Runs, Checkpoints, and Audit**.

When matching active-Job evidence is not on the currently loaded page, DataNest exposes **Locate active evidence page**. The locator performs read-only scans using the exact ordering already used by each workspace:

- Runs: `started_at` descending;
- Checkpoints: `created_at` descending;
- Audit: project-scoped `created_at` descending.

The scan reads only evidence identifiers and `job_id`. Exact counts are an optimization, not a dependency: the locator can continue until a short/end page and stops defensively if pagination does not advance.

When matching evidence is found, DataNest changes only the local workspace page, waits for the matching record to render, then scrolls and keyboard-focuses that record through the shared Active Work Context focus primitive.

This recovery path never changes execution state, checkpoint contents, audit events, Job status, authority decisions, reservations, scheduler policy, or ILM state.


## URL-addressable workspace presentation state

Operational presentation state is encoded in the workspace URL so reload and browser Back/Forward can reproduce the same working view without persisting governed state.

Supported parameters:
- `page`: one-based local page for UNIFI, TranScheduler, Runs, Checkpoints and Audit;
- `mode`: TranScheduler presentation mode (`queue`, `gantt`, `authority`, or `resources`);
- `filter`: TranScheduler status filter;
- `sort`: TranScheduler sort mode (`priority`, `deadline`, or `recent`).

Default values are omitted from the URL to keep deep links compact. Invalid values fall back to safe defaults and are canonicalized on render.

Workspace changes still create browser-history entries through `?view=`. Local presentation changes replace the current entry, which means navigating away and then using Back restores the latest operational page/subview for that workspace without creating noisy history entries for every filter click.

Active Job identifiers, AI session identifiers, authority state and other governed/private context are never written to URL parameters. Active Work Context remains authenticated session state.


## Shareable operational deep links

Workspace URLs are intended to be safe, reproducible presentation links.

When a shared paginated URL points beyond the current dataset **and an exact count is available**, DataNest moves the local workspace to the last available page and canonicalizes the URL rather than leaving the user on an empty stale page. This applies to UNIFI, TranScheduler, Runs, Checkpoints and Audit. If the backend does not return an exact count, DataNest preserves the requested page instead of incorrectly treating the dataset as empty.

Malformed Scheduler `mode`, `filter` and `sort` values fall back to their safe defaults and are removed from the canonical URL.

**Copy view link** is available from workspace actions on desktop and mobile. It copies the canonical current presentation URL while removing release/cache-busting parameters such as `release` and `_reload`.

The copied link contains presentation state only. Active Job identity, DataNest AI session identity, authority state and other authenticated governed context are never added to the URL.

Workspace-specific presentation parameters are scoped to the workspace that owns them. Operational paging/mode/filter/sort state is cleared when users navigate to another workspace, while Governance alone retains its `section` parameter. Invalid Governance section values canonicalize to Sovereign Governance and are removed from the URL. Copying a view link also strips presentation parameters that do not belong to the active workspace, preventing stale cross-workspace state from leaking into shared links.

## Browser-history restoration

Browser Back/Forward restores the presentation state recorded for the history entry being revisited rather than borrowing parameters from the workspace the user is leaving.

History restoration applies workspace scoping before presentation state is read:
- UNIFI, TranScheduler, Runs, Checkpoints and Audit may restore their own `page`;
- only TranScheduler may restore `mode`, `filter` and `sort`;
- only Governance may restore `section`;
- foreign presentation parameters are removed from the restored entry immediately.

Local presentation changes continue to replace the current history entry. Workspace navigation creates a new entry. This allows a user to move from a configured TranScheduler view to a paginated Runs view, navigate elsewhere, and then use Back/Forward to recover each view independently without stale parameter resurrection.

The same workspace-scoping primitive is used for copied view links so browser restoration and link sharing follow one canonical ownership contract.

## Browser-session draft resilience

Authored but unsubmitted work is preserved in browser `sessionStorage` for selected high-value workflows so users can move between workspaces, use browser history, or reload without silently losing text they are still composing.

Current protected draft surfaces:
- UNIFI Job Manifest authoring;
- Sovereign Governance protocol, proposal, dispute and resolution text;
- Think Tank channel descriptions, per-channel thread titles and per-thread message drafts;
- Product Lab surface/test/evidence authoring.

Draft keys are scoped by project and authenticated user. Think Tank thread/message drafts add their current channel or thread identifier so content does not bleed across discussions.

Draft persistence is intentionally browser-session local:
- it is not governed project state;
- it is not written to URLs;
- it is not shared with other users;
- values return to their baseline and the stored entry is removed when a form is successfully submitted or the user manually clears the field;
- closing the browser session may discard the draft.

Credential, password, token and secret fields are excluded from this persistence pattern. Draft storage is a continuity aid only and must not become an alternate store for authoritative project records or sensitive authentication material.

## Long-running mutation resilience

Mutation-heavy workspaces use a shared single-flight boundary at the event-handler layer. The lock is acquired synchronously before the first awaited network operation, so repeated submit/click events in the same browser task cannot intentionally start duplicate mutations.

Current single-flight coverage includes:
- UNIFI Job Manifest creation;
- Product Lab surface, test-case and test-evidence writes;
- Sovereign Governance proposal, vote, ratification and dispute actions;
- Think Tank channel/thread/message authoring and governed AI commands;
- Sparks service/reservation lifecycle actions;
- project membership invitations and revocation;
- Authority & Execution RPC mutations;
- Resource Fabric registration and node-policy mutations.

While a mutation is in flight, its originating workspace exposes a status message and disables conflicting controls. A native `beforeunload` guard is active for full page unloads so refresh/close/navigation that would terminate the JavaScript context requires browser confirmation. Normal internal workspace navigation remains allowed: the request promise continues in the existing app context, and completion/error feedback is written through the parent workspace notice channel where supported.

Retry rules are conservative:
- the single-flight lock is released in `finally`, so a failed request becomes retryable;
- authored draft values remain intact on failure;
- successful draft setters update `sessionStorage` synchronously, so a mutation that finishes after its form workspace unmounts can still clear the submitted draft;
- operations without a server idempotency contract rely on duplicate-start prevention plus authoritative reload/reconciliation;
- operations with an idempotency contract should preserve request identity across an unchanged retry.

Sparks redemption uses a server-enforced request identity. The browser records the intent before the RPC begins, reuses the same request identity for an unchanged retry, and clears it only after authoritative success is confirmed. Changing the selected service, quantity or request note is treated as new intent and clears the prior identity before the next attempt.

The UI does not claim that a client-side timeout or transport failure proves the server mutation failed. Where the result is ambiguous, authoritative server state remains the source of truth.

## Authoritative post-mutation reconciliation

A transport or PostgREST error is not treated as proof that a governed mutation failed. Reconciliation follows a three-state contract:

- **confirmed** — the server can read back the same request identity; the UI clears the pending intent and submitted draft, refreshes authoritative state and reports recovered success;
- **not recorded** — the server can be reached and confirms no record exists for that request identity; the original payload is restored and an unchanged retry is safe;
- **pending / unconfirmed** — the verification read itself cannot establish server truth; conflicting inputs and resubmission remain locked and the user is offered an explicit **Recheck server state** action. Connectivity restoration also triggers a recheck.

The browser-session pending-intent journal uses the `datanest.pendingMutation.*` namespace and records only the mutation kind, client request identity, payload required to restore the form, and start timestamp. It is continuity metadata, not authoritative project state, and it is scoped by project plus authenticated user for the reconciled workflows.

### UNIFI Job Manifest contract

UNIFI Job Manifest creation now uses `create_job_manifest_v2` with a browser-generated `target_request_key`.

The database stores that identity in `jobs.client_request_id` and enforces a unique partial index on `(project_id, client_request_id)`. Reusing the same identity with the same manifest payload returns the existing Job; reusing it with a different payload fails closed. This makes a post-error read by `project_id + client_request_id` deterministic rather than heuristic.

The applied migration is aligned to the authoritative migration histories:
- production: `20260927180402_add_unifi_idempotent_manifest_v2`;
- DataNest AI staging: `20260927180420_add_unifi_idempotent_manifest_v2`.

### Sparks reservation contract

Spark reservation already has the server uniqueness contract `(user_id, request_key)`, and `request_spark_redemption_v1` returns the existing redemption for the same request key and payload. After an error, the UI reconciles directly against `spark_redemptions.request_key`.

An unchanged retry retains the same identity. Editing service, quantity or note is explicit new intent and discards the old pending identity.

### Product Lab test-evidence contract

Product Lab test evidence already carries `product_test_runs.request_id` with a server-enforced unique partial index on `(tester_user_id, request_id)`. Recording a pass/fail/blocked result now journals that identity before the insert and reconciles directly against the test-run table if the insert response is ambiguous.

A confirmed row clears the pending intent and submitted notes/evidence. A confirmed absence restores the original result payload and permits a safe retry with the same request identity. If the verification read itself fails, the relevant test-result controls remain locked until authoritative state can be rechecked.

Editing test notes or evidence after a confirmed absence is treated as new intent and clears the old pending request identity. Product surface creation and test-case creation remain single-flight only because those tables do not yet expose an equivalent client request identity; they must not be promoted to authoritative reconciliation by heuristic matching.

### Global recovery center

The application shell surfaces unresolved deterministic mutations outside their originating workspace. The recovery center is derived only from the active project and authenticated user scopes for:
- UNIFI Job Manifest creation;
- Sparks reservation;
- Product Lab test evidence.

It displays the workflow label, start time, and the fact that the request identity is preserved. It does not expose the stored mutation payload globally. Selecting **Review & reconcile** opens the owning workspace, where the workflow-specific authoritative reconciliation logic runs.

The pending-mutation journal emits a same-tab change event whenever an intent is created or cleared. The shell subscribes to that event plus page-focus/page-show restoration, so an operation that resolves after its form unmounts disappears from the recovery center without requiring a reload.

A global recovery item means the browser session still has unresolved continuity metadata; it is not itself proof that the server mutation failed or succeeded. Replacement work must not be issued until the owning workflow establishes authoritative state.

### Stale recovery lifecycle

Recovery age is an attention signal, never a cleanup signal:
- **recent**: less than 15 minutes old;
- **aging**: 15–60 minutes old;
- **stale**: at least 60 minutes old.

No age threshold deletes a pending intent or converts an unknown server outcome into a failure. Stale items remain visible with their original request identity until authoritative reconciliation resolves them.

Each pending intent also records its latest verification state:
- `unverified`: no deterministic read-back has completed yet;
- `unconfirmed`: reconciliation itself could not establish server truth;
- `confirmed_absent`: the authoritative read completed and found no server record for that request identity.

Only two cleanup paths are permitted:
1. confirmed server success, which clears the pending intent; or
2. explicit new intent after `confirmed_absent`, which clears the old identity before the edited request is created.

Form edits cannot clear an `unverified` or `unconfirmed` intent. This prevents an old ambiguous request from being silently replaced with a new transaction identity.

Pending scopes include both project ID and authenticated user ID. Signing out does not clear unresolved intents: the user is warned that they remain preserved in the current browser session. Another account using the same tab cannot see those recovery items because its shell derives only that account's project/user scopes. If the original account returns during the same browser session, its unresolved items reappear.

### Durable recovery ledger

Deterministic recovery continuity is also persisted in the server-backed `recovery.mutation_recovery_ledger`. The ledger is not mutation authority: it records request identity, bounded request payload, workflow scope, verification state, attempts and final continuity resolution. The actual UNIFI, Sparks and Product Lab domain tables remain the only evidence that a business mutation succeeded.

The recovery table lives in the non-exposed `recovery` schema with RLS enabled. Authenticated clients can only select/insert/update rows owned by their own authenticated user and an active project membership; they have no direct delete privilege. The mutation lifecycle reaches it through four `SECURITY INVOKER` RPCs:
- `register_mutation_recovery_v1`;
- `list_mutation_recoveries_v1`;
- `mark_mutation_recovery_verification_v1`;
- `resolve_mutation_recovery_v1`.

Anonymous execution is revoked. One unresolved recovery is permitted per project/user/workflow scope. The same request identity can be re-registered idempotently, while a different request identity is rejected until the existing recovery is resolved.

Before UNIFI Job creation, Spark reservation or Product Lab test evidence is sent to its authoritative domain write, the request identity must be registered durably. If durable registration is unavailable, that mutation is not sent. This makes continuity persistence fail closed rather than allowing a new device to create untracked ambiguous work.

At workspace startup, the shell lists unresolved recoveries for the active project/user and hydrates them into browser-session continuity before any of the three deterministic mutation workspaces mount. A second tab or device can therefore resume the original request identity without inventing a replacement identity.

Durable finalization precedes local cleanup:
1. authoritative success resolves the ledger as `confirmed`, then local continuity is cleared;
2. authoritative absence first records `confirmed_absent`;
3. unchanged retry keeps the same request identity;
4. choosing **Change manifest**, **Change request** or **Change evidence** resolves the old ledger row as `superseded_after_absence` before edited new intent is allowed.

Resolved ledger rows are retained as history. Registering an identity already finalized on another session returns its resolved state instead of reopening it. This is how multi-device convergence is distinguished from a new transaction.

### Recovery observability

Recovery observability is intentionally read-only. The `get_mutation_recovery_diagnostics_v1` RPC runs as `SECURITY INVOKER`, requires active project membership, and is limited by the same user-scoped RLS as the durable ledger. It returns operational metadata only:
- unresolved identity count;
- age bands (recent, aging, stale);
- verification state counts;
- registration attempt counts and last-attempt timestamps;
- safe-retry count after authoritative absence;
- resolutions completed in the last 24 hours;
- the ten most recent continuity resolutions.

Diagnostics never return stored mutation payloads or full request identities. Request references are shortened to an eight-character suffix for correlation. The Settings surface also reports the browser shell's latest successful ledger synchronization time and any synchronization error.

These signals are observability, not mutation authority. A stale identity, repeated registration attempts, or an unconfirmed state may require attention but never proves that the underlying domain write succeeded or failed. The diagnostics surface therefore exposes only **Sync recovery ledger** and navigation back to the owning recovery flow. It deliberately provides no replay, force-delete, manual-success, or force-resolution control.

### Retry ownership

The application disables library-level PostgREST automatic retries through the Supabase client configuration. Mutation retry/reconciliation therefore remains explicit in DataNest rather than being silently repeated underneath the single-flight layer.

No title matching, timestamp proximity, row-count guessing or other heuristic is accepted as proof of mutation success. A workflow can be promoted to this reconciliation class only when its database contract supplies:
1. a client request identity;
2. server-enforced uniqueness/idempotency for that identity; and
3. an authenticated deterministic read-back path.


## Governance and legal review gate

Public DataNest legal and governance routes use versioned legal metadata and remain review-gated until authorized human/legal review is recorded.

The authoritative review checklist is `docs/governance/legal-review/RESONANCE_DATANEST_LEGAL_REVIEW_CHECKLIST.md`.

- Draft legal documents expose their version and review state.
- Draft documents do not receive a production effective date automatically.
- CI, AI assistance, code review, merge readiness, or deployment readiness do not constitute legal approval.
- Production legal approval requires the document/version, evidence reviewed, review owner, explicit decision, effective date, and traceable approval reference.
- Any substantive legal-copy change after approval becomes a new review candidate.
