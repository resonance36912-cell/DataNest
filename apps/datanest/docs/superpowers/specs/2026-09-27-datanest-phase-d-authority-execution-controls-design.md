# DataNest Phase D — Authority and Execution Controls

**Date:** 2026-09-27  
**Repository:** DataNest-Supository/DataNest  
**Design status:** Approved by user on 2026-09-27; conformance implementation planning authorized  
**Phase:** D of the approved DataNest ecosystem architecture programme  
**Implementation status:** Existing narrower Phase D baseline is merged; additional conformance implementation is not authorized until this plan is reviewed and execution is selected

## 1. Purpose

Phase D adds explicit task-scoped execution authority to DataNest without replacing the authority systems already implemented in Phases A-C.

The central problem is that DataNest already knows several important facts independently:

- who the authenticated human is;
- what project role they hold;
- which Jobs exist and their lifecycle state;
- which Job collaborators may access Job-scoped information;
- which capabilities are available, busy, exhausted, offline, disabled, or unknown;
- which provider connections and budgets may be used;
- which data may be processed, reused, learned from, published, exported, or retained;
- which production, certification, audit, and governance controls are already authoritative.

What DataNest does not yet have is a single governed representation answering:

> Is this specific actor allowed to perform this specific operation, for this specific Job and purpose, with this specific capability and data scope, within these limits, until this time, under this accountable human sponsor?

Phase D introduces that missing authority layer.

The intended result is bounded autonomy rather than broad standing machine authority.

## 2. Existing authorities preserved

Phase D is additive.

It must preserve the following existing authorities as independent prerequisites:

- DataNest remains the parent platform and control plane.
- RONSAS remains a governed product under DataNest > Products > RONSAS.
- GitHub remains source, history, CI, and evidence authority.
- Supabase remains authentication, database, storage, and backend-function authority.
- Existing project membership and role helpers remain authoritative.
- Existing RLS remains authoritative.
- Existing Job collaboration and Job file-access boundaries remain authoritative.
- Existing Job lifecycle and transition rules remain authoritative.
- Existing capability health state remains authoritative.
- Existing provider connection, allowlist, budget, and provider authorization remain authoritative.
- Phase C data classification, Trust Manifest, Provider Trust Profile, learning/reuse, publication, and retention policy remain authoritative.
- Certified memory remains the reusable project-memory authority.
- Existing certification, audit, and promotion controls remain authoritative.
- Free-promotion / billing-off remains unchanged.
- Sparks remain internal utility only and do not create ownership, governance, legal, or financial authority.

A positive Phase D decision can never override a denial from any earlier authority layer.

## 3. Intent

Phase D must make execution authority:

- explicit;
- attributable;
- task-scoped;
- purpose-scoped;
- capability-scoped;
- time-bounded;
- resource-bounded;
- consequence-aware;
- revocable;
- auditable;
- fail-closed when unknown;
- inspectable by authorized humans;
- safe for increasing AI and agent autonomy without granting constitutional authority to software.

Phase D should not make routine reads cumbersome.

Governance must remain proportional to consequence.

## 4. Current-state execution model

DataNest already has a useful execution substrate.

The current control-plane schema includes:

- projects;
- tool_registry;
- capabilities;
- jobs;
- job_steps;
- dependencies;
- reservations;
- runs;
- checkpoints;
- artifacts;
- events;
- scheduler_policies.

Current Jobs support statuses including:

- PLANNED;
- READY;
- QUEUED;
- MATCHING;
- RESERVED;
- RUNNING;
- VERIFYING;
- COMPLETED;
- BLOCKED;
- PAUSED;
- RETRY_WAIT;
- FAILED;
- CANCELLED;
- MANUAL_ACTION.

Current capabilities already distinguish operational states such as:

- AVAILABLE;
- BUSY;
- COOLDOWN;
- EXHAUSTED;
- UNKNOWN;
- OFFLINE;
- DISABLED.

Current reservations represent capacity allocation and already include a lease-style expiry through leased_until.

Phase D must not reinterpret those reservations as permission.

Capacity reservation and authority permission are different concepts.

## 5. Core invariant

The core Phase D invariant is:

> Capability availability is not execution authority.

A capability may be healthy and AVAILABLE while execution is denied.

A reservation may exist while execution is denied.

A provider may be approved while execution is denied.

A human may have a project role while a particular high-impact action is not authorized.

Conversely, a valid Authority Envelope does not make an unavailable or unhealthy capability executable.

All execution layers are conjunctive.

## 6. Recommended architecture

Phase D uses an additive Authority Overlay.

The overlay consists of:

