> **Superseded execution contract:** This earlier planning draft is retained for history. The approved implementation contract is `docs/superpowers/plans/2026-09-27-datanest-phase-c-trust-data-policy-foundations.md`.\n\n# DataNest Phase C — Trust and Data Policy Foundations Implementation Plan

**Date:** 2026-09-27  
**Repository:** `DataNest-Supository/DataNest`  
**Target branch:** `feature/datanest-phase-c-trust-data-policy`  
**Base:** `main` after Phase B merge commit `4d3ce8d079f5dfde24ca9e319a34f6842609c7b8`  
**Architecture authority:** `docs/superpowers/specs/2026-09-27-datanest-ecosystem-business-operating-architecture-design.md`  
**Phase:** C — Trust and data policy foundations  
**Implementation status:** Plan only; no Phase C runtime/schema changes are authorized by this document alone.

## 1. Objective

Implement the smallest additive trust/data-policy foundation that makes DataNest capable of representing and enforcing the architecture programme's two independent data-policy dimensions without weakening existing RLS, RBAC, governed-memory, AI file-access, certification, or source/backend authority boundaries.

Phase C establishes:

1. visibility / processing classification;
2. reuse / learning state;
3. Provider Trust Profile records and evaluation;
4. Trust Manifest records for currently implemented scopes;
5. policy-driven retention evaluation that is non-destructive by default;
6. auditable policy assignment and change history;
7. conservative integration with the existing DataNest AI intake/learning path.

Phase C does **not** implement Cloud-Nest, Supository, ILM, Resource Fabric, billing, automatic deletion, autonomous legal-right decisions, or new public trust claims.

## 2. Current-state grounding

The implementation must preserve the current DataNest authority model:

- GitHub remains source/history/CI/evidence authority.
- Supabase remains authentication/data/storage/backend-function authority.
- DataNest remains the parent platform; RONSAS remains a governed Product.
- Phase B Portfolio Registry/Product Registry boundaries remain unchanged.
- DataNest AI already separates raw staged evidence from production certified memory.
- `datanest-ai-chat` already uses staged intake events, current-session evidence, certified memory, provider routing, and `learning_eligible` metadata.
- The governed-memory design's earlier blanket raw-retention rule was amended on 2026-09-27 to policy-driven retention.
- The retention amendment explicitly does not authorize deletion, anonymization, migration, or mutation of existing records by itself.
- Legal Eagle already marks its interactions `learning_eligible=false`; Phase C must preserve that stronger boundary.
- Production certified-memory promotion remains explicit and certification-gated.

Phase C must wrap these controls with policy state rather than create a second learning or provider subsystem.

## 3. Canonical policy vocabularies

### 3.1 Visibility / processing boundary

The canonical values are:

- `public`
- `nest_private`
- `project_restricted`
- `organization_restricted`
- `high_sensitivity`
- `local_only`

Because Cloud-Nest is not yet a live product capability, `nest_private` is a valid target-state classification value but Phase C UI must not present Cloud-Nest as implemented.

### 3.2 Reuse / learning state

The canonical values are:

- `runtime_only`
- `session_context`
- `project_learning_eligible`
- `project_certified_memory`
- `platform_learning_eligible`
- `datanest_certified_knowledge`
- `publicly_reusable`

Visibility and reuse state are independent. No code may infer a broader reuse state merely because an object is visible or processable.

## 4. Data model

Create one additive production migration after the Phase B migrations, with exact timestamp chosen at implementation time.

### 4.1 `retention_policies`

Project-scoped policy definitions.

Minimum fields:

- `id uuid primary key`
- `project_id uuid not null`
- `name text not null`
- `purpose text not null`
- `visibility_class text not null`
- `reuse_state text not null`
- `retention_days integer null`
- `post_retention_action text not null`
- `requires_human_review boolean not null default true`
- `legal_hold_capable boolean not null default true`
- `status text not null`
- `policy_version text not null`
- `created_by uuid not null`
- `approved_by uuid null`
- timestamps

