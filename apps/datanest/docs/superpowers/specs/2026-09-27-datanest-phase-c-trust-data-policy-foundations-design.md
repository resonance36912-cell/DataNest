# DataNest Phase C — Trust and Data Policy Foundations

**Date:** 2026-09-27  
**Repository:** DataNest-Supository/DataNest  
**Branch:** `design/datanest-phase-c-trust-data-policy-20260927`  
**Design status:** Approved by user on 2026-09-27; implementation plan required before implementation  
**Parent authority:** `docs/superpowers/specs/2026-09-27-datanest-ecosystem-business-operating-architecture-design.md`  
**Phase dependency:** Phase A and Phase B source implementation merged to `main`  
**Scope:** data classification, reuse/learning policy, provider trust, Trust Manifests, policy-driven retention, lineage-aware retention evidence, and compatibility with existing RLS/RBAC and DataNest AI file-access controls

## 1. Purpose

Phase C converts the approved trust and data-governance principles in the DataNest master architecture into a coherent implementable design without weakening existing security or silently deleting existing information.

The phase establishes two independent policy dimensions for governed information:

1. **visibility / processing boundary** — where data may be processed and who may receive it;
2. **reuse / learning state** — whether data may be reused beyond the immediate task, promoted into certified memory, or published.

It also defines:

- a **Provider Trust Profile** for external AI, storage, execution, and service providers;
- a versioned **Trust Manifest** for a Nest, project, or product;
- policy-driven **retention decisions** derived from classification, purpose, governance, and applicable obligations;
- lineage-aware retention evidence and tombstones without requiring raw content to be kept indefinitely;
- fail-closed policy evaluation that never turns unknown state into permission.

Phase C is deliberately additive. It must preserve current project membership controls, RLS, governed memory certification, DataNest AI file-access authorization, product governance, audit history, billing-off state, and the Phase B Portfolio Registry.

## 2. Existing authority and safeguards preserved

Phase C extends, but does not replace, the following implemented controls:

- DataNest remains the parent platform and control plane.
- RONSAS remains a governed product under `DataNest > Products > RONSAS`.
- GitHub remains source/history/CI/evidence authority.
- Supabase remains authentication, application data, storage, and backend-function authority.
- Existing project RLS/RBAC remains authoritative for whether a caller may access a project or Job.
- `authorize_datanest_ai_file_access(...)` remains an independent prerequisite for Job-file access. A favorable Phase C policy decision can never bypass or widen that authorization.
- Certified memory remains the only project-wide reusable DataNest AI memory unless a later phase explicitly adds another governed path.
- Existing `learning_eligible=false` boundaries, including Legal Eagle, are a hard denial floor. Phase C must not silently convert excluded content into learning-eligible content.
- Production DataNest AI remains distinct from raw staging evidence.
- Publication remains explicit and governed.
- Anonymous control-plane writes remain prohibited.
- Current free-promotion / billing-off state remains unchanged.
- Cloud-Nest, Supository, ILM, Resource Fabric, Outcome Ledger, and later programme concepts remain target-state concepts unless separately implemented and evidenced.

## 3. Design principles

1. **Authorization before policy:** data policy never grants access that RLS, RBAC, Job access, product boundaries, or other authorization has denied.
2. **Processing is not reuse:** permission to process data for one Job or service does not grant permission to reuse, learn from, publish, or send it elsewhere.
3. **Visibility and learning are independent:** a record may be private but learning-eligible within its project, or public but not eligible for model learning.
4. **Unknown fails closed:** missing or contradictory policy is not execution permission, provider-routing permission, learning permission, or publication permission.
5. **Tightening is easier than widening:** making data more restrictive may be performed with lower authority than declassification, broader reuse, or publication.
6. **Existing explicit denials survive inheritance:** child or provider policy cannot override a hard exclusion such as `learning_eligible=false`.
7. **History is attributable:** policy changes create versioned records or events; they do not silently rewrite prior decisions.
8. **Retention is policy-driven:** retention follows classification, declared purpose, governance, legal/contractual obligations, lineage, and audit requirements.
9. **Retention does not mean raw permanence:** audit/provenance evidence can survive legitimate raw-content minimization or removal.
10. **Phase C starts non-destructively:** no automated deletion of existing records is authorized by this design.
11. **External providers are conditional resources:** capability alone is insufficient; provider trust policy must allow the relevant data class and purpose.
12. **Public claims require implemented evidence:** a Trust Manifest may describe current verified controls but must not market target-state controls as live.
13. **Portability remains a first-class goal:** policy metadata must support export and provenance without creating false DataNest ownership over externally authoritative objects.