1. Authority Envelope;
2. authority approval evidence;
3. Capability Lease;
4. execution decision evidence;
5. autonomy and consequence policy;
6. resource and blast-radius ceilings;
7. circuit breakers;
8. adapters into the existing Job, scheduler, provider, and execution paths.

This design deliberately avoids replacing Jobs, reservations, provider authorization, Phase C trust policy, or RLS.

## 7. Authority resolution order

A significant action should resolve authority in this order:

1. authenticate actor;
2. resolve project identity;
3. resolve Job or governed target identity where applicable;
4. enforce existing RLS/RBAC;
5. enforce Job collaboration/file access where applicable;
6. enforce Phase C data/trust policy;
7. resolve Authority Envelope;
8. resolve consequence class;
9. resolve permitted autonomy level;
10. resolve required approval state;
11. resolve circuit-breaker state;
12. resolve Capability Lease;
13. resolve capability health;
14. resolve existing resource/capacity reservation if required;
15. resolve existing provider/budget/allowlist authorization if applicable;
16. evaluate ceilings and expiry;
17. execute only if every required layer allows;
18. record result and evidence;
19. verify outcome;
20. preserve attributable audit history.

A later allow never cancels an earlier deny.

## 8. Autonomy levels

Phase D formalizes the master architecture autonomy model.

### A0 — Observe

May:

- retrieve already-authorized information;
- inspect state;
- monitor;
- summarize;
- report;
- compare;
- read evidence.

May not:

- mutate governed state;
- send external communications;
- execute external side effects;
- promote;
- delete;
- modify authority.

### A1 — Advise

Includes A0 permissions plus:

- analyze;
- recommend;
- propose;
- score under an approved policy;
- identify risks;
- suggest next actions.

A1 output is advisory.

It cannot itself create an external side effect.

### A2 — Prepare

Includes A1 permissions plus:

- draft actionable work;
- construct execution packages;
- prepare messages;
- prepare deployment plans;
- assemble proposed changes;
- produce approval-ready artifacts.

A2 may create internal draft artifacts where existing authorization permits.

Execution of the prepared side effect still requires the authority appropriate to the consequence class.

### A3 — Execute

May perform bounded execution when:

- the action is within an active Authority Envelope;
- the consequence class permits A3;
- required approvals are present;
- an active Capability Lease exists when a lease is required;
- capability health permits execution;
- circuit breakers permit execution;
- required reservations are valid;
- all Phase C and existing authorization checks permit execution;
- time, operation-count, resource, and blast-radius ceilings remain within bounds.

A3 is intended for reversible or tightly bounded work.

### A4 — High-impact

Covers actions that are materially irreversible or unusually consequential.

Examples include:

- destructive deletion;
- production promotion;
- production configuration changes with broad blast radius;
- externally visible actions with material legal or reputational consequence;
- legal commitments;
- financial commitments;
- ownership or equity actions;
- constitutional/governance changes;
- authority-policy widening;
- secret or credential administration where separately permitted;
- irreversible resource actions.

A4 always requires explicit authorized human approval bound to the exact governed action.

Phase D does not authorize new legal, financial, destructive, production-promotion, or credential-management capabilities merely because A4 exists.

A4 is a classification and control requirement, not a new execution permission.

## 9. Human supremacy and machine restrictions

No AI, agent, application, workflow, model, node, scheduler, or capability may:

- grant itself a project role;
- grant itself a higher autonomy level;
- create an Authority Envelope that expands its own standing authority and then self-approve it;
- approve its own high-impact authority widening;
- extend its own Capability Lease beyond policy;
- remove its own ceilings;
- disable a circuit breaker that applies to itself;
- create legal ownership, equity, royalty, governance, or financial rights by assertion;
- rewrite or delete audit history;
- convert an A4 action into A3 merely by relabeling the action;
- create publication permission from processing permission;
- create learning permission from runtime processing permission;
- bypass RLS, RBAC, Phase C trust policy, Job collaboration, provider authorization, or production promotion gates.

Human authority remains accountable and attributable.

## 10. Consequence classes

Phase D separates autonomy from consequence.

Canonical initial consequence classes are:

- read_only;
- advisory;
- preparatory;
- reversible_write;
- external_communication;
- externally_visible_change;
- resource_execution;
- production_change;
- destructive;
- legal_commitment;
- financial_commitment;
- ownership_or_governance;
- constitutional.

A single tool may support multiple consequence classes.

Therefore tool identity alone is insufficient to determine authority.

The operation being requested must be classified.

## 11. Minimum autonomy mapping

Initial minimums are:

- read_only -> A0;
- advisory -> A1;
- preparatory -> A2;
- reversible_write -> A3;
- external_communication -> A3 unless policy raises it;
- externally_visible_change -> A3 unless policy raises it;
- resource_execution -> A3;
- production_change -> A4;
- destructive -> A4;
- legal_commitment -> A4;
- financial_commitment -> A4;
- ownership_or_governance -> A4;
- constitutional -> A4.

Project policy may require stronger authority.

Project policy may not weaken the platform constitutional floor.

## 12. Authority Envelope

An Authority Envelope is a governed, versioned representation of bounded execution authority.

It is not a credential.

It contains no API keys, passwords, service-role secrets, cookies, private keys, PATs, MFA recovery values, or equivalent secret material.

### 12.1 Required identity fields

An envelope should represent:

- project_id;
- optional product_id;
- optional job_id;
- actor_type;
- actor_reference;
- accountable_human_user_id;
- purpose;
- requested autonomy level;
- maximum granted autonomy level;
- consequence ceiling;
- trace identity;
- status;
- version.

### 12.2 Allowed execution scope

An envelope should be able to constrain:

- allowed capability keys;
- allowed tool keys;
- allowed operation keys;
- allowed target types;
- allowed target references where needed;
- allowed data classes;
- allowed purpose values;
- allowed provider keys where applicable.

These are additional constraints.

They do not replace Phase C or existing provider policy.

### 12.3 Limits

An envelope may define:

- valid_from;
- expires_at;
- maximum operation count;
- maximum concurrent executions;
- maximum external calls;
- maximum retry count;
- maximum runtime duration;
- maximum resource quantity where measurable;
- optional budget ceiling where an existing authoritative unit exists;
- blast-radius limit;
- whether a Capability Lease is required;
- whether independent approval is required;
- evidence requirements.

Phase D must not invent currency, pricing, or financial limits where no authoritative unit exists.

### 12.4 Reversibility

An envelope should record whether the authorized action is:

- read-only;
- reversible;
- compensatable;
- conditionally reversible;
- irreversible.

A4 classification cannot be weakened by claiming reversibility without evidence.

### 12.5 Envelope lifecycle

Canonical states:

- draft;
- proposed;
- approved;
- active;
- paused;
- exhausted;
- expired;
- revoked;
- superseded;
- rejected.

Only active envelopes can authorize execution.

## 13. Authority proposal and approval

Authority changes must be attributable.

Initial roles:

- viewer: inspect allowed authority summaries;
- operator: propose bounded execution authority where existing role permits;
- admin: approve ordinary governed authority where policy permits;
- owner: approve ordinary governed authority and owner-only categories;
- service role: backend enforcement only; not a human approver.

A proposal should record:

- proposer;
- rationale;
- requested autonomy;
- requested consequence ceiling;
- requested scope;
- requested limits;
- evidence reference;
- accountable human sponsor.

Approval should record:

- approver;
- approval state;
- approval time;
- approved scope;
- approved limits;
- conditions;
- evidence reference.

## 14. Independent review

Phase D follows the principle already introduced in Phase C:

- tightening authority is easier than widening it;
- widening high-impact authority requires stronger review;
- an AI/agent cannot approve its own authority widening;
- a human author of a high-impact authority-policy widening should not be the sole independent reviewer when policy marks independent review as required.

This does not force two-person review for every routine action.

Independent review is consequence-sensitive.

## 15. Exact-action approval

A4 actions require approval bound to the exact governed action or execution packet.

The approval identity should include enough information to prevent silent substitution, such as:

- envelope ID/version;
- Job ID;
- operation;
- target;
- consequence class;
- resource ceiling;
- relevant artifact or change identity;
- trace ID;
- expiry.

Changing a material element invalidates the exact-action approval and requires reevaluation.

## 16. Capability Lease

A Capability Lease is a short-lived execution grant.

It answers:

> Under this Authority Envelope, may this actor use this capability for these operations against this governed target until this expiry?

It is distinct from public.reservations.

### 16.1 Lease identity

A lease should represent:

- project_id;
- authority_envelope_id;
- optional job_id;
- capability_id or governed capability key;
- actor reference;
- accountable sponsor;
- allowed operations;
- target scope;
- consequence ceiling;
- issued_at;
- expires_at;
- status;
- trace identity;
- revocation state;
- operation counters.

### 16.2 Lease states

Canonical states:

- proposed;
- active;
- exhausted;
- expired;
- paused;
- revoked;
- superseded;
- cancelled.

Only active, non-expired, non-exhausted leases permit execution.

### 16.3 Lease issuance

Lease issuance requires:

- active Authority Envelope;
- envelope permits the requested capability;
- envelope permits the operation;
- consequence class fits within the envelope;
- required approval exists;
- circuit breaker permits the category;
- capability is not UNKNOWN, OFFLINE, DISABLED, EXHAUSTED, or otherwise disallowed;
- project/Job/data/provider authorization remains valid.

