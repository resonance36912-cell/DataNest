# DataNest Phase E — Resource and Capability Fabric Design

**Date:** 2026-09-27  
**Status:** Approved programme implementation design  
**Programme:** DataNest ecosystem business operating architecture  
**Phase:** E — Resource and capability fabric

## 1. Purpose

Phase E implements the Resource Fabric foundation defined by the approved DataNest ecosystem architecture.

The Resource Fabric must generalize the existing project-scoped `capabilities` inventory so DataNest can represent and reason about:

- local sovereign nodes;
- cloud workers;
- GPUs and accelerator-backed runtimes;
- browser runtimes;
- model endpoints;
- storage endpoints;
- APIs and external services;
- agent runtimes;
- product capabilities; and
- optional human specialist capability.

The implementation must preserve the current scheduler and authority boundaries rather than replacing them.

## 2. Existing authority that remains intact

The following remain authoritative after Phase E:

1. **`capabilities` remains the scheduler-facing executable capability unit.**
   - Existing IDs remain stable.
   - Existing `jobs.required_capabilities`, `reservations.capability_id`, Phase D `capability_leases.capability_id`, and execution decision history remain valid.
2. **TranScheduler reservations remain capacity reservations.**
3. **Phase D Capability Leases remain execution authorization.**
4. **Phase C Trust & Data Policy remains the data-processing / visibility prerequisite.**
5. **Project membership, RLS, Job collaboration, provider authorization, and AI budgets remain independent controls.**
6. **Human Pause / Resume / Cancel remains a separate attributable control path.**

A Resource Fabric match does not itself reserve capacity, authorize execution, grant data access, or approve a provider.

## 3. Supabase platform constraints

Current Supabase guidance requires explicit attention to two platform changes:

- new public-schema tables may no longer be automatically exposed through the Data API, so Phase E migrations must use explicit table grants;
- RLS and grants are separate controls, and every public table exposed to authenticated clients must have RLS enabled;
- database functions are executable by `PUBLIC` by default unless explicitly revoked;
- privileged functions must have a pinned search path and narrowly scoped `EXECUTE` grants.

Phase E therefore uses explicit grants and explicit function revocation for every new table and RPC.

No Phase E design depends on Supabase Realtime. This avoids making resource-state correctness depend on websocket delivery or the protected `realtime` schema.

## 4. Design goals

Phase E must:

- model a resource independently from the capability it exposes;
- let one resource expose multiple existing `capabilities`;
- let a resource be explicitly bound to one or more projects;
- keep resource identity separate from machine name;
- represent trust, privacy suitability, coarse location, cost metadata, health, and limits;
- preserve append-only health evidence;
- provide a fail-closed service-side candidate resolver;
- represent sovereign-node policy as bounded capability participation, not unrestricted remote control;
- keep local-node participation optional;
- expose a readable TranScheduler Resource Fabric workspace;
- preserve current compatibility for legacy capabilities and existing jobs.

## 5. Non-goals

Phase E does **not**:

- install agents on local computers;
- open remote shells, RDP, VNC, browser sessions, or unrestricted command channels;
- discover local machines automatically;
- store reusable operating-system credentials;
- replace Phase D Authority Envelopes or Capability Leases;
- replace TranScheduler reservations;
- replace Phase C trust / privacy policy;
- implement Cloud-Nest;
- implement Supository;
- implement ILM-1;
- implement billing, charging, wallets, or payment settlement;
- claim a node is healthy merely because it was registered;
- make any local node a production dependency.

## 6. Core terminology

### 6.1 Resource

A **Resource** is a canonical supply-side execution or specialist entity.

A resource is not a Job, not a capability permission, and not a reservation.

Supported Phase E v1 kinds:

- `local_node`
- `cloud_worker`
- `gpu_runtime`
- `browser_runtime`
- `model_endpoint`
- `storage_endpoint`
- `api_endpoint`
- `external_service`
- `agent_runtime`
- `product_capability`
- `human_specialist`

### 6.2 Resource Project Binding

A **Resource Project Binding** is the explicit project participation record for a Resource.

This is the allowed-project boundary. A globally registered resource is not usable by a project merely because it exists.

### 6.3 Capability

A **Capability** remains the existing project-scoped scheduler unit in `public.capabilities`.

Phase E adds `resource_id` to `capabilities`. This makes the relationship:

```
Resource
  └─ Project Binding
       └─ Capability rows
            ├─ Reservation      (capacity)
            └─ Capability Lease (authorization)
```

### 6.4 Resource Health Observation

A **Resource Health Observation** is append-only evidence of a resource/capability health measurement.

The latest summarized state may be cached on the Resource, but history is never rewritten to create a false healthy past.

### 6.5 Sovereign Node Policy

A **Sovereign Node Policy** is a versioned project/resource policy for a `local_node`.

It constrains:

- allowed capability categories;
- resource ceilings;
- schedules;
- allowed data visibility classes;
- data scope;
- prohibited execution operations;
- network policy metadata.

Registration does not imply remote-control permission.

## 7. Data model

### 7.1 `public.resource_registry`

Canonical resource identity.

Fields:

- `id uuid primary key`
- `resource_key text unique not null`
- `resource_kind text not null`
- `display_name text not null`
- `owner_kind text not null`
- `owner_user_id uuid null references auth.users`
- `owner_label text null`
- `trust_level text not null`
- `location_class text not null`
- `region_hint text null`
- `supported_visibility_classes text[] not null`
- `cost_profile jsonb not null`
- `limits jsonb not null`
- `health_status text not null`
- `health_summary jsonb not null`
- `enabled boolean not null`
- `last_seen_at timestamptz null`
- `metadata jsonb not null`
- `created_by uuid not null references auth.users`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`region_hint` is deliberately coarse. Phase E does not collect precise street-level node location.

Trust levels:

- `unknown`
- `declared`
- `verified`
- `governed`

Health statuses:

- `unknown`
- `healthy`
- `degraded`
- `unhealthy`

Visibility classes reuse Phase C vocabulary:

- `public`
- `nest_private`
- `project_restricted`
- `organization_restricted`
- `high_sensitivity`
- `local_only`

Cost metadata is informational scheduler metadata only. It does not enable billing or charging.

### 7.2 `public.resource_project_bindings`

Fields:

- `id uuid primary key`
- `project_id uuid not null references projects`
- `resource_id uuid not null references resource_registry`
- `resource_alias text null`
- `status text not null`
- `allowed_capabilities text[] not null`
- `created_by uuid not null references auth.users`
- `approved_by uuid null references auth.users`
- `approved_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Status:

- `proposed`
- `active`
- `suspended`
- `retired`

A resource can participate in multiple projects only through separate explicit bindings.

### 7.3 `public.capabilities` extension

Add:

- `resource_id uuid null references resource_registry(id) on delete set null`

Existing capability IDs and existing uniqueness constraints remain unchanged.

Phase E does not rename or replace `account_key`, `connector_kind`, `state`, `concurrency_limit`, or `running`.

### 7.4 `public.resource_health_observations`

Append-only evidence.

Fields:

- `id uuid primary key`
- `project_id uuid not null`
- `resource_id uuid not null`
- `capability_id uuid null`
- `health_status text not null`
- `observed_availability text null`
- `source_kind text not null`
- `source_key text not null`
- `metrics jsonb not null`
- `evidence_reference text null`
- `trace_id text not null`
- `observed_at timestamptz not null`
- `created_at timestamptz not null`

A project/resource/trace combination is idempotent.

When a trusted service records an observation, it may update the Resource health summary and, when a capability is supplied, the existing capability availability fields. The observation remains immutable.

### 7.5 `public.sovereign_node_policies`

Versioned local-node policy.

Fields:

- `id uuid primary key`
- `project_id uuid not null`
- `resource_id uuid not null`
- `version integer not null`
- `status text not null`
- `allowed_capabilities text[] not null`
- `resource_ceiling jsonb not null`
- `schedule_policy jsonb not null`
- `allowed_visibility_classes text[] not null`
- `data_scope jsonb not null`
- `prohibited_operations text[] not null`
- `network_policy jsonb not null`
- `interactive_remote_control boolean not null default false`
- `created_by uuid not null`
- `approved_by uuid null`
- `approved_at timestamptz null`
- `supersedes_policy_id uuid null`
- `created_at timestamptz not null`

Phase E v1 enforces `interactive_remote_control=false`.

Active policy is allowed only when:

- the resource kind is `local_node`;
- the project/resource binding is active;
- the policy has at least one allowed capability;
- visibility classes are valid Phase C classes;
- prohibited operations are valid Phase D execution operations.

## 8. Legacy capability backfill

Phase E must preserve the existing capability inventory.

For each distinct existing `(project_id, account_key, connector_kind)` group:

1. create one Resource Registry record with a deterministic legacy resource key;
2. create an active Resource Project Binding for the existing project;
3. link the existing capability rows to that Resource.

Backfilled resources must use system provenance (`created_source='system_backfill'`, `created_by=null`) because migration replay has no authenticated human actor. Backfilled resources must use conservative metadata:

- `trust_level='unknown'`;
- `health_status='unknown'`;
- `location_class='unknown'`;
- no precise region;
- no implied sovereign-node status.

Backfill must not infer that a current account key is a physical computer.

## 9. Access model

### 9.1 Read access

Authenticated users may read Resource Fabric records only when they have existing project access through an associated Resource Project Binding.

This includes the existing project-access model for members, stakeholders, and accepted collaborators.

### 9.2 Mutation access

Owner/admin:

- register a Resource for a project;
- update non-secret Resource metadata;
- activate/suspend/retire a Resource Project Binding;
- create/activate/suspend a Sovereign Node Policy.

Operator:

- read and route work;
- cannot create supply-side trust or sovereign-node policy.

Viewer/stakeholder/collaborator:

- read only.

Service role:

- record health observations;
- update summarized health state;
- resolve resource candidates.

No new table permits direct authenticated client writes.

## 10. Governed RPCs

### 10.1 `get_resource_fabric_workspace_v1(target_project)`

Authenticated read RPC.

Returns:

- project-bound resources;
- capability rows grouped by Resource;
- latest health summary;
- recent health observations;
- active/draft sovereign-node policy metadata;
- caller role and action permissions;
- explicit boundary flags.

### 10.2 `register_project_resource_v1(...)`

Owner/admin only.

Creates:

- Resource Registry record;
- active project binding;
- attributable `RESOURCE_REGISTERED` event.

It must reject credential-like fields and must not accept arbitrary reusable secrets.

### 10.3 `set_resource_project_binding_state_v1(...)`

Owner/admin only.

Supports:

- `active`
- `suspended`
- `retired`

Suspending/retiring a binding does not delete Resource history.

### 10.4 `upsert_sovereign_node_policy_v1(...)`

Owner/admin only.

Creates a new version instead of rewriting previous policy history.

It must fail if:

- Resource is not `local_node`;
- project binding is not active;
- remote-control flag is requested;
- policy visibility or operation values are invalid.

### 10.5 `service_record_resource_health_v1(...)`

Service role only.

Behavior:

- validate active project/resource binding;
- validate capability belongs to the same project/resource when supplied;
- idempotently append health observation;
- update Resource health summary / last-seen timestamp;
- optionally update capability state / observed timestamp;
- emit `RESOURCE_HEALTH_OBSERVED`.

### 10.6 `service_resolve_resource_candidates_v1(...)`

Service role only.

Inputs include:

- project;
- requested capability;
- requested operation;
- effective visibility class.

Candidate filtering is fail-closed:

- project binding must be active;
- resource must be enabled;
- resource health must not be unknown/unhealthy;
- required visibility class must be supported;
- capability must be enabled;
- capability state must be scheduler-eligible;
- concurrency must remain;
- active sovereign-node policy, when applicable, must permit the capability, operation, schedule and visibility class.

The resolver returns candidates and reasons. It does not create a reservation or Capability Lease.

## 11. Scheduler contract

TranScheduler continues matching on **capability**, not machine name.

Phase E Resource resolution order:

```
Job.required_capabilities
        ↓