Allowed `post_retention_action` values for Phase C:

- `retain`
- `review`
- `archive_candidate`
- `delete_candidate`

Phase C must not include an automatic delete executor.

### 4.2 `data_policy_assignments`

Project-scoped assignment of policy state to governed object references.

Minimum fields:

- `id uuid primary key`
- `project_id uuid not null`
- `object_type text not null`
- `object_id uuid not null`
- `visibility_class text not null`
- `reuse_state text not null`
- `purpose text not null`
- `retention_policy_id uuid null`
- `policy_source text not null`
- `metadata jsonb not null default '{}'`
- `assigned_by uuid not null`
- `created_at`
- `updated_at`

Initial supported object types must be an explicit allowlist covering only implemented DataNest objects. Do not introduce a generic unvalidated reference that can silently point outside the caller's project.

Candidate initial object types:

- `ai_intake_event`
- `certified_memory`
- `portfolio_item`
- `product`
- `product_record`
- `transparency_artifact`

The implementation task must validate exact existing identifiers before finalizing this list.

### 4.3 `provider_trust_profiles`

Project-visible trust metadata for approved external or local AI/service providers. This is policy metadata around existing provider identity and must not duplicate credentials or provider connection secrets.

Minimum fields:

- `id uuid primary key`
- `project_id uuid null` for platform-default versus project override
- `provider_key text not null`
- `display_name text not null`
- permitted visibility classes
- permitted purposes
- `region_locality text null`
- `retention_policy text not null`
- `training_reuse_policy text not null`
- `security_posture text not null`
- `contract_state text not null`
- `availability_state text not null`
- `evidence_reference text null`
- `status text not null`
- `policy_version text not null`
- audit fields

No provider secret, API key, password, reusable browser session, or service-role credential may be stored here.

### 4.4 `trust_manifests`

Evidence-backed trust statements for scopes DataNest already implements.

Phase C supported scope types:

- `project`
- `product`

Do not publish a `nest` manifest until Cloud-Nest exists as an implemented governed scope.

Minimum fields:

- `id uuid primary key`
- `project_id uuid not null`
- `scope_type text not null`
- `scope_id uuid not null`
- `manifest_version text not null`
- `publication_state text not null`
- data-location summary
- access-policy summary
- learning-policy summary
- external-provider-policy summary
- retention summary
- export/portability summary
- audit-state summary
- governance-version reference
- `evidence jsonb not null default '{}'`
- `created_by`
- `approved_by`
- timestamps

Allowed publication state:

- `draft`
- `internal`
- `public`

Public state must require owner/admin authorization plus non-empty evidence references. Publication must not imply certification beyond the recorded evidence.

### 4.5 `retention_evaluations`

Append-only dry-run evidence recording which governed objects are due for review/archive/delete consideration under a policy.

Minimum fields:

- evaluation ID
- project ID
- object type/id
- retention policy ID/version
- evaluated timestamp
- age/effective-date evidence
- proposed action
- reason
- legal-hold state
- `execution_authorized boolean not null default false`
- trace ID

Phase C does not mutate source content from this table.

## 5. Database authority and RLS

All new tables must have RLS enabled.

Browser/user clients:

- may read only policy/trust records for projects they are authorized to access;
- must not receive direct authenticated `insert`, `update`, or `delete` table grants for governed policy history;
- mutate state only through versioned governed RPCs.

Service role retains backend authority.

Every SECURITY DEFINER function must:

- require authenticated caller where user-invoked;
- resolve project scope server-side;
- use existing project-role helpers;
- use an explicit safe `search_path`;
- reject cross-project object references;
- emit attributable project events;
- preserve history rather than silently overwrite approved policy.

## 6. Authority matrix

### Viewer

- read authorized trust/data-policy state;
- no mutations.

### Operator

- may propose a project-level data-policy assignment or retention-policy change where implementation supports proposals;
- cannot approve/publicly publish;
- cannot expand an object's reuse state to platform-level/public reuse.

### Admin

