# DataNest Phase E — Resource and Capability Fabric Implementation Plan

**Date:** 2026-09-27  
**Branch:** `feature/datanest-phase-e-resource-capability-fabric`  
**Design:** `docs/superpowers/specs/2026-09-27-datanest-phase-e-resource-capability-fabric-design.md`

## Objective

Implement the approved Phase E Resource Fabric while preserving existing capability IDs, scheduler reservations, Phase D authorization, and Phase C trust boundaries.

## Task 1 — Pin source contracts before implementation

Create:

- `tests/unit/resource-fabric-schema-source.test.mjs`
- `tests/unit/resource-fabric-operations-source.test.mjs`
- `tests/unit/resource-fabric-ui-source.test.mjs`

Contracts must pin:

- Resource Registry kinds;
- Resource Project Binding lifecycle;
- capability `resource_id` compatibility link;
- append-only health observations;
- versioned sovereign-node policy;
- no credential fields;
- no interactive remote control;
- explicit RLS and grants;
- owner/admin mutation role gates;
- service-only health and candidate-resolution RPCs;
- capacity reservation / Capability Lease separation;
- Gantt remains TranScheduler default.

## Task 2 — Generate migration names with Supabase CLI

Use a temporary branch workflow that runs the repository's installed Supabase CLI:

```bash
supabase migration new add_resource_fabric_foundations
supabase migration new add_resource_fabric_governed_operations
```

Commit the generated files without inventing timestamps manually.

Remove the generator workflow after both files exist.

## Task 3 — Implement Resource Fabric foundations

In the first generated migration:

Create:

- `public.resource_registry`
- `public.resource_project_bindings`
- `public.resource_health_observations`
- `public.sovereign_node_policies`

Alter:

- `public.capabilities add column resource_id ...`

Add:

- foreign-key indexes;
- partial indexes for active bindings/policies;
- idempotency index for health traces;
- RLS;
- explicit SELECT grants for authenticated;
- service-role grants required for backend operations.

Backfill existing capability groups conservatively.

Do not delete or rename any existing capability/reservation rows.

## Task 4 — Implement private validation helpers

In the second generated migration create private helpers for:

- active project role lookup;
- resource/project binding validation;
- visibility-class validation;
- execution-operation validation;
- Resource candidate health/availability eligibility;
- sovereign-node schedule/policy validation;
- attributable Resource events.

Revoke execution from `PUBLIC`, `anon`, and `authenticated` unless a helper is intentionally exposed.

## Task 5 — Implement governed Resource RPCs

Create:

- `get_resource_fabric_workspace_v1`
- `register_project_resource_v1`
- `set_resource_project_binding_state_v1`
- `upsert_sovereign_node_policy_v1`
- `service_record_resource_health_v1`
- `service_resolve_resource_candidates_v1`

Requirements:

- owner/admin for supply-side mutation;
- service-role only for health ingestion and candidate resolution;
- no direct browser writes to Resource tables;
- idempotent health trace;
- no deletion;
- no billing;
- no credential parameters;
- no remote-control capability.

## Task 6 — Preserve scheduler and Phase D compatibility

Verify:

- `jobs.required_capabilities` is unchanged;
- `reservations.capability_id` is unchanged;
- `capability_leases.capability_id` is unchanged;
- `service_authorize_execution_v1` is not weakened;
- human `transition_job_status` is not replaced;
- existing capability reads continue to work.

The Resource candidate resolver is an additional prerequisite, not an authority grant.

## Task 7 — Add shared TypeScript Resource Fabric contract

Create:

- `src/lib/resourceFabric.ts`

Include:

- resource kinds;
- trust levels;
- health statuses;
- binding states;
- visibility classes;
- role helpers;
- labels/descriptions;
- display helpers.

No secret types or remote-control primitives.

## Task 8 — Build Resource Fabric panel

Create:

- `src/components/ResourceFabricPanel.tsx`

Read via:

- `get_resource_fabric_workspace_v1`

Mutate only via:

- `register_project_resource_v1`
- `set_resource_project_binding_state_v1`
- `upsert_sovereign_node_policy_v1`

UI requirements:

- explicit “Registration ≠ remote control” boundary;
- explicit “Resource match ≠ reservation ≠ Capability Lease” boundary;
- health evidence read-only;
- owner/admin mutation controls;
- operator/viewer read-only;
- no credentials;
- no remote shell fields;
- no billing action.

## Task 9 — Integrate into TranScheduler

Modify:

- `src/components/DataNestApp.tsx`

Change scheduler mode type to:

```ts
"queue" | "gantt" | "authority" | "resources"
```

Add sibling button:

- `Resource Fabric`

Keep:

- `"gantt"` as default;
- Queue/Gantt human controls unchanged;
- Authority & Execution unchanged.

## Task 10 — Responsive styling

Modify:

- `src/app/globals.css`

Add Resource Fabric cards, boundary strips, health evidence layout, and mobile single-column fallback.

No horizontal page overflow at 390px.

## Task 11 — Browser coverage

Create:

- `tests/browser/resource-fabric.spec.ts`

Fixture cases:

1. Gantt remains default.
2. Viewer sees resources/health but no mutation controls.
3. Operator sees Resource Fabric but cannot register/suspend/policy-edit.
4. Owner can register and manage Resource Project Binding.
5. Local-node policy visibly forbids interactive remote control.
6. Resource health evidence is read-only.
7. Mobile viewport has no horizontal page overflow.

Add the browser spec to PR Verification.

## Task 12 — Architecture documentation

Update:

- `docs/ARCHITECTURE.md`

Record:

- Resource Registry;
- Resource Project Bindings;
- capability compatibility link;
- health evidence;
- sovereign-node boundary;
- resolver is not reservation/authorization;
- local nodes remain optional.

Mark Phase F and later concepts as target-state.

## Task 13 — Supabase verification

Run/require:

- fresh migration replay;
- Security Advisor review where available;
- explicit-grant review;
- function `EXECUTE` privilege review;
- RLS review.

Any new public table without RLS or explicit grants blocks merge.

## Task 14 — Draft PR and exact-head gates

Open draft PR:

**Phase E: resource and capability fabric**

Required exact-head gates:

- CI
- Migration Replay Validation
- PR Verification
- Edge Function Validation
- DataNest AI Certification

The PR remains draft until all required gates pass.

## Task 15 — Merge gate

Before merge:

1. Verify PR head SHA.
2. Verify all required workflow runs are success for that exact SHA.
3. Verify no unresolved review threads.
4. Verify PR remains mergeable.
5. Mark ready for review.
6. Re-fetch PR and confirm head SHA again.
7. Merge with `expected_head_sha`.

After merge:

- record the merge commit;
- confirm PR closed/merged;
- confirm `main` contains the merge;
- advance programme state to Phase F only after the merge is confirmed.


## Verification retrigger note

The first exact-head certification attempt after the Phase E browser fixes was cancelled by workflow concurrency before a certification job was created, while the immediately preceding certification run was still active. Runtime/schema implementation is unchanged by this note. A fresh exact-head gate set is required so DataNest AI Certification can complete on the same commit as CI, migration replay, PR verification, and Edge Function Validation.

**Gate retrigger:** workflow concurrency has cleared. This documentation-only update intentionally starts a fresh exact-head verification cycle; it does not change Phase E runtime, schema, authority, health, resolver, scheduler, or UI behavior.
