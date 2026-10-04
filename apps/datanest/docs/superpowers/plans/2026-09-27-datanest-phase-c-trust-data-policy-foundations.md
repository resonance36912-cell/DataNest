# DataNest Phase C — Trust and Data Policy Foundations Implementation Plan

**Date:** 2026-09-27  
**Repository:** DataNest-Supository/DataNest  
**Approved design:** `docs/superpowers/specs/2026-09-27-datanest-phase-c-trust-data-policy-foundations-design.md`  
**Planning branch:** `design/datanest-phase-c-trust-data-policy-20260927`  
**Target implementation branch:** `feature/datanest-phase-c-trust-data-policy`  
**Plan status:** Self-review complete; ready for user execution approval

## Goal

Implement the approved Phase C trust/data-policy foundations as an additive, governed subsystem that separates processing visibility from reuse/learning authority; constrains external-provider processing through explicit Provider Trust Profiles; exposes versioned Trust Manifests; introduces non-destructive, lineage-aware retention policy; and preserves all existing RLS/RBAC, Job file-access, certified-memory, Product/Portfolio, audit, and billing-off boundaries.

## Architecture

Phase C adds a project-scoped trust-policy layer beside the existing DataNest governance and AI controls.

- Existing RLS/RBAC and Job authorization remain the first authority gate.
- Phase C policy is deny-preserving and cannot create access that other controls denied.
- `data_policy_bindings` records explicit object/scope policy decisions.
- `trust_manifests` records versioned project/product trust defaults, evidence state, and explicit `report_only|enforced` rollout mode.
- `provider_trust_profiles` constrains external providers by data class and declared purpose.
- `retention_policies`, `retention_holds`, `retention_reviews`, and `data_policy_lineage` support non-destructive retention governance.
- Governed RPCs are the only authenticated mutation path.
- A private policy resolver plus service-role evaluation RPC returns allow/deny/review-required without copying raw content into production audit.
- DataNest AI consults Phase C before external provider execution and before project-learning extraction. Existing Legal Eagle `learning_eligible=false` remains a hard denial for learning.
- Governance gains an internal Trust & Data Policy surface. No public trust claim is added in Phase C v1.

## Global constraints

- DataNest remains the parent platform.
- RONSAS remains a governed product under `DataNest > Products > RONSAS`.
- GitHub remains source/history/CI/evidence authority.
- Supabase remains auth/data/storage/backend-function authority.
- Existing `private.has_project_access`, role helpers, RLS policies, Job collaboration rules, and `authorize_datanest_ai_file_access(...)` remain authoritative.
- A positive trust-policy decision never bypasses project/Job/file authorization.
- Existing `learning_eligible=false` states remain hard exclusions.
- Certified memory remains the project-wide reusable-memory authority.
- No automatic project-to-platform learning promotion is introduced.
- No migration deletes, anonymizes, rewrites, or archives existing production/staging records.
- No retention RPC in Phase C v1 performs destructive deletion.
- No Provider Trust Profile stores credentials, API keys, passwords, cookies, PATs, MFA recovery material, or service-role secrets.
- Public publication remains separately governed.
- Free-promotion / billing-off remains unchanged.
- Cloud-Nest, Supository, ILM, Resource Fabric, Authority Envelope, Capability Leases, Outcome Ledger, Shadow Economics, and later Phase D-H capabilities remain outside implementation scope.
- All new public multi-tenant tables use project-scoped RLS.
- All new FK columns are indexed.
- Significant trust/policy writes emit project audit events.
- Unknown or contradictory policy always resolves to `deny` or `review_required`; when the applicable Trust Manifest is `enforced` it blocks external routing, publication, project/platform learning, and destructive retention intent.
- Before enforcement coverage is complete, an external-provider route may run in explicit `report_only` mode: the Phase C decision is recorded but cannot override any denial from existing authorization/budget/allowlist controls.
- A Trust Manifest cannot enter `enforced` mode until its project default classification, active retention policy, and every currently active AI provider connection in scope have reviewed Phase C coverage.
- Safe embedded/local fallback may continue when external provider routing is denied.
- Current AI provider trust keys use the deterministic lower-case form `<provider>:<endpoint_host>`.
- Source changes are implemented and verified before any production promotion.

## Review focus

1. **Authorization precedence:** a Phase C allow/result must never turn an existing RLS/RBAC/Job/file/provider authorization denial into permission.
2. **Rollout coverage:** `report_only` must preserve current authorized provider behavior while recording unresolved trust decisions; `enforced` must be impossible until project classification, retention, and every active AI provider route have reviewed coverage.
3. **Learning exclusion:** Legal Eagle, explicit `learning_eligible=false`, and unresolved new learning policy must stay out of automatic project/platform learning even when a broader manifest exists.
4. **Retention/lineage safety:** no Phase C migration or RPC may delete/anonymize existing data, and active holds or unresolved lineage must block future destructive disposition.
5. **Trust-claim integrity:** planned/unknown controls and target-state capabilities must never render as verified trust guarantees; existing Products/Portfolio/RONSAS/billing behavior must remain compatible.

---

## File structure

Create:

- `supabase/migrations/20260927113000_add_trust_policy_foundations.sql`
- `supabase/migrations/20260927114000_add_retention_policy_foundations.sql`
- `supabase/migrations/20260927115000_add_trust_policy_governed_operations.sql`
- `src/lib/trustPolicy.ts`
- `src/components/TrustPolicyPanel.tsx`
- `tests/unit/trust-policy-schema-source.test.mjs`
- `tests/unit/retention-policy-source.test.mjs`
- `tests/unit/trust-policy-operations-source.test.mjs`
- `tests/unit/trust-policy-ui-source.test.mjs`
- `tests/unit/datanest-ai-trust-policy-source.test.mjs`
- `tests/browser/trust-policy.spec.ts`