Lease issuance does not reserve capacity unless the execution path separately requires public.reservations.

### 16.4 Renewal

Renewal is not automatic authority escalation.

Renewal may:

- extend time only within the parent envelope;
- replenish permitted counters only where policy explicitly allows;
- never raise autonomy;
- never widen operation scope;
- never widen data scope;
- never raise consequence ceiling;
- never bypass a newly activated circuit breaker or revoked approval.

If broader authority is needed, a new or superseding envelope is required.

### 16.5 Revocation

Revocation is immediate for new execution attempts.

In-flight execution should follow consequence-aware stop semantics:

- safe-to-stop work may halt;
- unsafe-to-interrupt work may transition to controlled completion or MANUAL_ACTION;
- evidence must record the revocation and final state.

Phase D must not claim universal hard-stop safety where underlying capabilities cannot provide it.

## 17. Capacity reservation remains separate

Existing public.reservations remain resource/capacity reservations.

They answer whether a capability instance is reserved for a Job.

Capability Leases answer whether the operation is authorized.

An A3/A4 execution path that requires both must have:

- valid Capability Lease; and
- valid capacity reservation.

Neither substitutes for the other.

## 18. Execution decision record

Every significant Phase D execution attempt should produce a trace-safe decision record.

It should be append-only.

Fields should be sufficient to record:

- trace ID;
- project;
- actor;
- sponsor;
- Job;
- Authority Envelope/version;
- Capability Lease;
- requested operation;
- consequence class;
- requested autonomy;
- granted autonomy;
- capability;
- circuit-breaker state;
- health state;
- Phase C decision reference where applicable;
- provider authorization reference where applicable;
- capacity reservation reference where applicable;
- ceiling state;
- outcome;
- reason code;
- timestamp.

The record must not copy raw sensitive data merely for auditing.

## 19. Execution outcomes

Canonical authority outcomes:

- allow;
- deny;
- review_required;
- paused;
- exhausted.

Reason codes should distinguish at least:

- envelope_missing;
- envelope_inactive;
- envelope_expired;
- autonomy_insufficient;
- consequence_exceeds_envelope;
- approval_missing;
- approval_expired;
- lease_missing;
- lease_expired;
- lease_revoked;
- lease_exhausted;
- operation_not_permitted;
- target_not_permitted;
- capability_not_permitted;
- capability_unhealthy;
- capability_unknown;
- circuit_breaker_paused;
- circuit_breaker_blocked;
- resource_ceiling_exceeded;
- operation_count_exceeded;
- time_ceiling_exceeded;
- upstream_authorization_denied;
- trust_policy_denied;
- provider_authorization_denied;
- reservation_missing;
- policy_conflict;
- manual_action_required.

## 20. Circuit breakers

Phase D introduces project-scoped execution circuit breakers.

Initial categories:

- autonomous_writes;
- external_communications;
- deployments;
- resource_execution.

States:

- enabled;
- paused;
- blocked.

### 20.1 Semantics

enabled:
- category may execute if all other authority layers allow.

paused:
- no new affected leases or executions;
- safe A0/A1 observation/advice remains available;
- existing state and evidence are preserved.

blocked:
- category is explicitly denied until authorized human action changes the state;
- no new affected leases;
- no renewal that would continue affected execution;
- affected queued work moves to a safe waiting state.

Circuit breakers must be attributable and audited.

## 21. Circuit-breaker authority

Initial mutation authority:

- operator may request pause where policy permits;
- admin/owner may pause;
- owner/admin may restore enabled state where policy permits;
- emergency block may be owner/admin and optionally backend safety automation where the trigger is explicitly predefined.

An automated safety process may tighten a breaker.

It may not silently widen a breaker from blocked/paused to enabled.

## 22. Resource and blast-radius ceilings

Phase D supports bounded limits without prematurely implementing the Phase E Resource Fabric.

Initial limits may use only existing measurable units.

Examples:

- operation count;
- concurrent execution count;
- retry count;
- external-call count;
- runtime duration;
- existing provider token/output budget where already authoritative;
- number of targets touched;
- number of files/artifacts changed;
- number of external recipients;
- explicitly measured resource quantity.

Unknown measurement cannot be treated as remaining capacity.

Where a ceiling cannot be measured defensibly, execution must not claim compliance with it.

## 23. Scheduler integration

TranScheduler remains the scheduling authority for capability-aware work.

Phase D adds an authority adapter.

The scheduler should consider:

- Job lifecycle;
- dependencies;
- required capability;
- capability health;
- Authority Envelope;
- autonomy/consequence fit;
- required approval;
- Capability Lease;
- circuit-breaker state;
- capacity reservation;
- ceilings.