## 4. Canonical policy dimensions

### 4.1 Visibility / processing boundary

The controlled values are:

- `public`
- `nest_private`
- `project_restricted`
- `organization_restricted`
- `high_sensitivity`
- `local_only`

These values describe where content may be processed and the maximum audience boundary. They do not describe whether content may be used for learning.

Interpretation:

**public**  
Explicitly approved for public visibility or public processing. Public classification must be attributable to a governed publication decision or another explicit source of public authority.

**nest_private**  
Limited to the applicable private Nest context and authorized users/processes within that boundary.

**project_restricted**  
Limited to authorized participants and permitted services in the applicable DataNest project.

**organization_restricted**  
Limited to an authorized organization boundary and explicitly permitted project/product processing.

**high_sensitivity**  
Requires elevated restrictions. External routing is denied unless an approved Provider Trust Profile explicitly permits the data class, purpose, region/locality, and protection requirements.

**local_only**  
May only be processed on explicitly authorized local resources. Hosted/external providers are denied regardless of model capability.

A missing classification is not silently coerced to `public` or `project_restricted`. Until resolved, routing and reuse behave at least as restrictively as `high_sensitivity`: no external provider routing, no platform learning, and no publication.

### 4.2 Reuse / learning state

The controlled values are:

- `runtime_only`
- `session_context`
- `project_learning_eligible`
- `project_certified_memory`
- `platform_learning_eligible`
- `datanest_certified_knowledge`
- `publicly_reusable`

Interpretation:

**runtime_only**  
May be used only to perform the immediate authorized operation. It does not become reusable context merely because processing succeeded.

**session_context**  
May be reused only within the current authorized Job/session boundary.

**project_learning_eligible**  
May be considered as evidence for a governed project-learning pipeline. It is not reusable project-wide memory until independently reviewed and certified.

**project_certified_memory**  
Approved reusable project memory under the existing certified-memory authority and provenance rules.

**platform_learning_eligible**  
May be considered for a separately governed DataNest-wide learning/certification process. Eligibility is not certification.

**datanest_certified_knowledge**  
Approved reusable DataNest knowledge with required provenance, review, policy version, and supersession history.

**publicly_reusable**  
Explicitly approved for public reuse under the applicable publication/licensing/rights policy. Public visibility alone does not automatically create this state.

No state automatically advances because content was popular, repeatedly used, produced by an AI, stored for a long time, or appeared in a public repository.

## 5. Policy precedence and inheritance

Policy evaluation is deny-preserving.

The effective decision is derived from:

1. hard platform prohibitions;
2. explicit record/object exclusions;
3. source/product mode exclusions;
4. applicable legal or contractual hold/restriction;
5. project/product/Nest policy;
6. provider trust restrictions;
7. requested purpose and operation;
8. the most restrictive unresolved or conflicting state.

Important rules:

- A child object may tighten its visibility or reuse state without widening the parent.
- Widening visibility, learning, provider routing, or publication requires explicit governed authority.
- `learning_eligible=false` remains a hard exclusion regardless of a broader parent policy.
- Data access granted through RLS/RBAC is necessary but not sufficient for external routing or reuse.
- Data policy cannot create project membership, Job collaboration rights, product ownership, governance authority, or publication authority by inference.
- Provider profiles may narrow allowed processing; they never expand a caller's underlying authorization.
- Conflicting active policies fail closed and create a review condition.

## 6. Purpose as a first-class input

Policy decisions are purpose-bound.

Target purpose values should include at least:

- `job_execution`
- `user_requested_analysis`
- `certification_review`
- `project_learning`
- `platform_learning`
- `product_operation`
- `external_provider_processing`
- `publication`
- `audit`
- `security_investigation`
- `export`
- `retention_management`

The same data may be allowed for one purpose and denied for another.

Example: a project-restricted file may be permitted for an authorized Job but denied for platform learning or an external provider.

Purpose is not inferred from provider identity. The caller or governed operation supplies a declared purpose, which is checked against current authority and policy.