Modify:

- `src/components/GovernanceWorkspace.tsx`
- `src/components/DataNestApp.tsx`
- `src/app/globals.css`
- `supabase/functions/datanest-ai-chat/index.ts`
- `.github/workflows/pr-verification.yml`
- `docs/ARCHITECTURE.md`

Modify existing tests only where compatibility signatures change; preserve their existing assertions.

No existing historical migration is rewritten.

---

# Task 1 — Trust policy schema, RLS, and current-state read model

**Files**

- Create `supabase/migrations/20260927113000_add_trust_policy_foundations.sql`
- Create `tests/unit/trust-policy-schema-source.test.mjs`

## Interfaces

Create the following project-scoped tables.

### `public.data_policy_bindings`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `subject_type text not null`
- `subject_id uuid null`
- `subject_reference text null`
- `visibility_class text not null`
- `reuse_state text not null`
- `publication_authorized boolean not null default false`
- `status text not null default 'proposed'`
- `rationale text not null`
- `evidence_reference text null`
- `proposed_by uuid not null references auth.users(id)`
- `approved_by uuid null references auth.users(id)`
- `approved_at timestamptz null`
- `supersedes_binding_id uuid null references public.data_policy_bindings(id)`
- `created_at timestamptz not null default now()`

Controlled `subject_type` values for Phase C v1:

- `project`
- `product`
- `job`
- `ai_event`
- `certified_memory`
- `portfolio_item`
- `file`
- `transparency_artifact`
- `other`

Require at least one stable subject identity from `subject_id` or non-empty `subject_reference`. Governed operations validate that typed IDs belong to the same project when an authoritative table exists.

Controlled `visibility_class` values:

- `public`
- `nest_private`
- `project_restricted`
- `organization_restricted`
- `high_sensitivity`
- `local_only`

Controlled `reuse_state` values:

- `runtime_only`
- `session_context`
- `project_learning_eligible`
- `project_certified_memory`
- `platform_learning_eligible`
- `datanest_certified_knowledge`
- `publicly_reusable`

Controlled `status` values:

- `proposed`
- `active`
- `superseded`
- `rejected`

Create a partial unique index allowing at most one active binding for a project + subject identity.

### `public.trust_manifests`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `scope_type text not null check (scope_type in ('project','product'))`
- `product_id uuid null references public.products(id) on delete cascade`
- `version integer not null`
- `status text not null default 'draft'`
- `default_visibility_class text not null`
- `default_reuse_state text not null`
- `publication_policy text not null default 'governed_only'`
- `export_policy text not null default 'governed_only'`
- `certified_memory_policy text not null default 'existing_governed_pipeline'`
- `evidence_state text not null default 'unknown'`
- `evidence_reference text null`
- `known_limitations text null`
- `policy_version text not null`
- `effective_from timestamptz null`
- `review_due_at timestamptz null`
- `enforcement_mode text not null default 'report_only'`
- `approved_provider_keys text[] not null default '{}'`
- `supersedes_manifest_id uuid null references public.trust_manifests(id)`
- `created_by uuid not null references auth.users(id)`
- `approved_by uuid null references auth.users(id)`
- `approved_at timestamptz null`
- `created_at timestamptz not null default now()`

Controlled values:

- status: `draft|active|superseded|rejected`
- evidence state: `verified|partial|planned|unknown`
- publication/export policy: `disabled|governed_only`
- enforcement mode: `report_only|enforced`

A project manifest has `product_id is null`; a product manifest requires a same-project `products` row.

Create one-active-manifest partial unique indexes by project scope and product scope.

`report_only` is the only safe default. `enforced` is a governed activation state and is never inferred from the presence of a manifest.

### `public.provider_trust_profiles`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `provider_connection_id uuid null references public.ai_provider_connections(id) on delete set null`
- `provider_key text not null`
- `provider_category text not null`
- `status text not null default 'draft'`
- `allowed_visibility_classes text[] not null default '{}'`
- `allowed_purposes text[] not null default '{}'`
- `prohibited_purposes text[] not null default '{}'`
- `allowed_regions text[] not null default '{}'`
- `retention_posture text null`
- `training_reuse_posture text null`
- `security_evidence_reference text null`
- `contractual_evidence_reference text null`
- `data_locality_guarantees text null`
- `credential_boundary_description text null`
- `evidence_state text not null default 'unknown'`
- `policy_version text not null`
- `effective_from timestamptz null`
- `review_due_at timestamptz null`
- `known_limitations text null`
- `supersedes_profile_id uuid null references public.provider_trust_profiles(id)`
- `created_by uuid not null references auth.users(id)`
- `approved_by uuid null references auth.users(id)`
- `approved_at timestamptz null`
- `created_at timestamptz not null default now()`

Controlled status values:

- `draft`
- `active`
- `restricted`
- `suspended`
- `retired`

Provider categories:

- `ai_model`
- `storage`
- `execution`
- `search`
- `communications`
- `other`

An active provider profile requires non-empty allowed purposes, non-empty allowed visibility classes, a non-`unknown` evidence state, and explicit retention/training-reuse posture text. It must not contain secret material by design or UI.