The scheduler must not infer authority from:

- capability health alone;
- reservation existence alone;
- Job status alone;
- product ownership alone;
- provider connection alone;
- a previous successful run.

## 24. Job lifecycle integration

Phase D should reuse existing Job statuses.

Examples:

- missing approval may leave a Job READY or move it to MANUAL_ACTION depending on the current flow;
- circuit-breaker pause may move queued work to PAUSED;
- missing lease may prevent RESERVED -> RUNNING;
- lease exhaustion may produce PAUSED, BLOCKED, or MANUAL_ACTION based on consequence;
- revoked authority during RUNNING must preserve run/checkpoint evidence.

Phase D should not replace the existing Job state machine.

## 25. Run integration

A run should be attributable to:

- Job;
- reservation where applicable;
- Authority Envelope;
- Capability Lease;
- execution decision;
- capability/provider route;
- trace ID.

Existing run result/error handling remains authoritative.

Phase D adds authority provenance.

## 26. Provider execution integration

Current provider authorization remains independent.

The intended order for external AI/provider calls is:

1. existing user/Job authorization;
2. Phase C trust/data policy;
3. Phase D Authority Envelope;
4. autonomy/consequence policy;
5. Capability Lease when required;
6. capability/provider health;
7. existing provider/budget/allowlist authorization;
8. execute;
9. evidence.

Phase D cannot create provider permission.

## 27. Data and learning integration

Phase D does not replace Phase C.

Examples:

- an envelope permitting external_provider_processing cannot override local_only;
- an envelope permitting project_learning cannot override learning_eligible=false;
- an envelope permitting publication cannot override publication_authorized=false;
- an envelope permitting future disposition cannot override retention hold or unresolved lineage.

Authority and data permission are separate dimensions.

Both must allow.

## 28. Production promotion

Phase D may classify production promotion as A4 and represent the authority required for it.

Phase D does not itself create or expand a production deployment mechanism.

Existing certification and promotion controls remain authoritative.

An Authority Envelope cannot promote uncertified code or bypass exact-artifact controls.

## 29. External communications

External communications are treated as side effects.

Examples include:

- sending an email;
- posting a message;
- publishing a social update;
- transmitting a file to an external party.

A2 may prepare the communication.

A3 may send only when:

- the envelope permits external communication;
- the target/recipient scope is permitted;
- required approval is present;
- applicable data/publication policy allows;
- a valid lease exists where required.

Material legal/financial/ownership communications may classify as A4.

## 30. Destructive actions

Phase D does not introduce new destructive executors.

If an existing future executor is later governed by Phase D:

- destructive consequence is A4;
- explicit exact-action human approval is required;
- retention holds and lineage checks remain authoritative;
- circuit breakers apply;
- evidence is mandatory.

Phase D v1 design should include the control model without enabling destructive deletion.

## 31. Secrets and credentials

Authority Envelopes and Capability Leases contain references and policy state, not secrets.

Credentials remain in their existing authoritative secret boundary.

Phase D may reference a provider connection or tool identity.

It must not copy:

- API keys;
- service-role keys;
- passwords;
- access tokens;
- cookies;
- private keys;
- MFA recovery secrets;
- signing keys.

## 32. Failure semantics

Unknown authority fails closed for execution.

Failure of Phase D authority evaluation must not silently fall back to broad execution.

Preferred failure behavior:

- preserve Job;
- preserve evidence;
- preserve checkpoints;
- deny or pause the affected side effect;
- continue safe authorized A0/A1 functions where possible;
- return a useful reason;
- require attention where needed.

## 33. Graceful degradation

Examples:

- unhealthy provider -> no new route, safe embedded/local fallback only if earlier policy permits;
- lease expired -> pause affected execution, preserve Job state;
- circuit breaker paused -> no new affected execution, read-only monitoring remains;
- approval missing -> prepare-only state remains available;
- scheduler cannot establish authority -> do not run; preserve queue/evidence.

A subsystem failure should not collapse unrelated DataNest authority or project state.

## 34. Governance and audit

Significant Phase D changes should emit project-scoped audit events.

Event classes should cover:

- AUTHORITY_ENVELOPE_PROPOSED;
- AUTHORITY_ENVELOPE_APPROVED;
- AUTHORITY_ENVELOPE_ACTIVATED;
- AUTHORITY_ENVELOPE_PAUSED;
- AUTHORITY_ENVELOPE_REVOKED;
- AUTHORITY_ENVELOPE_EXPIRED;
- CAPABILITY_LEASE_ISSUED;
- CAPABILITY_LEASE_RENEWED;
- CAPABILITY_LEASE_PAUSED;
- CAPABILITY_LEASE_REVOKED;
- CAPABILITY_LEASE_EXPIRED;
- EXECUTION_AUTHORITY_EVALUATED;
- CIRCUIT_BREAKER_CHANGED;
- AUTHORITY_APPROVAL_RECORDED;
- AUTHORITY_APPROVAL_REVOKED.