## 7. Provider Trust Profile

### 7.1 Purpose

A Provider Trust Profile describes whether an external or replaceable provider is permitted to receive specific classes of DataNest data for specific purposes.

It is a policy and evidence object, not a credential vault.

### 7.2 Target fields

A profile should capture:

- provider identity and stable provider key;
- provider category such as AI/model, storage, execution, search, communications, or other external service;
- status: `draft`, `active`, `restricted`, `suspended`, `retired`;
- accountable owner;
- allowed visibility/processing classes;
- allowed purposes;
- prohibited purposes;
- allowed geographic/processing regions when known;
- declared provider retention posture;
- declared training/reuse posture;
- security posture/evidence references;
- contractual state/evidence reference where applicable;
- supported data-locality guarantees;
- credential boundary description without secret material;
- health and review state;
- policy version;
- effective date;
- review/expiry date;
- supersession reference;
- known limitations;
- created/approved actor and timestamps.

### 7.3 Routing effect

Before sending governed content to an external provider, DataNest must satisfy both:

1. ordinary authorization and Job/product policy; and
2. an active Provider Trust Profile allowing the data class and purpose.

Provider capability does not override trust policy.

If the profile is absent, expired, suspended, contradictory, or does not explicitly allow the requested class/purpose, external routing fails closed.

`local_only` content never routes to an external provider.

### 7.4 Provider statements are not self-certifying

Provider policy claims, contracts, security pages, or model-training statements are evidence inputs. DataNest records their source and review date rather than treating them as timeless facts.

## 8. Trust Manifest

### 8.1 Purpose

A Trust Manifest is a versioned summary of the current implemented trust posture for a governed scope.

Initial supported scopes:

- project;
- product;
- organization/Nest only when an implemented canonical identity for that scope exists.

A Trust Manifest does not itself grant data access or execution authority. It summarizes applicable, implemented controls.

### 8.2 Target contents

A manifest should include:

- scope identity and scope type;
- accountable owner;
- manifest version and policy version;
- default visibility/processing classification;
- default reuse/learning state;
- explicit exceptions or exclusions;
- applicable retention-policy identity;
- allowed provider profiles or provider-policy set;
- publication policy;
- export/portability policy;
- certified-memory policy;
- audit/provenance expectations;
- known external authorities;
- current evidence status;
- known limitations and unsupported target-state capabilities;
- effective date and review/expiry date;
- approver identity and approval trace;
- superseded-manifest reference.

### 8.3 Evidence standard

A Trust Manifest may state only controls that exist and can be evidenced.

It must distinguish:

- implemented and verified;
- implemented but partially evidenced;
- planned / target state;
- unknown.

Cloud-Nest, Supository, ILM, Resource Fabric, or other target-state concepts must not appear as live trust guarantees before their corresponding implementation evidence exists.

### 8.4 Publication

An internal Trust Manifest may exist before any public trust page.

Public publication is a separate governed decision and must exclude secrets, internal attack-surface detail, protected personal data, reusable credentials, and other restricted content.

## 9. Retention policy

### 9.1 Policy basis

Retention is determined from:

- visibility/processing classification;
- reuse/learning state;
- declared purpose;
- source/object category;
- project/product policy;
- audit/certification/provenance requirements;
- legal or contractual holds/restrictions;
- lineage and downstream dependencies;
- applicable provider obligations;
- explicit user/organization policy where authoritative.

A single blanket retention period is not appropriate for all data.

Phase C must not invent statutory, contractual, or sector-specific retention durations. Where no authoritative duration is established, the policy records a review cadence or `review_due` state and preserves existing content until an authorized policy supplies a defensible disposition rule.

### 9.2 Retention policy object

A retention policy should be versioned and include:

- policy identity and scope;
- applicable data classes;
- applicable source/object categories;
- default retention duration or review cadence;
- disposition intent;
- minimum evidence to preserve;
- legal/contractual hold behavior;
- lineage-review requirements;
- approver;
- effective version;
- supersession history.

Potential disposition intents include:

- `retain`
- `review_due`
- `archive`
- `minimize`
- `delete_when_authorized`
- `legal_hold`

These describe policy intent. They do not authorize destructive action by themselves.

### 9.3 Phase C non-destructive rule

Initial Phase C implementation must not automatically delete or anonymize existing production or staging records.