For current AI routes, `provider_key` is exactly `lower(provider)||':'||lower(endpoint_host)`. A profile with `provider_connection_id` must match that connection's project and deterministic key.

Treat `active|restricted|suspended` as current profile states for uniqueness; only `active|restricted` may ever permit a route, and `suspended` is an explicit current denial. Retired/draft rows are history/non-current.

Create one current profile per project + provider connection/key, with supersession history preserved.

### `public.data_policy_decisions`

Append-only, trace-safe policy evaluation evidence.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `trace_id text not null`
- `actor_user_id uuid null references auth.users(id)`
- `subject_type text not null`
- `subject_id uuid null`
- `subject_reference text null`
- `purpose text not null`
- `requested_operation text not null`
- `outcome text not null check (outcome in ('allow','deny','review_required'))`
- `reason_code text not null`
- `effective_visibility_class text null`
- `effective_reuse_state text null`
- `publication_authorized boolean not null default false`
- `manifest_id uuid null references public.trust_manifests(id)`
- `binding_id uuid null references public.data_policy_bindings(id)`
- `provider_profile_id uuid null references public.provider_trust_profiles(id)`
- `retention_policy_id uuid null`
- `enforcement_mode text not null check (enforcement_mode in ('report_only','enforced'))`
- `policy_version text not null`
- `created_at timestamptz not null default now()`

The table never stores raw subject content. Browser roles receive read access only through project-scoped RLS; service-role evaluation is the only insertion path.

Index `(project_id,created_at desc)`, `trace_id`, every FK, and subject lookup fields.

### Read models

Create security-invoker views:

- `public.active_trust_manifest_view`
- `public.active_provider_trust_profile_view`
- `public.active_data_policy_binding_view`

Views expose current active state only; history tables remain authoritative.

## Step 1 — Write failing schema source tests

Assert:

- all four tables exist with the exact controlled values above;
- one-active partial unique indexes exist;
- every FK column has an index;
- project-scoped RLS is enabled;
- authenticated users receive SELECT only;
- no authenticated direct INSERT/UPDATE/DELETE grants exist;
- service role access remains backend-only;
- read views use `security_invoker=true`;
- provider profiles contain no credential/secret value column;
- Trust Manifests default to `report_only` and expose `report_only|enforced` only;
- decision records are append-only, trace-safe, and contain no raw content column;
- no existing AI provider connection, certified-memory, Products, Portfolio, or file-access table is deleted or rewritten.

## Step 2 — Run focused test and verify RED

Run:

`node --test --experimental-strip-types tests/unit/trust-policy-schema-source.test.mjs`

Expected: fails because migration does not yet exist.

## Step 3 — Implement schema, indexes, RLS, and read views

Use existing project-access helpers for SELECT policies.

Do not add browser write policies.

## Step 4 — Run focused test and verify GREEN

Run the same focused test.

## Step 5 — Commit

Commit message:

`feat: add Phase C trust policy foundations`

---

# Task 2 — Non-destructive retention and lineage foundations

**Files**

- Create `supabase/migrations/20260927114000_add_retention_policy_foundations.sql`
- Create `tests/unit/retention-policy-source.test.mjs`

## Interfaces

### `public.retention_policies`

Versioned project-scoped retention policy metadata.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `policy_key text not null`
- `version integer not null`
- `status text not null default 'draft'`
- `applicable_visibility_classes text[] not null default '{}'`
- `applicable_reuse_states text[] not null default '{}'`
- `applicable_subject_types text[] not null default '{}'`
- `default_retention_days integer null`
- `review_interval_days integer null`
- `default_disposition_intent text not null default 'retain'`
- `rules jsonb not null default '{}'::jsonb`
- `minimum_evidence jsonb not null default '{}'::jsonb`
- `requires_lineage_review boolean not null default true`
- `status_reason text null`
- `effective_from timestamptz null`
- `review_due_at timestamptz null`
- `authority_basis text null`
- `evidence_reference text null`
- `supersedes_policy_id uuid null references public.retention_policies(id)`
- `created_by uuid not null references auth.users(id)`
- `approved_by uuid null references auth.users(id)`
- `approved_at timestamptz null`
- `created_at timestamptz not null default now()`

Controlled status:

- `draft|active|superseded|rejected`

Controlled default disposition:

- `retain`
- `review_due`
- `archive`
- `minimize`
- `delete_when_authorized`
- `legal_hold`

The last three are policy intent only. No destructive executor exists in Phase C.

If `default_retention_days` is non-null or `default_disposition_intent='delete_when_authorized'`, both `authority_basis` and `evidence_reference` must be non-empty. If no authoritative duration exists, `review_interval_days` must be non-null and the policy remains review-oriented rather than inventing a statutory/contractual duration.

Add nullable `retention_policy_id uuid references public.retention_policies(id)` to `trust_manifests` and index it.

### `public.retention_holds`

Fields include project, subject identity, hold type, reason, evidence reference, status, placed/released actor/timestamps.

Hold types:

- `legal`
- `contractual`
- `audit`
- `security`
- `governance`
- `other`

Status:

- `active|released`

One active hold of the same type per subject is sufficient; duplicate active holds are rejected.

### `public.retention_reviews`

Fields include:

- project;
- subject identity;
- retention policy;
- status;
- proposed disposition;
- policy version;
- rationale;
- hold state snapshot;
- lineage state snapshot;
- due/reviewed timestamps;
- requested/reviewed actor;
- evidence reference.

Statuses:

- `pending`
- `keep`
- `blocked`
- `approved_for_future_disposition`
- `superseded`

A review cannot perform deletion.

### `public.data_policy_lineage`

Minimal Phase C lineage edges only.

Fields:

- project;
- source subject type/id/reference;
- derived subject type/id/reference;
- relation type;
- status;
- evidence reference;
- created actor/time;
- supersession reference.

Relations:

- `derived_from`
- `summarizes`
- `certifies`
- `publishes`
- `references`
- `exports`
- `evaluates`

Status:

- `active|superseded|rejected`

This is not a full Supository implementation.

### Read model

Create `public.retention_review_view` with `security_invoker=true` resolving:

- active hold count;
- active lineage counts;
- current policy metadata;
- review state;
- whether future destructive disposition is currently blocked.

The view never means deletion is authorized.

## Step 1 — Write failing tests

Assert:

- all four tables and exact controlled values exist;
- active hold constraints exist;
- `trust_manifests.retention_policy_id` is nullable and indexed;
- RLS is enabled;
- authenticated users receive SELECT only;
- no SQL contains `delete from`, `truncate`, destructive content rewrite, storage object deletion, or anonymization of existing records;
- no RPC/function with a destructive executor is introduced in this migration;
- `retention_review_view` is security invoker;
- lineage is project-scoped and append/supersession oriented.

## Step 2 — Verify RED

Run:

`node --test --experimental-strip-types tests/unit/retention-policy-source.test.mjs`

## Step 3 — Implement migration

Keep all changes additive.

## Step 4 — Verify GREEN

Run the focused test.

## Step 5 — Commit

Commit message:

`feat: add non-destructive retention policy foundations`

---

# Task 3 — Governed operations and deny-preserving policy evaluation

**Files**

- Create `supabase/migrations/20260927115000_add_trust_policy_governed_operations.sql`
- Create `tests/unit/trust-policy-operations-source.test.mjs`

## Private helpers

Define private helpers equivalent to:

- `trust_subject_project(...)`
- `trust_validate_subject(...)`
- `trust_active_manifest(...)`
- `trust_effective_binding(...)`
- `trust_has_active_retention_hold(...)`
- `trust_lineage_state(...)`
- `trust_validate_manifest_evidence(...)`
- `trust_validate_provider_profile(...)`
- `trust_resolve_effective_policy(...)`

Private helpers are not executable by browser roles.

## Governed authenticated operations

Create these exact public signatures:

```sql
propose_data_policy_binding_v1(
  target_project uuid,
  target_subject_type text,
  target_visibility_class text,
  target_reuse_state text,
  target_rationale text,
  target_subject_id uuid default null,
  target_subject_reference text default null,
  target_publication_authorized boolean default false,
  target_evidence_reference text default null
) returns uuid

approve_data_policy_binding_v1(target_binding uuid) returns uuid
reject_data_policy_binding_v1(target_binding uuid,target_reason text) returns uuid

create_trust_manifest_draft_v1(
  target_project uuid,
  target_scope_type text,
  target_default_visibility_class text,
  target_default_reuse_state text,
  target_policy_version text,
  target_enforcement_mode text default 'report_only',
  target_product uuid default null,
  target_retention_policy uuid default null,
  target_approved_provider_keys text[] default '{}',
  target_publication_policy text default 'governed_only',
  target_export_policy text default 'governed_only',
  target_certified_memory_policy text default 'existing_governed_pipeline',
  target_evidence_state text default 'unknown',
  target_evidence_reference text default null,
  target_known_limitations text default null,
  target_review_due_at timestamptz default null
) returns uuid

activate_trust_manifest_v1(target_manifest uuid) returns uuid
reject_trust_manifest_v1(target_manifest uuid,target_reason text) returns uuid

create_provider_trust_profile_v1(
  target_project uuid,
  target_provider_key text,
  target_provider_category text,
  target_policy_version text,
  target_allowed_visibility_classes text[],
  target_allowed_purposes text[],
  target_retention_posture text,
  target_training_reuse_posture text,
  target_provider_connection uuid default null,
  target_prohibited_purposes text[] default '{}',
  target_allowed_regions text[] default '{}',
  target_security_evidence_reference text default null,
  target_contractual_evidence_reference text default null,
  target_data_locality_guarantees text default null,
  target_credential_boundary_description text default null,
  target_evidence_state text default 'unknown',
  target_known_limitations text default null,
  target_review_due_at timestamptz default null
) returns uuid

activate_provider_trust_profile_v1(target_profile uuid) returns uuid
suspend_provider_trust_profile_v1(target_profile uuid,target_reason text) returns uuid
retire_provider_trust_profile_v1(target_profile uuid,target_reason text) returns uuid

propose_retention_policy_v1(
  target_project uuid,
  target_policy_key text,
  target_default_disposition_intent text,
  target_requires_lineage_review boolean,
  target_applicable_visibility_classes text[] default '{}',
  target_applicable_reuse_states text[] default '{}',
  target_applicable_subject_types text[] default '{}',
  target_default_retention_days integer default null,
  target_review_interval_days integer default null,
  target_rules jsonb default '{}'::jsonb,
  target_minimum_evidence jsonb default '{}'::jsonb,
  target_authority_basis text default null,
  target_evidence_reference text default null,
  target_review_due_at timestamptz default null
) returns uuid

approve_retention_policy_v1(target_policy uuid) returns uuid
reject_retention_policy_v1(target_policy uuid,target_reason text) returns uuid

place_retention_hold_v1(
  target_project uuid,
  target_subject_type text,
  target_hold_type text,
  target_reason text,
  target_subject_id uuid default null,
  target_subject_reference text default null,
  target_evidence_reference text default null
) returns uuid

release_retention_hold_v1(target_hold uuid,target_reason text) returns uuid

request_retention_review_v1(
  target_project uuid,
  target_subject_type text,
  target_proposed_disposition text,
  target_rationale text,
  target_subject_id uuid default null,
  target_subject_reference text default null,
  target_retention_policy uuid default null,
  target_evidence_reference text default null
) returns uuid

resolve_retention_review_v1(
  target_review uuid,
  target_status text,
  target_reason text,
  target_evidence_reference text default null
) returns uuid

record_data_policy_lineage_v1(
  target_project uuid,
  target_source_subject_type text,
  target_derived_subject_type text,
  target_relation_type text,
  target_source_subject_id uuid default null,
  target_source_subject_reference text default null,
  target_derived_subject_id uuid default null,
  target_derived_subject_reference text default null,
  target_evidence_reference text default null
) returns uuid

get_trust_policy_workspace_v1(target_project uuid) returns jsonb
```