Events should carry references and reason codes, not raw sensitive payloads by default.

## 35. Governance UX

Governance should gain an Authority & Execution section.

The UI should show:

- active Authority Envelopes;
- draft/proposed authority;
- autonomy level;
- consequence ceiling;
- accountable human sponsor;
- expiry;
- operation/resource ceilings;
- approval state;
- active Capability Leases;
- lease expiry and remaining counters;
- circuit breakers;
- recent execution decisions;
- why an execution is blocked;
- distinction between authority lease and capacity reservation.

The UI should not expose secrets.

## 36. UX wording

Preferred wording:

- Authority Envelope;
- Accountable sponsor;
- Autonomy level;
- Consequence class;
- Capability Lease;
- Capacity reservation;
- Execution authority;
- Approval required;
- Circuit breaker;
- Paused by policy;
- Lease expired;
- Authority revoked.

Avoid wording that implies:

- AI owns authority;
- a resource reservation is permission;
- an agent can self-authorize;
- an available capability is automatically executable.

## 37. Initial storage model

Implementation planning should evaluate project-scoped tables conceptually equivalent to:

- authority_envelopes;
- authority_approvals;
- capability_leases;
- execution_authority_decisions;
- execution_circuit_breakers.

Exact SQL, RPC signatures, indexes, and migration filenames belong to the implementation plan.

All browser-visible multi-tenant tables require project-scoped RLS.

Anonymous writes remain prohibited.

## 38. Append-only and mutable state

History-bearing records should be append-only or supersession-based where practical.

Mutable operational state may include:

- current breaker state;
- current lease counters;
- current envelope status;
- current pause/revocation state.

Material state changes must retain attributable history through events or versioned records.

Audit evidence must not be silently rewritten.

## 39. Authority precedence

When multiple rules apply, the most restrictive result wins.

Precedence:

1. constitutional/platform prohibitions;
2. existing authentication/RLS/RBAC denial;
3. Job/file/collaboration denial;
4. Phase C data/trust denial;
5. explicit circuit breaker;
6. envelope scope;
7. consequence/autonomy requirement;
8. approval requirement;
9. Capability Lease;
10. health/reservation/provider/budget controls;
11. resource ceilings;
12. execution request.

Conflict or unknown state resolves to deny, review_required, paused, or manual action according to the operation.

It never resolves to broader permission.

## 40. Authority tightening and widening

Tightening examples:

- lower autonomy;
- narrower operations;
- shorter expiry;
- lower ceilings;
- revoke a capability;
- pause execution;
- block a circuit-breaker category.

Widening examples:

- raise autonomy;
- permit additional operation;
- add capability;
- broaden target scope;
- lengthen expiry materially;
- raise consequence ceiling;
- raise ceilings;
- enable a blocked category.

Widening requires governed authority and appropriate review.

Automated systems may tighten within predefined safety policy.

They may not self-widen.

## 41. Time semantics

All authority and lease time boundaries use database/server time.

Client clocks are not authoritative for permission.

Expiry is evaluated at execution time.

A request that starts before expiry but reaches a new material side effect after expiry must reevaluate authority.

## 42. Idempotency

Authority evaluation and lease consumption should support trace-safe idempotency.

Retrying the same execution trace must not accidentally:

- consume counters twice;
- create duplicate approvals;
- issue duplicate leases;
- perform duplicate external side effects;
- widen authority.

Existing operation-specific idempotency remains authoritative.

## 43. Operation counters

Capability Lease counters should distinguish at minimum:

- authorized maximum;
- consumed;
- remaining.

Counter consumption must be atomic for side-effecting execution.

A failed authorization attempt does not consume execution capacity.

A side effect with unknown outcome must not be blindly retried merely because a counter remains.

## 44. Exact evidence identity

For actions whose exact artifact matters, Phase D should bind authority to an evidence identity.

Examples:

- source commit;
- release manifest;
- artifact hash;
- migration set;
- prepared communication hash;
- target list hash;
- governed execution packet ID.

This prevents approving one object and executing a materially different object.

## 45. Scope inheritance

Project policy may supply defaults.

Product policy may tighten project defaults where separately governed.

Job envelopes may tighten parent scope.

Capability Leases may tighten envelope scope.

Children cannot silently widen parents.

Unknown inheritance fails closed.

## 46. Product context

RONSAS and future products may consume Phase D authority controls.