Instead it may:

- compute effective retention policy;
- record `review_due` state;
- generate governed retention review work;
- create archival/minimization proposals;
- preserve policy version and reasoning;
- block deletion while legal/contractual/audit/lineage holds remain;
- create a future deletion/minimization action only through a separately reviewed destructive-data implementation plan.

### 9.4 Existing DataNest AI staging evidence

The 27 September retention supersession remains authoritative:

- old blanket indefinite-retention language is historical;
- existing data is not deleted merely because policy changed;
- current raw evidence remains unchanged until a separately authorized retention-enforcement migration exists;
- new Phase C metadata may classify or bind policy to existing evidence without rewriting its historical content.

## 10. Audit evidence, minimization, and tombstones

Phase C separates raw content retention from audit/provenance retention.

If a future authorized workflow minimizes or removes raw content, DataNest should be capable of retaining a governed tombstone containing only what is necessary to preserve attributable history, such as:

- trace identity;
- original object identity/reference;
- project/product/Job context;
- content hash or provenance digest when appropriate;
- source authority;
- policy version;
- authorized disposition;
- actor/approver;
- time of action;
- lineage impact result;
- verification evidence;
- reason/hold resolution.

A tombstone is not a substitute for content when the content itself must legally or operationally be retained.

## 11. Lineage-aware retention

Deletion, restriction, or withdrawal of a source can affect:

- certified memory;
- derived summaries;
- public artifacts;
- training/evaluation datasets;
- product records;
- audit evidence;
- exported or externally authoritative references.

Phase C must therefore model enough lineage/provenance to answer:

- what derived objects depend on this source;
- which objects are certified or publicly reusable;
- whether any object must be recertified, restricted, superseded, or reviewed;
- whether removal is blocked by an active hold.

Phase C does **not** implement the full Supository target-state fabric. It establishes only the policy/provenance links required for trust and retention decisions, using existing trace/source references where possible.

## 12. Compatibility with governed memory

The existing DataNest AI governed-memory model remains intact.

Required mappings:

- uncertified current-session evidence aligns to `session_context` unless an explicit harder exclusion requires `runtime_only`;
- a learning candidate requires `project_learning_eligible` or an existing explicitly equivalent authorization;
- `certified_memory` corresponds to `project_certified_memory`;
- platform-wide learning requires a later governed promotion path and must not be inferred from project certification;
- Legal Eagle and other `learning_eligible=false` modes remain excluded from automatic trend extraction and project/platform learning;
- certified-memory supersession remains append-only and attributable;
- raw staging evidence does not become production memory directly.

The implementation plan must prefer adapters/mappings over duplicating the certified-memory system.

## 13. Compatibility with file access and authorization

Phase C adds policy checks after existing access authority, never before or instead of it.

For Job file access:

1. the caller passes existing project/Job authorization;
2. the file/object policy permits the requested purpose;
3. provider trust is checked if external processing is requested;
4. reuse/learning policy is checked separately from processing;
5. the decision and policy version are traceable.

A positive policy result without Job authorization must still fail.

## 14. Data policy decision record

Significant policy-sensitive operations should produce a compact decision record or audit event containing:

- trace ID;
- actor;
- scope;
- subject/object reference;
- purpose;
- requested operation;
- effective visibility class;
- effective reuse state;
- policy/manifest versions consulted;
- provider profile if relevant;
- outcome: allow/deny/review-required;
- denial/review reason code;
- timestamp.

Decision records should avoid copying sensitive raw content into the audit log.

## 15. Governance and authority

Suggested authority model for the initial release:

**Viewer/stakeholder**
- read permitted trust summaries for scopes they are authorized to access.

**Operator**
- propose data-classification or reuse-state changes;
- attach evidence;
- propose provider-profile evidence updates;
- request retention review;
- tighten a record to a more restrictive state where current authority permits.

**Owner/admin**
- approve or reject classifications that broaden access/reuse;
- activate/suspend Provider Trust Profiles;
- approve Trust Manifest versions;
- approve publication eligibility;
- approve retention-policy versions;
- approve hold/release decisions where authorized.

**Service role**
- backend-only execution consistent with existing policy and least privilege.

No actor may approve their own high-impact declassification/publication change where existing governance requires independent review.