Role model:

- viewer/stakeholder: read only;
- operator: propose binding, create draft provider/manifest evidence, request retention review, record permitted lineage;
- owner/admin: approve/widen policy, activate/suspend provider profiles, activate manifests, approve retention policy, place/release holds, resolve reviews;
- service role: backend evaluation only.

An operator may tighten a proposed state but may not activate a broader/public/platform-learning state.

Owner/admin activation is required for:

- `public` visibility;
- `platform_learning_eligible`;
- `datanest_certified_knowledge`;
- `publicly_reusable`;
- `publication_authorized=true`;
- active Provider Trust Profiles;
- active retention policies.

Independent-review rules must reuse existing project-governance conventions where feasible. At minimum, a proposer cannot approve their own public/publicly-reusable or platform-learning widening proposal.

## Service evaluation operation

Create the service-role-only function:

```sql
service_evaluate_data_policy_v1(
  target_project uuid,
  target_actor_user uuid,
  target_subject_type text,
  target_purpose text,
  target_requested_operation text,
  target_trace_id text,
  target_subject_id uuid default null,
  target_subject_reference text default null,
  target_provider_connection uuid default null,
  target_provider_key text default null,
  target_hard_learning_exclusion boolean default false
) returns jsonb
```

Supported purposes must include the approved Phase C purpose list.

The service evaluator validates project/typed-subject consistency, resolves the active manifest/binding/provider/retention state, and inserts exactly one append-only `data_policy_decisions` row per evaluation trace + operation. It never grants user access by itself; callers must already have passed the existing user/Job/file/provider authorization path appropriate to the operation.

Return JSON containing:

- `outcome: allow|deny|review_required`
- `reason_code`
- `enforcement_mode: report_only|enforced`
- effective visibility class;
- effective reuse state;
- publication authorization;
- manifest ID/version if used;
- binding ID if used;
- provider profile ID if relevant;
- retention policy ID and active hold count when relevant;
- policy version;
- decision-record ID and trace-safe metadata.

Never return or persist raw subject content.

## Required evaluation rules

- hard authorization exclusions cannot be overridden;
- missing/contradictory policy denies external provider routing, publication, project/platform learning and destructive retention intent;
- no manifest/binding defaults to an unresolved high-restriction posture for those operations;
- `local_only` denies external provider processing;
- `high_sensitivity` requires an explicitly active provider profile allowing the class and purpose;
- suspended/retired/expired provider profile denies;
- purpose in `prohibited_purposes` denies;
- absent provider profile resolves external routing to deny/review-required; it blocks the route only when `enforcement_mode='enforced'` and is recorded in `report_only` mode;
- `target_hard_learning_exclusion=true` denies project/platform learning regardless of manifest;
- `project_learning` requires `project_learning_eligible`;
- `platform_learning` requires `platform_learning_eligible`;
- existing certified memory is reusable only through the current certified-memory retrieval path; the evaluator must not promote it;
- publication requires explicit governed public visibility and publication authority; `public` alone is not enough;
- retention future disposition with active hold or unresolved lineage returns deny/review_required;
- evaluator never deletes or mutates subject data.
- no active Trust Manifest resolves as `enforcement_mode='report_only'` with `review_required`; this transitional result never overrides an existing authorization denial.
- activating a Trust Manifest with `enforcement_mode='enforced'` requires: an active project-level policy binding, an active referenced retention policy, non-planned/non-unknown manifest evidence, and reviewed current profiles for every active `ai_provider_connections` row in the project.
- an enforced manifest may approve zero providers only when there are no active provider connections; otherwise every active connection's deterministic provider key must be listed in `approved_provider_keys` and backed by a current non-expired `active|restricted` profile.

## Audit events

Emit project events for significant writes, with event types such as:

- `DATA_POLICY_PROPOSED`
- `DATA_POLICY_APPROVED`
- `DATA_POLICY_REJECTED`
- `TRUST_MANIFEST_ACTIVATED`
- `PROVIDER_TRUST_PROFILE_ACTIVATED`
- `PROVIDER_TRUST_PROFILE_SUSPENDED`
- `RETENTION_POLICY_APPROVED`
- `RETENTION_HOLD_PLACED`
- `RETENTION_HOLD_RELEASED`
- `RETENTION_REVIEW_REQUESTED`
- `RETENTION_REVIEW_RESOLVED`
- `DATA_POLICY_LINEAGE_RECORDED`