Resource candidate resolver
        ↓
project-bound Resource + capability
        ↓
capacity reservation
        ↓
Phase D Capability Lease
        ↓
Phase C / provider / file / AI gates
        ↓
execution
```

No single step substitutes for another.

## 12. Sovereign-node boundary

A local computer may be registered as a `local_node`, but Phase E v1 only records its participation policy.

The system does not:

- open ports;
- install an agent;
- execute local shell commands;
- assume the computer is online;
- require the computer for production availability.

A future local execution agent must authenticate separately and submit service health/claim requests through a stable contract. That future agent remains outside Phase E v1.

## 13. UI design

TranScheduler gains a fourth sibling mode:

- Queue
- Gantt chart
- Authority & Execution
- Resource Fabric

Gantt remains the default.

The Resource Fabric mode shows:

- resource kind;
- display name / project alias;
- trust level;
- coarse location class;
- health;
- supported visibility classes;
- informational cost profile;
- limits;
- bound capabilities and availability;
- recent health evidence;
- sovereign-node policy state where applicable.

Owner/admin controls:

- Register Resource
- Suspend / reactivate / retire project binding
- Create new Sovereign Node Policy version

There is no:

- “remote control” button;
- credential field;
- shell command field;
- billing action;
- manual “mark healthy” client mutation.

Health evidence is read-only in the browser.

## 14. Security invariants

1. Every new public table has RLS enabled.
2. New tables use explicit grants because Data API auto-exposure is no longer assumed.
3. Authenticated clients receive SELECT only on Resource Fabric tables.
4. Mutations happen through narrowly granted RPCs.
5. Service health/resolution RPCs are service-role only.
6. Every new privileged function revokes default `PUBLIC` execution.
7. Privileged functions use a pinned search path and schema-qualified relations.
8. No Resource table stores reusable credentials.
9. Resource registration does not imply trust verification.
10. Unknown health remains fail-closed for automatic candidate resolution.
11. Local-node registration never implies interactive remote control.
12. Resource match never implies capacity reservation or execution authorization.

## 15. Migration strategy

Phase E uses CLI-generated Supabase migration names only.

Planned migrations:

1. Resource Fabric foundations + compatibility backfill.
2. Governed Resource Fabric operations + resolver.

Migration replay must pass from a fresh database.

No destructive migration is permitted.

## 16. Verification

Required exact-head gates:

- source-contract unit tests;
- `npm test`;
- `npm run check`;
- production static build;
- provider-agnostic container build;
- fresh Supabase migration replay;
- browser fixture coverage for viewer/operator/owner;
- mobile no-overflow verification;
- Edge Function Validation;
- DataNest AI Certification.

## 17. Exit criteria

Phase E is complete when:

- every existing capability is preserved and can be linked to a Resource;
- Resource/project binding is explicit;
- health history is append-only;
- service candidate resolution is fail-closed and capability-based;
- sovereign-node policy is bounded and non-remote-control;
- TranScheduler exposes Resource Fabric without changing Gantt default;
- all required exact-head gates pass;
- the Phase E PR is merged to `main`.

Phase F remains outside this phase.