Phase C does not introduce legal ownership, financial authority, or constitutional authority.

## 16. Target governed operations

Exact signatures belong in the implementation plan, but the design anticipates operations equivalent to:

- propose/approve/reject data policy classification;
- activate/supersede Trust Manifest;
- create/update/activate/suspend Provider Trust Profile;
- propose/approve retention policy;
- request retention review;
- place/release a retention hold;
- evaluate policy for a declared purpose;
- record a governed policy decision.

No Phase C v1 RPC should perform destructive deletion of existing historical content.

## 17. Migration strategy

### Stage 1 — policy structures only

- add versioned trust/policy structures;
- add append-only change history;
- preserve existing RLS/RBAC;
- preserve current DataNest AI behavior;
- no destructive changes.

### Stage 2 — compatibility mappings

Introduce explicit adapters for existing authoritative states, including:

- certified memory;
- existing learning exclusions;
- Job file authorization;
- public Transparency artifacts where publication authority is explicit;
- current product/project scope.

Do not infer public or learning state from file paths, repository visibility, URLs, historical names, or product placement alone.

### Stage 3 — decision enforcement

Insert policy evaluation into selected external-provider and learning/reuse paths.

Enforcement must not be activated for a live route until every currently routed provider and in-scope data source on that route has explicit reviewed policy coverage. Existing allowlists, budgets, connection records, repository visibility, or historical behavior are evidence inputs only; they do not silently become trust approval. The implementation may stage policy evaluation in report-only mode while coverage is completed, but report-only mode must never authorize a route that the existing system would deny.

Once enforcement is activated for a route, any enforcement change must retain current functionality for cases already explicitly permitted by the reviewed policy while failing closed for absent, expired, suspended, unknown, or contradictory policy state.

### Stage 4 — retention review workflow

Compute retention review state and evidence.

Existing records are not automatically deleted, anonymized, or migrated. Destructive enforcement remains a separate future reviewed plan.

## 18. User experience

Phase C should add trust context without overwhelming routine work.

Target surfaces may include:

### Governance / Trust area

- active Trust Manifest;
- policy version;
- provider trust status;
- retention policy status;
- pending reviews;
- known limitations.

### Data/object context

Where useful and authorized, show compact badges for:

- visibility boundary;
- reuse/learning state;
- retention review state.

### Provider routing explanation

When an external route is denied or unavailable, the interface should state the policy reason at a useful level, for example:

- local-only data;
- provider not approved for this purpose;
- provider profile expired;
- learning excluded by product mode;
- classification unresolved.

The UI must not expose secret policy internals or provider credentials.

### Public trust surfaces

No new public trust claim is required in the initial release. Public presentation belongs after the corresponding internal controls and evidence are verified.

## 19. Error handling and fail-closed rules

Required behavior includes:

- missing classification -> no public publication, no platform learning, no unapproved external routing;
- contradictory active policy -> `review_required`;
- `local_only` + external provider -> deny;
- expired/suspended provider profile -> deny external routing;
- unsupported purpose -> deny;
- `learning_eligible=false` -> no project/platform learning even if parent policy is broader;
- project membership denied -> policy evaluation cannot override;
- Job file access denied -> policy evaluation cannot override;
- retention hold active -> destructive disposition blocked;
- lineage unresolved -> destructive disposition blocked;
- public visibility without explicit publication authority -> no publication;
- provider training/reuse posture unknown for restricted content -> fail closed for affected processing;
- Trust Manifest containing unevidenced target-state claim -> reject activation/publication.

## 20. Testing strategy

Implementation planning must include tests for at least the following.

### Policy model

- every controlled visibility class;
- every reuse/learning state;
- independent processing and learning decisions;
- explicit denial precedence;
- policy inheritance and tightening;
- widening requires authority;
- contradictory policy fails closed.

### Authorization compatibility

- RLS denial remains denial;
- Job file-access denial remains denial;
- data policy cannot create membership or collaboration rights;
- anonymous mutation remains denied.

### Provider trust

- allowed class + allowed purpose + active profile permits routing when ordinary authorization already passes;
- absent profile denies;
- suspended/expired profile denies;
- local-only denies;
- high-sensitivity requires explicit permitted posture;
- profile changes are versioned and attributable.

### Governed memory