Do not emit raw content.

## Step 1 — Write failing operation tests

Assert:

- all exact RPCs exist;
- authenticated mutation functions are explicitly granted only where intended;
- service evaluator is service-role only;
- no browser role can execute private helpers;
- self/cross-project subject bindings fail closed;
- product subjects require same-project products;
- provider connection/profile project mismatch fails;
- public/platform-learning widening requires owner/admin and independent approval where specified;
- active records are superseded, never silently overwritten;
- evaluation rules above exist;
- audit events exist;
- no destructive retention executor exists;
- `report_only`/`enforced` evaluator behavior and the enforced-manifest coverage guard exist;
- service evaluation writes trace-safe `data_policy_decisions` without raw content.

## Step 2 — Verify RED

Run:

`node --test --experimental-strip-types tests/unit/trust-policy-operations-source.test.mjs`

## Step 3 — Implement operations

Prefer one transaction for activation/supersession operations.

## Step 4 — Verify GREEN

Run the focused test.

## Step 5 — Commit

Commit message:

`feat: add governed trust policy operations`

---

# Task 4 — DataNest AI enforcement adapters without bypassing existing authorization

**Files**

- Modify `supabase/functions/datanest-ai-chat/index.ts`
- Modify `supabase/functions/datanest-ai-intake/index.ts`
- Create `tests/unit/datanest-ai-trust-policy-source.test.mjs`

## External-provider flow

Preserve the existing order:

1. authenticated caller resolves the authorized Job;
2. `begin_datanest_ai_request` creates/loads the governed usage request;
3. input is staged with trace identity;
4. provider connection is resolved;
5. Phase C policy evaluation runs and records its decision before an external provider call;
6. existing `service_authorize_ai_request` still runs and remains authoritative for provider/budget/allowlist state;
7. when Phase C is `enforced`, both Phase C and existing provider authorization must allow before the provider receives the prompt;
8. when Phase C is `report_only`, the Phase C result is recorded but the existing provider authorization remains the sole allow/deny gate, so report-only can never convert an existing denial into permission.

Call `service_evaluate_data_policy_v1` using the authenticated user as `target_actor_user`, the authorized Job as subject type `job` + `subject_id=job.id`, the staged DN-AI trace as `target_trace_id`, purpose `external_provider_processing`, operation `process`, the resolved provider connection UUID, and deterministic provider key `lower(provider)+":"+lower(endpoint_host)`. Hard learning exclusion remains separate and is not treated as an external-processing denial by itself.

If Phase C is `enforced` and the result is not `allow`:

- do not call the provider;
- finish the usage request with a traceable policy-denied reason;
- preserve current safe embedded fallback behavior where the existing chat flow permits it;
- do not fabricate an external-provider success.

If Phase C is `report_only`, attach/record the decision evidence but continue to the existing `service_authorize_ai_request`; an existing authorization denial still stops the route.

## Learning flow

Before `updateTrendCandidate(...)`:

- call Phase C evaluation for `project_learning` + `reuse` against the authorized Job and staged input trace;
- pass `target_hard_learning_exclusion = !learningEligible` from authoritative server-side mode logic;
- write the returned `policy_version`, `effective_reuse_state`, decision ID, and final boolean `learning_eligible` into the staged event metadata before trend/candidate extraction;
- run trend/candidate extraction only when outcome is `allow`; `report_only` does not weaken the fail-closed learning rule.
- update the evidence filter so new Phase C-stamped events require `learning_eligible===true`; legacy rows with explicit `learning_eligible===true` remain valid equivalent authorization, while legacy rows with no learning flag are excluded from new automatic learning.

Required behavior:

- Legal Eagle remains `learning_eligible=false`;
- a broad project manifest cannot override that exclusion;
- unresolved/missing learning policy means no automatic project-learning extraction;
- skipping learning does not discard the Job/session response or staged evidence;
- `datanest-ai-intake` applies the same `project_learning` evaluation to new AI Companion returns before staging metadata is finalized, so external-return evidence cannot enter trends through an unstamped bypass.

## Certified memory

Do not change `get_certified_memory_context` authorization or promotion behavior.

Do not create a new memory table.

## Job file access

Do not weaken or replace `authorize_datanest_ai_file_access(...)`.

Add regression assertions that a trust-policy allow result is never used as a substitute for Job/file access authorization.

No file deletion or retention enforcement is introduced.

## Step 1 — Write failing source tests

Assert:

- `service_evaluate_data_policy_v1` appears before external provider call;
- existing `service_authorize_ai_request` remains;
- provider call requires both policy and existing authorization;
- denied policy cannot call `callOpenAiCompatibleProvider`;
- embedded fallback remains reachable;
- learning evaluation occurs before `updateTrendCandidate` and stamps Phase C decision metadata;
- AI Companion intake uses the same project-learning policy and cannot bypass it;
- legacy evidence with no explicit learning authorization is excluded from new automatic learning;
- hard learning exclusion is passed from server-side product-mode state;
- Legal Eagle still writes `learning_eligible:false`;
- certified-memory retrieval remains unchanged;
- file-access gateway is not bypassed.

## Step 2 — Verify RED

Run:

`node --test --experimental-strip-types tests/unit/datanest-ai-trust-policy-source.test.mjs`

## Step 3 — Implement the adapter

Keep edge-function response semantics compatible. Add only useful non-sensitive policy status/reason fields if required by UI/debugging.

## Step 4 — Run existing DataNest AI focused tests