- may approve ordinary project-level classifications, retention policies, provider profiles, and internal trust manifests;
- may not approve their own proposal where independent review is required;
- public trust publication requires evidence.

### Owner

Required for:

- `platform_learning_eligible`;
- `datanest_certified_knowledge`;
- `publicly_reusable`;
- public Trust Manifest publication when it changes a public trust claim;
- any retention policy that creates `delete_candidate` state;
- high-sensitivity policy exceptions.

No role in Phase C can execute automatic deletion.

## 7. Governed operations

Implement versioned RPCs with names finalized during TDD. Target operations:

- create/propose data-policy assignment;
- approve/reject data-policy assignment;
- create/propose retention policy;
- approve/reject retention policy;
- upsert/propose Provider Trust Profile;
- approve Provider Trust Profile;
- create/update draft Trust Manifest;
- approve/publish Trust Manifest;
- run retention evaluation dry-run;
- evaluate whether a provider is permitted for a declared policy envelope.

The provider-permission evaluator should return a decision plus reason/evidence, not credentials.

## 8. DataNest AI integration

Phase C must integrate conservatively with the existing governed-memory path.

### 8.1 Intake defaults

For new DataNest AI intake, add server-side policy metadata with conservative defaults that do not broaden learning:

- ordinary project AI work: default visibility no broader than `project_restricted`;
- reuse state must remain compatible with existing `learning_eligible` behavior;
- `learning_eligible=false` must never map above `session_context`;
- Legal Eagle remains excluded from automatic project-wide learning.

Do not rewrite existing staged rows during Phase C.

### 8.2 Learning guard

Before trend/candidate generation, a Phase C guard must ensure the effective reuse state permits project learning.

Existing `learning_eligible=false` remains a hard stop.

### 8.3 Provider preflight

Before sending classified content to a non-embedded provider, evaluate the applicable Provider Trust Profile.

Fail closed when:

- no permitted provider profile exists for the declared classification/purpose;
- the profile is inactive;
- a Local Only classification would leave the permitted local boundary;
- policy state is missing where policy is required.

Embedded/no-provider fallback remains available where current behavior supports it.

### 8.4 Certified memory

Existing certified memory remains governed by the current certification pipeline.

Phase C may attach policy metadata to newly promoted memory, but it must not recertify or bulk-mutate historical certified memory.

## 9. Retention behavior

Phase C retention is **policy + evaluation**, not destructive enforcement.

Allowed Phase C behavior:

1. define retention policy;
2. assign policy to supported new/updated governed objects;
3. evaluate age/purpose/legal-hold state;
4. record a dry-run proposed action;
5. show review candidates to authorized humans;
6. emit audit evidence.

Forbidden Phase C behavior:

- automatic raw-content deletion;
- automatic anonymization;
- irreversible storage mutation;
- deleting audit/certification/provenance records;
- rewriting historical retention evidence;
- bulk-mutating existing DataNest AI staging evidence without a separately approved migration.

## 10. UI surface

Add a **Trust & Data** section inside an existing governance/settings surface rather than inventing a new top-level product.

The UI must provide:

- policy vocabulary legend;
- current project policy assignments;
- Provider Trust Profiles without secrets;
- Trust Manifest draft/internal/public state;
- retention dry-run candidates;
- clear evidence/authority labels;
- explicit notice that processing permission is not learning permission;
- explicit notice that Phase C retention evaluation does not automatically delete data.

Owner/admin/operator controls must match server-side authority; UI hiding is not authorization.

Do not market Cloud-Nest, Supository, or ILM as implemented because this phase does not implement them.

## 11. TDD and verification sequence

### Task 1 — Source contracts first

Add failing source-contract tests for:

- canonical visibility values;
- canonical reuse states;
- no direct authenticated mutation grants;
- same-project validation;
- provider profiles storing no secrets;
- Trust Manifest publication evidence;
- retention evaluation being non-destructive;
- Legal Eagle remaining learning-ineligible;
- provider preflight failing closed;
- no automatic deletion executor.