Product context must be explicit when it affects execution.

RONSAS does not own the Authority system.

Authority controls are shared DataNest platform capability.

## 47. Local sovereignty

Phase D should remain compatible with future local-node execution.

A local node would still require:

- authenticated/registered capability identity;
- project authority;
- applicable Phase C trust policy;
- Authority Envelope;
- Capability Lease;
- health state;
- evidence.

Local execution is not authority bypass.

Actual generalized node registration belongs to Phase E.

## 48. Compatibility with existing local/recovery paths

Local development, recovery, and controlled testing remain permitted according to existing policy.

Phase D should distinguish:

- local development action;
- recovery action;
- governed production action.

It must not falsely classify local development as production promotion.

## 49. Security properties

Phase D must preserve or add:

- project-scoped RLS;
- service-role least privilege;
- no anonymous authority writes;
- no secret storage in authority records;
- independent human accountability;
- fail-closed unknown state;
- lease expiry;
- revocation;
- circuit breakers;
- traceable execution decisions;
- atomic limit consumption where side effects occur;
- no self-widening automation.

## 50. Initial rollout model

Phase D should roll out in stages.

### Stage 1 — Representation

Add Authority Envelope, approval, lease, decision, and breaker structures.

No existing execution path becomes blocked merely because the new structures exist.

### Stage 2 — Evaluation adapters

Add report-only evaluation to selected existing execution flows.

Record what Phase D would decide.

Do not widen any existing permission.

Do not block production behavior until coverage is complete for the selected route.

### Stage 3 — Enforced bounded routes

Enable Phase D enforcement only for specific execution paths where:

- every required authority source is represented;
- consequence mapping is reviewed;
- rollback/failure semantics are understood;
- browser/backend tests exist;
- existing safe fallback behavior is preserved.

### Stage 4 — Scheduler integration

Require appropriate envelope/lease checks before selected RESERVED -> RUNNING transitions or equivalent execution boundaries.

### Stage 5 — Broader coverage

Expand only after evidence demonstrates the model is stable.

Phase D does not require all DataNest activity to be migrated in one release.

## 51. Report-only semantics

Report-only Phase D evaluation:

- records the decision;
- records missing authority/lease/approval;
- cannot create permission;
- cannot override existing denial;
- cannot claim an action was fully authorized;
- supports migration without immediate outage.

When a route becomes enforced, missing or contradictory authority fails closed.

## 52. Migration safety

Phase D migrations must:

- add rather than rewrite existing historical migrations;
- preserve existing Jobs;
- preserve reservations;
- preserve runs;
- preserve checkpoints;
- preserve artifacts;
- preserve events;
- preserve Phase C records;
- avoid deleting or rewriting production/staging history;
- avoid creating automatic A3/A4 standing authority for existing actors.

Existing execution history does not become proof of future authority.

## 53. Testing strategy

Implementation must include tests for:

### Authorization precedence

- existing RBAC deny remains deny;
- Job collaboration deny remains deny;
- Phase C deny remains deny;
- provider authorization deny remains deny;
- Phase D allow cannot widen earlier denial.

### Autonomy

- A0 cannot mutate;
- A1 cannot execute side effects;
- A2 can prepare but cannot perform governed side effect;
- A3 requires envelope/lease where configured;
- A4 requires explicit authorized human approval.

### Consequence classification

- production/destructive/legal/financial/ownership/constitutional classes require A4;
- tool name alone cannot lower consequence;
- policy may tighten but not weaken constitutional minimum.

### Envelope

- inactive/expired/revoked envelope denies;
- scope mismatch denies;
- capability mismatch denies;
- operation mismatch denies;
- expiry uses server time;
- child scope cannot widen parent.

### Capability Lease

- missing lease denies enforced leased routes;
- expired lease denies;
- revoked lease denies;
- exhausted lease denies;
- renewal cannot raise autonomy/scope;
- atomic counters prevent overrun;
- lease does not replace capacity reservation.

### Circuit breakers

- paused category stops new affected execution;
- blocked category fails closed;
- safe A0/A1 remains available;
- automated safety may tighten;
- automation cannot self-enable a blocked category.

### Scheduler

- AVAILABLE capability without authority does not run;
- valid reservation without authority does not run;
- valid authority without healthy capability does not run;
- all required layers allow before RUNNING.

### Evidence

- decision records contain references/reason codes;
- no raw sensitive payload is copied into audit by default;
- exact-action approval invalidates on material packet change.

### Compatibility

- Phase C trust policy remains authoritative;
- certified memory behavior unchanged;
- RONSAS placement unchanged;
- Products/Portfolio behavior unchanged;
- billing remains off;
- existing local/recovery behavior remains available;
- no destructive executor introduced.