Run relevant existing DataNest AI source/unit tests plus the new Phase C test.

## Step 5 — Commit

Commit message:

`feat: enforce Phase C trust policy in DataNest AI`

---

# Task 5 — Governance Trust & Data Policy workspace

**Files**

- Create `src/lib/trustPolicy.ts`
- Create `src/components/TrustPolicyPanel.tsx`
- Create `tests/unit/trust-policy-ui-source.test.mjs`
- Modify `src/components/GovernanceWorkspace.tsx`
- Modify `src/components/DataNestApp.tsx`
- Modify `src/app/globals.css`

## Shared TypeScript domain

`src/lib/trustPolicy.ts` exports:

- `VisibilityClass`
- `ReuseState`
- `TrustEvidenceState`
- `ProviderTrustStatus`
- `RetentionDispositionIntent`
- `TrustPolicyRole`
- labels and ordering helpers;
- `canProposeTrustPolicy(role)`;
- `canApproveTrustPolicy(role)`.

Do not model policy as a single boolean consent flag.

`TrustPolicyPanel` props are exactly:

```ts
{
  projectId:string;
  currentUserId:string;
  role:TrustPolicyRole;
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
}
```

`GovernanceWorkspace` keeps its existing props and adds `role:TrustPolicyRole`.

## Governance integration

Preserve current default `?view=governance` behavior.

Add an internal governance section mode:

- `Sovereign Governance` (default existing UI)
- `Trust & Data Policy`

Deep link:

`?view=governance&section=trust`

Modify `DataNestApp` so `GovernanceWorkspace` receives the exact membership role in addition to existing `canManage`.

Do not create a new top-level navigation item in Phase C.

## TrustPolicyPanel read model

Load `get_trust_policy_workspace_v1` for the current project.

Display:

- active project Trust Manifest;
- evidence state and limitations;
- default visibility class;
- default reuse state;
- retention policy status;
- Provider Trust Profiles and review/expiry state;
- pending policy proposals;
- active retention holds;
- pending retention reviews;
- a clear statement that Phase C v1 performs no destructive retention action.

Use language that distinguishes:

- processing;
- reuse/learning;
- publication;
- retention review.

Do not imply that public visibility equals reusable/public-domain status.

## Governed actions

For operator/owner/admin as permitted:

- propose a data policy binding;
- request a retention review;
- create draft Trust Manifest evidence;
- create draft Provider Trust Profile evidence.

For owner/admin:

- approve/reject bindings;
- activate/reject Trust Manifest;
- activate/suspend/retire provider profile;
- propose/approve/reject retention policy;
- place/release hold;
- resolve retention review.

No UI exposes:

- delete data;
- anonymize existing data;
- purge staging;
- provider secret value;
- public trust publication.

Provider profile forms capture policy/evidence metadata only.

## UI safety copy

Show explicit warnings:

- "Processing permission does not grant learning or publication permission."
- "No destructive retention action is enabled in Phase C v1."
- "Provider credentials are managed outside Trust Profiles."
- "Planned/unknown controls are not verified trust guarantees."

## Step 1 — Write failing UI source tests

Assert:

- separate visibility and reuse controls exist;
- governance section deep link exists;
- role-gated approval controls exist;
- no delete/purge/anonymize control exists;
- provider profile does not request a credential;
- evidence state labels include verified/partial/planned/unknown;
- no target-state capability is represented as implemented by default;
- existing Sovereign Governance remains the default section.

## Step 2 — Verify RED

Run:

`node --test --experimental-strip-types tests/unit/trust-policy-ui-source.test.mjs`

## Step 3 — Implement shared types and panel

Use governed RPCs for every mutation.

## Step 4 — Integrate into Governance and styles

Preserve existing Governance tests and URLs.

## Step 5 — Verify GREEN

Run new UI test and existing governance/UI source tests.

## Step 6 — Commit

Commit message:

`feat: add Trust and Data Policy governance workspace`

---

# Task 6 — Browser coverage, architecture record, CI, and final Phase C verification

**Files**

- Create `tests/browser/trust-policy.spec.ts`
- Modify `.github/workflows/pr-verification.yml`
- Modify `docs/ARCHITECTURE.md`
- Modify existing compatibility tests only if fixture support is required

## Browser scenarios

Use the existing authenticated fixture/mocking style.

Test at least:

1. `?view=governance&section=trust` opens Trust & Data Policy while default Governance remains Sovereign Governance.
2. Viewer sees trust status but no mutation controls.
3. Operator can propose permitted policy/review work but cannot activate public/platform-learning/provider trust.
4. Owner/admin can activate reviewed policy through governed RPCs.
5. Visibility and reuse state are shown independently.
6. Provider with suspended/expired/missing trust state is visibly not approved for external routing; report-only state is visibly unresolved rather than falsely approved.
7. Legal Eagle or explicit hard learning exclusion remains non-learning even if the project manifest is broader.
8. Retention review shows holds/lineage blockers and no destructive action.
9. Planned/unknown Trust Manifest claims remain visibly non-verified.
10. 390x844 viewport has no document horizontal overflow.

## Compatibility assertions

Preserve:

- Products/RONSAS deep links;
- Phase B Portfolio Registry behavior;
- Product Lab evidence;
- billing-off copy;
- Transparency artifact behavior;
- existing Governance protocol/proposal/vote/dispute behavior;
- current DataNest AI Job/session flow;
- `authorize_datanest_ai_file_access`;
- certified-memory retrieval;
- provider budget/domain allowlist authorization.