### Task 2 — Foundation migration

Implement tables, constraints, indexes, RLS, read policies, service-role grants, and safe views.

Migration replay must pass on a fresh local Supabase database.

### Task 3 — Governed RPCs

Implement role-gated mutation/evaluation RPCs and append-only event evidence.

Negative tests must cover:

- unauthenticated caller;
- viewer mutation;
- operator approval;
- self-approval where prohibited;
- cross-project object assignment;
- public reuse without owner authority;
- public manifest without evidence;
- delete-candidate policy without owner authority.

### Task 4 — DataNest AI policy integration

Add conservative intake policy metadata, project-learning guard, and provider preflight.

Preserve current staging isolation and certification behavior.

### Task 5 — Trust & Data UI

Implement accessible project-scoped read/manage UI with responsive browser tests.

### Task 6 — Documentation

Update:

- `docs/ARCHITECTURE.md`;
- relevant governed-memory documentation;
- any deployment/security documentation needed to explain provider trust metadata;
- README only if a new user-visible capability is genuinely available.

### Task 7 — CI and certification

Required exact-head gates before review-ready:

- `npm test`;
- `npm run check`;
- production static build;
- migration replay;
- targeted browser verification;
- existing PR Verification;
- existing DataNest AI Certification;
- any new SQL acceptance tests for Trust & Data policy.

## 12. Browser acceptance scenarios

At minimum:

1. viewer can inspect Trust & Data state but sees no mutation controls;
2. operator can propose only permitted project-level changes;
3. owner/admin approval path is role-gated;
4. public Trust Manifest cannot publish without evidence;
5. processing classification and reuse state render independently;
6. retention candidates are visibly dry-run/review-only;
7. Provider Trust Profile exposes policy metadata but never credentials;
8. narrow/mobile viewport remains usable;
9. Legal Eagle remains learning-ineligible;
10. failed provider-policy preflight degrades safely instead of silently routing forbidden data.

## 13. Non-goals

Phase C does not:

- enable billing;
- enable automated deletion;
- migrate all historical rows to new classification values;
- create Cloud-Nest workspaces;
- create Supository;
- implement ILM-1;
- implement Resource Fabric or sovereign nodes;
- create new ownership, royalty, investment, contractual, or governance rights;
- replace current DataNest AI staging/certification;
- expose provider credentials;
- weaken RLS/RBAC;
- merge RONSAS into DataNest;
- treat public visibility as public reuse permission.

## 14. Rollback and safety

The Phase C migration should be additive.

Before merge:

- migration replay must prove clean install;
- no existing table column may be dropped;
- no existing data may be deleted;
- existing AI learning path must remain functional under conservative defaults;
- provider routing must retain an embedded/fail-closed fallback;
- public trust publication remains off until evidence-backed approval.

If Phase C application integration must be rolled back, the new policy tables may remain dormant evidence stores without affecting existing Product Registry, Portfolio Registry, certified memory, or scheduler behavior.

## 15. Definition of done

Phase C is complete only when evidence shows:

1. visibility and reuse are represented independently;
2. project-authorized users can inspect policy state;
3. governed mutations occur through versioned RPCs;
4. Provider Trust Profiles contain policy/evidence metadata and no secrets;
5. provider preflight can deny an impermissible route;
6. retention policy can identify review/archive/delete candidates without deleting them;
7. Legal Eagle and other `learning_eligible=false` input cannot enter project learning;
8. Trust Manifest public state is evidence-backed and authorized;
9. RLS/RBAC/AI file-access boundaries are not weakened;
10. migration replay, unit/type/build, browser verification, and DataNest AI certification pass on the exact implementation head;
11. architecture documentation distinguishes implemented Phase C controls from still-future Cloud-Nest, Supository, ILM, and Resource Fabric capabilities.

## 16. Execution boundary

This plan should be reviewed as the Phase C execution contract.

After plan review, implementation should proceed on the same Phase C branch using test-first commits, with a draft implementation PR kept non-mergeable by policy until the full exact-head verification set passes.