## 54. Browser acceptance

Governance browser acceptance should prove:

- viewer can inspect permitted authority state but cannot mutate;
- operator can propose within allowed role;
- owner/admin controls match backend authority;
- self-authored high-impact widening cannot be self-approved when independent review is required;
- expired/revoked lease is visibly non-authorizing;
- reservation and Capability Lease are displayed as different concepts;
- paused circuit breaker visibly explains blocked execution;
- report-only state is not shown as enforced authorization;
- planned target-state capabilities are not represented as live.

## 55. Operational acceptance

A first Phase D release succeeds when evidence demonstrates:

1. significant execution can resolve a task-scoped Authority Envelope;
2. autonomy and consequence are represented separately;
3. A4 requires explicit authorized human approval;
4. a machine cannot self-widen authority;
5. Capability Lease is distinct from resource reservation;
6. lease expiry/revocation/exhaustion fails closed;
7. capability AVAILABLE does not imply execution permission;
8. scheduler/executor can require authority before selected execution boundaries;
9. circuit breakers can pause execution categories without collapsing safe reads;
10. existing RLS/RBAC/Job/file access remains authoritative;
11. Phase C trust/data policy remains authoritative;
12. provider/budget authorization remains authoritative;
13. trace-safe execution decisions are recorded;
14. no secrets are stored in envelopes/leases;
15. no destructive execution capability is newly enabled;
16. no legal/financial/ownership authority is created;
17. RONSAS remains a governed DataNest product;
18. billing remains disabled;
19. existing execution history is preserved;
20. rollout can occur incrementally without a disruptive platform rewrite.

## 56. Non-goals

Phase D does not:

- implement the generalized Phase E Resource and Capability Fabric;
- implement general node discovery or sovereign-node scheduling;
- implement ILM-1;
- implement Phase F intelligence routing beyond authority adapters;
- create public growth/challenge surfaces;
- implement Phase H outcomes/shadow economics;
- enable billing;
- create financial or legal authority;
- create ownership/equity/royalty rights;
- introduce unrestricted remote desktop/computer control;
- create a general secrets vault;
- store credentials in leases;
- replace RLS/RBAC;
- replace Phase C trust/data policy;
- replace provider authorization;
- replace Jobs or TranScheduler;
- replace public.reservations;
- enable destructive deletion;
- enable autonomous production promotion;
- infer authority from prior successful execution;
- infer authority from resource availability;
- infer authority from product ownership;
- make RONSAS the authority owner;
- claim Phase E node/resource capabilities are already live.

## 57. Deferred design

Deferred to implementation planning:

- exact table names if repository conventions suggest better names;
- exact migration filenames;
- exact RPC signatures;
- exact indexes;
- exact UI component/file boundaries;
- exact reason-code enum storage mechanism;
- which first execution routes enter report-only/enforced mode;
- exact Job status mapping for paused/manual-action cases;
- exact measured resource units already available in the current runtime.

Deferred to Phase E or later:

- generalized node identity;
- generalized resource pools;
- multi-node placement;
- sovereign node scheduling;
- generalized external-service capability discovery;
- broader Resource Fabric.

## 58. Review focus

Written-spec review should concentrate on:

1. **No authority widening:** Phase D must only narrow/qualify existing permissions.
2. **A4 human control:** high-impact execution cannot become silently autonomous.
3. **Lease vs reservation:** permission and capacity remain separate.
4. **Phase C preservation:** data/trust policy remains independent and authoritative.
5. **Fail-closed behavior:** unknown/expired/revoked/conflicting authority does not execute.
6. **No self-escalation:** automation cannot raise its own autonomy/scope/limits or disable its own safeguards.
7. **Incremental rollout:** report-only then route-specific enforcement avoids platform-wide outage.
8. **Scope discipline:** Phase D does not prematurely implement Phase E/F or destructive/financial/legal capability.
9. **Audit quality:** evidence is attributable without copying raw sensitive data.
10. **Compatibility:** RONSAS hierarchy, billing-off, Job model, reservations, provider controls, and current governance remain intact.

## 59. Review and implementation boundary

This document is the Phase D written design draft derived from the approved conversational architecture.

It does not authorize:

- schema mutation;
- production deployment;
- Capability Lease enforcement;
- A3/A4 autonomous execution;
- destructive actions;
- production promotion;
- legal or financial actions;
- credential changes;
- circuit-breaker rollout;
- scheduler enforcement.

This written Phase D specification has been explicitly approved by the user.

The next required step is review of the additive conformance implementation plan against the current merged Phase D baseline.

Additional implementation begins only after that implementation plan is reviewed and an execution method is selected.