## PR verification workflow

Add `tests/browser/trust-policy.spec.ts` to the browser verification list.

Do not remove existing suites.

## Architecture record

Only after code exists, add a concise Phase C section to `docs/ARCHITECTURE.md` stating:

- visibility/processing and reuse/learning are separate policy dimensions;
- Provider Trust Profiles constrain external provider use;
- Trust Manifests are versioned implemented-control summaries, not access grants;
- retention is policy-driven and Phase C v1 is non-destructive;
- existing RLS/RBAC, Job file access, and certified memory remain authoritative;
- Legal Eagle hard learning exclusion remains;
- Cloud-Nest, Supository, ILM, Resource Fabric and later concepts remain target-state.

Do not claim production promotion merely because source merged.

## Verification commands

Run focused Phase C source tests:

`node --test --experimental-strip-types tests/unit/trust-policy-schema-source.test.mjs tests/unit/retention-policy-source.test.mjs tests/unit/trust-policy-operations-source.test.mjs tests/unit/trust-policy-ui-source.test.mjs tests/unit/datanest-ai-trust-policy-source.test.mjs`

Run full unit suite:

`npm test`

Run TypeScript/check:

`npm run check`

Run production build:

`npm run build`

Run focused browser verification:

`npx playwright test tests/browser/trust-policy.spec.ts tests/browser/portfolio-registry.spec.ts tests/browser/products.spec.ts`

Run the repository's full PR browser verification suite.

Migration replay must pass all historical migrations plus:

1. `20260927113000_add_trust_policy_foundations.sql`
2. `20260927114000_add_retention_policy_foundations.sql`
3. `20260927115000_add_trust_policy_governed_operations.sql`

DataNest AI Certification must remain green.

Also run the existing external-AI return/source tests because Phase C now stamps AI Companion learning policy in `datanest-ai-intake`.

## Scope review

Before merge:

- run `git diff --check <PHASE_C_BASE>...HEAD`;
- inspect `git diff --name-only <PHASE_C_BASE>...HEAD`;
- confirm no unrelated billing, Sparks, product promotion, RONSAS runtime, deployment-target, Phase D-H, or repository-consolidation changes;
- confirm no historical migration rewrites;
- confirm no data deletion/anonymization executor exists;
- confirm no provider secret enters a trust table or UI;
- confirm no public trust page was added.

## Commit

Commit message:

`test: verify Phase C trust and data policy foundations`

---

# Implementation execution method after plan approval

1. Refresh `main` and confirm Phase B merge remains the baseline.
2. Create `feature/datanest-phase-c-trust-data-policy` from the approved design/plan branch after reconciling any newer `main` commits.
3. Open a draft PR to `main` titled:
   `Phase C: trust and data policy foundations`
4. Execute Tasks 1-6 in order using red/green tests.
5. Keep each task in a reviewable commit; do not batch unrelated cleanup.
6. Do not merge until migration replay, CI, PR browser verification, DataNest AI Certification, final scope review, and user-approved programme gate are satisfied.

# Final branch review checklist

Before requesting merge approval, verify:

- no trust policy bypasses RLS/RBAC/Job/file authorization;
- visibility and reuse remain independent fields and UI controls;
- no missing policy silently becomes external-provider permission;
- provider profiles cannot store credentials;
- Legal Eagle learning exclusion wins over all broader defaults;
- project-learning eligibility does not become certified memory automatically;
- certified memory does not become platform learning automatically;
- public visibility does not automatically become publicly reusable;
- Trust Manifest planned/unknown state is not represented as verified;
- retention is non-destructive in Phase C v1;
- active holds and unresolved lineage block future disposition;
- audit records contain references/decision metadata but not copied raw sensitive content;
- Phase B Portfolio Registry/Product Lab/Products still pass;
- RONSAS remains under Products;
- billing remains off;
- no Phase D-H target capability is implemented or marketed accidentally.

# Plan self-review

**Spec coverage:** Tasks 1-6 cover both policy dimensions, explicit subject bindings, Trust Manifests, Provider Trust Profiles, append-only policy decisions, retention policy/holds/reviews, minimal lineage, governed mutations, report-only-to-enforced rollout, fail-closed evaluation, DataNest AI + AI Companion provider/learning enforcement, Governance UX, audit events, and compatibility.

**Authority consistency:** The plan keeps RLS/RBAC and Job/file access above trust policy; service-role evaluation cannot manufacture user access. Provider trust narrows existing provider authorization rather than replacing it. Certified memory remains authoritative for reusable project knowledge.

**Retention safety:** There is no delete/anonymize executor. `delete_when_authorized` is only an intent value inside a future review record. Existing production/staging content is unchanged by Phase C migrations.

**Learning safety:** Legal Eagle and any authoritative `learning_eligible=false` input is a hard denial for learning. `project_learning_eligible` is eligibility only; certification remains a separate existing review path.

**Provider safety:** In `enforced` mode, missing, suspended, retired, expired, or insufficient Provider Trust Profile blocks external routing. In `report_only`, the decision is recorded but cannot override any existing denial; enforced activation is gated on complete current route coverage.

**Trust-claim safety:** Trust Manifests track `verified|partial|planned|unknown`; activation cannot turn planned target-state concepts into verified controls without evidence.

**Scope proportion:** The implementation is one bounded trust-policy vertical. It deliberately defers Authority Envelopes, Capability Leases, Resource Fabric, full Supository, ILM orchestration, public growth surfaces, and Outcome Ledger work to later phases.