- session context remains non-certified;
- project-learning eligibility does not equal certified memory;
- certified memory remains separately reviewed;
- Legal Eagle learning exclusion remains hard;
- no automatic project-to-platform learning promotion.

### Trust Manifest

- versioned approval;
- no self-approval where independent review applies;
- implemented/partial/planned/unknown evidence states;
- target-state capability cannot be represented as live without evidence.

### Retention

- policy calculation is deterministic and versioned;
- active hold blocks destructive action;
- existing content is not deleted by migration;
- retention review may be generated without mutation of historical content;
- lineage uncertainty blocks deletion;
- tombstone format does not include raw sensitive content by default.

### Regression

- Phase B Portfolio Registry remains functional;
- RONSAS remains under Products;
- billing remains off;
- DataNest AI certification remains green;
- current file-access gateway remains enforced;
- existing product URLs and public Transparency behavior remain compatible.

## 21. Observability and audit

Material Phase C actions should emit ordinary DataNest audit evidence for:

- policy proposal/approval/rejection;
- Trust Manifest activation/supersession;
- Provider Trust Profile activation/suspension/expiry review;
- classification/reuse-state change;
- retention-policy activation;
- retention hold placed/released;
- policy evaluation denials requiring operator attention;
- retention review created/completed.

Audit entries must reference policy/version and trace identity without copying unnecessary raw content.

## 22. Security requirements

- no provider secrets stored in Provider Trust Profiles;
- no reusable passwords, cookies, PATs, API keys, MFA recovery material, or service-role credentials published in manifests;
- private helper functions remain inaccessible to browser clients unless explicitly exposed through governed RPCs;
- external provider decisions happen server-side where credentials or protected policy material are involved;
- all new multi-tenant tables use project/scope isolation appropriate to their authority;
- foreign keys and policy lookup keys are indexed;
- authenticated browser clients receive only the minimum read/write grants required;
- significant policy mutations use governed operations rather than direct table writes.

## 23. Non-goals

Phase C does not:

- implement Authority Envelope or Capability Leases from Phase D;
- implement generalized Resource Fabric or sovereign-node scheduling from Phase E;
- implement ILM-1 or provider-routing optimization from Phase F beyond the trust checks required for current external processing;
- build public Challenges, public project discovery, or broader stakeholder acquisition surfaces from Phase G;
- implement Verified Outcome, Outcome Ledger, Shadow Economics, or Metric Manifest from Phase H;
- enable billing;
- delete or anonymize existing production/staging content automatically;
- replace RLS/RBAC;
- replace the current certified-memory pipeline;
- implement full Supository;
- claim Cloud-Nest is already a live workspace product;
- store external-provider credentials in policy records;
- create legal ownership, equity, royalties, or financial rights;
- infer public status from a public URL or repository;
- infer learning consent from ordinary processing permission;
- train or fine-tune model weights.

## 24. Initial-release acceptance criteria

The first Phase C release succeeds when evidence demonstrates that:

1. visibility/processing and reuse/learning are represented as separate governed dimensions;
2. unresolved policy fails closed without breaking already-authorized safe local behavior;
3. existing RLS/RBAC and Job file-access boundaries remain authoritative;
4. Legal Eagle and other hard learning exclusions remain enforced;
5. Provider Trust Profiles can constrain external processing by data class and purpose;
6. Trust Manifests are versioned, attributable, and limited to implemented evidence;
7. retention policy is classification/purpose driven rather than blanket indefinite retention;
8. existing historical content is preserved during Phase C migration;
9. retention review and holds can be represented without destructive action;
10. lineage uncertainty blocks destructive retention actions;
11. policy decisions are traceable without copying raw sensitive content into audit logs;
12. public publication remains explicit and governed;
13. no target-state concept is marketed as live without implementation evidence;
14. Phase B Portfolio Registry, Product Lab, Products, RONSAS placement, and billing-off behavior remain compatible;
15. all new significant writes are governed and tested.

## 25. Review and implementation boundary

This document is the Phase C written design draft derived from the approved DataNest ecosystem master architecture.

It does **not** authorize schema mutation, retention enforcement, destructive deletion, provider-policy rollout, production deployment, or public trust claims.

The next required step is user review of this written Phase C design.

Only after the written design is approved should a detailed Phase C implementation plan be created, self-reviewed, and presented with an execution method. Implementation begins only after that plan is approved.
