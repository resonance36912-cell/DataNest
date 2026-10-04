# DataNest Phase F — Intelligence Fabric and ILM-1 Design

**Date:** 2026-09-27  
**Status:** Approved programme implementation design  
**Programme:** DataNest ecosystem business operating architecture  
**Phase:** F — Intelligence Fabric  
**Branch:** `feature/datanest-phase-f-intelligence-fabric`  
**Verified base:** Phase E merge commit `5e829aebcf42fe3e749d79649e1450b3b818a0d2` on `main`  
**Parent authority:** `docs/superpowers/specs/2026-09-27-datanest-ecosystem-business-operating-architecture-design.md`

## 1. Purpose

Phase F implements the master architecture's Intelligence Fabric while preserving the governed DataNest AI, memory, provider, trust, authority, and resource systems already in production.

The phase introduces **ILM-1** as DataNest's governed intelligence abstraction over approved:

- certified memory;
- model/provider routes;
- Resource Fabric capabilities;
- tools;
- agents;
- evaluation evidence; and
- existing authority and data-policy controls.

ILM-1 is **not** a claim that DataNest has trained a proprietary foundation model. Phase F v1 does not train or fine-tune foundation-model weights.

## 2. Existing authority preserved

Phase F extends but does not replace:

- `public.certified_memory` as project-wide reusable governed memory;
- the persistent staging intake/certification pipeline for uncertified evidence;
- `public.ai_usage_requests` as request/idempotency/usage authority;
- current DataNest AI reasoning envelopes and staging trace lineage;
- `public.ai_provider_connections` and `service_get_ai_provider_connection_v3(...)` for provider credentials/routing;
- Phase C Trust & Data Policy as the processing/visibility prerequisite;
- Phase D Authority Envelopes, Capability Leases and execution authorization;
- Phase E Resource Registry, capability identities, health observations and candidate resolution;
- `tool_registry` as the project tool registry;
- Think Tank learning candidates and review/promotion boundaries;
- current RLS/RBAC, certification, audit and release gates.

An ILM-1 route does not itself grant data permission, reserve capacity, create a Capability Lease, authorize side effects, certify memory, or expose provider credentials.

## 3. ILM-1 definition

ILM-1 is the first governed DataNest intelligence composition layer.

It answers the operational question:

> For this authorized project/Job request, which approved memory, model/provider route, tools, agents and Resource Fabric capabilities are eligible, why were they selected, and what evidence shows the route remains fit for the declared purpose?

ILM-1 must remain provider-agnostic at product identity level.

The end-user identity remains **DataNest AI**. Provider/model identity may be shown as operational provenance, not as the product identity.

## 4. Route order

Phase F v1 composes existing gates in this order:

1. authenticate project/Job/user identity;
2. resolve declared purpose and effective visibility class;
3. retrieve certified project memory only through existing governed memory access;
4. evaluate Phase C Trust & Data Policy;
5. resolve Phase E resource/capability candidates;
6. resolve approved provider/model connection when an external/provider-backed route is required;
7. assemble the ILM-1 route envelope;
8. record an append-only route decision;
9. execute only through the existing DataNest AI/provider path;
10. record evaluation/capability evidence after the result is available;
11. require Phase D authorization separately before any side effect requiring execution authority.

Failure of any prerequisite must fail closed or return `review_required`.

## 5. New data model

### 5.1 `public.ilm_profiles`

Project-scoped, versioned ILM-1 operating profile.

Fields:

- `id uuid primary key`
- `project_id uuid not null`
- `version integer not null`
- `status text not null`
- `profile_key text not null`
- `display_name text not null`
- `allowed_purposes text[] not null`
- `default_capability text not null`
- `allowed_resource_kinds text[] not null`
- `memory_policy jsonb not null`
- `routing_policy jsonb not null`
- `evaluation_policy jsonb not null`
- `metadata jsonb not null`
- `created_by uuid not null`
- `approved_by uuid null`
- `approved_at timestamptz null`
- `supersedes_profile_id uuid null`
- `created_at timestamptz not null`

Statuses:

- `draft`
- `active`
- `suspended`
- `superseded`
- `retired`

Only one active ILM-1 profile is permitted per project/profile key.

No profile stores credentials, prompts containing secrets, raw staging content, or hidden chain-of-thought.

### 5.2 `public.intelligence_route_decisions`

Append-only operational evidence for ILM-1 routing.

Fields include:

- `id uuid primary key`
- `project_id uuid not null`
- optional `job_id uuid`
- optional `ai_usage_request_id uuid`
- `trace_id text not null`
- `profile_id uuid not null`
- `profile_version integer not null`
- `purpose text not null`
- `visibility_class text not null`
- `requested_operation text not null`
- `requested_capability text not null`
- `certified_memory_ids uuid[] not null`
- optional `resource_id uuid`
- optional `capability_id uuid`
- optional `provider_connection_id uuid`
- optional `provider_key text`
- optional `model_label text`
- `route_kind text not null`
- `decision text not null`
- `reason_codes text[] not null`
- `policy_evidence jsonb not null`
- `resource_evidence jsonb not null`
- `created_at timestamptz not null`

Route kinds:

- `provider_model`
- `local_model`
- `managed_model`
- `tool_agent`
- `memory_only`

Decisions:

- `selected`
- `rejected`
- `review_required`

The table stores references and evidence, never decrypted provider secrets.

### 5.3 `public.intelligence_evaluation_runs`

Append-only evaluation evidence associated with a route decision.

Fields include:

- `id uuid primary key`
- `project_id uuid not null`
- `route_decision_id uuid not null`
- `evaluation_key text not null`
- `evaluation_version text not null`
- `evaluator_kind text not null`
- `status text not null`
- `dimensions jsonb not null`
- `findings jsonb not null`
- optional `evidence_reference text`
- `trace_id text not null`
- `evaluated_at timestamptz not null`
- `created_at timestamptz not null`

Evaluator kinds:

- `deterministic`
- `policy`
- `human_review`
- `certification_suite`

Statuses:

- `passed`
- `failed`
- `review_required`

Evaluation evidence must not present hidden model chain-of-thought.

### 5.4 `public.intelligence_capability_evidence`

Append-only evidence connecting a Resource Fabric capability to observed ILM-1 fitness for a declared purpose.

Fields include:

- `id uuid primary key`
- `project_id uuid not null`
- `resource_id uuid not null`
- `capability_id uuid not null`
- optional `route_decision_id uuid`
- optional `evaluation_run_id uuid`
- `purpose text not null`
- `evidence_kind text not null`
- `status text not null`
- `metrics jsonb not null`
- optional `evidence_reference text`
- `trace_id text not null`
- `observed_at timestamptz not null`
- `created_at timestamptz not null`

Evidence kinds:

- `route_result`
- `evaluation`
- `certification`
- `operator_review`

Statuses:

- `supported`
- `degraded`
- `unsupported`
- `unknown`

This evidence supplements Phase E health; it does not replace current health state or authorization.

## 6. Route envelope

The ILM-1 route envelope contains only operationally necessary provenance:

- project/Job/request/trace identity;
- active ILM profile/version;
- declared purpose;
- effective visibility class;
- requested capability/operation;
- certified-memory IDs selected;
- Phase C policy decision/reference;
- Phase E resource candidate decision/reference;
- selected resource/capability identity when applicable;
- provider connection ID/provider/model label when applicable;
- applicable evaluation profile/version;
- route decision/reason codes.

It does **not** contain private model chain-of-thought, decrypted credentials, or unrestricted raw staging evidence.

## 7. ILM-1 runtime contract

Create a shared server-side runtime contract, target file:

`supabase/functions/_shared/ilm.ts`

The runtime composes dependencies rather than duplicating their policy.

Target service interface:

`resolveIlm1Route(...)`

Dependencies should include adapters for:

- governed certified-memory retrieval;
- Phase C data-policy evaluation;
- Phase E resource candidate resolution;
- approved provider connection resolution;
- append-only route-decision recording.

The shared runtime must remain unit-testable with injected dependencies.

It may return:

- `selected`
- `rejected`
- `review_required`

A selected route still does not authorize a side effect.

## 8. Governed database operations

Authenticated governed RPCs:

### `get_intelligence_fabric_workspace_v1(target_project)`

Returns:

- active/draft ILM profiles;
- recent route decisions;
- recent evaluations;
- capability evidence;
- certified-memory count and references;
- Resource Fabric linkage summary;
- caller role/action permissions;
- explicit ILM-1 non-training boundary.

### `upsert_ilm_profile_v1(...)`

Owner/admin only.

Creates a new profile version instead of rewriting history.

It must reject:

- unsupported purpose/resource vocabulary;
- credential-like payload fields;
- raw prompts or raw staging content;
- any claim/configuration indicating model training as a Phase F v1 feature.

Service-only RPCs:

### `service_record_intelligence_route_v1(...)`

Append-only/idempotent route evidence.

### `service_record_intelligence_evaluation_v1(...)`

Append-only/idempotent evaluation evidence.

### `service_record_intelligence_capability_evidence_v1(...)`

Append-only/idempotent capability evidence.

Service-only functions are revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`.

## 9. Routing policy

Phase F routing must preserve these rules:

- uncertified staging evidence remains current-Job/session only;
- certified memory may be project-wide;
- `local_only` visibility cannot route to a managed/external provider;
- external/provider-backed routes require the Phase C trust/data-policy decision;
- Resource Fabric `unknown`/unhealthy/ineligible state cannot be converted into an eligible ILM route;
- provider credentials remain server-side;
- a route is rejected when provider/resource identity does not match declared project/purpose;
- missing required evidence produces `review_required` or rejection;
- evaluation evidence cannot silently convert a failed policy decision into an allowed route.

## 10. Evaluation policy

Phase F v1 records evidence; it does not create a self-modifying AI system.

Evaluation dimensions may include:

- policy compliance;
- route success/failure;
- response completeness;
- provenance completeness;
- latency;
- token/usage metadata;
- capability fit;
- citation/evidence completeness where applicable.

Evaluation scores or metrics must preserve:

- definition;
- scope;
- evaluator version;
- completeness state;
- evidence reference.

A passing evaluation does not certify new memory automatically unless the existing governed-memory certification policy separately permits that promotion.

## 11. Learning boundary

ILM-1 can use certified memory and can generate evidence for future learning candidates.

ILM-1 does not:

- directly write raw outputs into `certified_memory`;
- bypass staging/certification;
- mutate foundation-model weights;
- claim continuous weight training;
- expose hidden chain-of-thought;
- treat provider/model output as project truth without certification.

Think Tank learning candidates remain governed proposals and can continue promoting to certified memory only through their existing review/certification boundary.

## 12. UI

Add an **Intelligence Fabric** panel to the DataNest AI workspace.

The panel should show:

- ILM-1 identity and active profile/version;
- explicit **“ILM-1 = governed orchestration, not a trained foundation model”** boundary;
- active routing policy summary;
- recent route decisions with purpose, resource/provider provenance and reason codes;
- evaluation evidence;
- capability evidence;
- certified-memory and Resource Fabric linkage;
- clear separation among memory, routing, health, authorization and evaluation.

Owner/admin controls:

- create/activate/suspend a new ILM profile version.

Operator/viewer:

- read only.

The browser does not:

- resolve provider secrets;
- ingest service evaluation evidence;
- create route decisions;
- mark capability evidence supported;
- bypass Phase C/D/E gates.

## 13. RLS and grants

Every new public table uses project-scoped RLS.

Authenticated clients receive SELECT only.

All mutations use governed RPCs.

Service evidence RPCs are service-role only.

Security-definer functions use pinned search paths, explicit caller checks, same-project validation and attributable events.

## 14. Compatibility

Phase F must preserve:

- existing certified-memory IDs and promotion semantics;
- existing DataNest AI session/intake/staging behavior;
- `ai_usage_requests` idempotency;
- current provider connection and credential storage;
- Phase C data policy and provider trust;
- Phase D execution authority;
- Phase E Resource Fabric health/capability identities;
- Think Tank learning/certification;
- DataNest AI product identity;
- Gantt/TranScheduler behavior;
- GitHub Pages/static deployment;
- billing-off state.

No historical migration is rewritten.

## 15. Non-goals

Phase F does not implement:

- foundation-model training or fine-tuning;
- a proprietary base-model claim;
- hidden chain-of-thought storage/exposure;
- unrestricted autonomous agents;
- generic remote computer control;
- a new credential vault;
- replacement of certified memory;
- replacement of provider trust;
- replacement of Resource Fabric;
- replacement of Phase D authority;
- automatic certification of arbitrary outputs;
- billing, tokenization or Sparks monetization;
- Phase G public growth surfaces;
- Phase H Outcome Ledger or Shadow Economics.

## 16. Acceptance criteria

Phase F v1 is complete only when evidence shows:

1. ILM-1 is represented as a versioned governed project intelligence profile;
2. ILM-1 composes existing certified memory, provider policy and Resource Fabric rather than duplicating them;
3. route decisions are append-only, attributable and idempotent;
4. evaluation evidence is append-only and versioned;
5. capability evidence links back to Phase E resource/capability identity;
6. provider secrets never enter Intelligence Fabric tables or browser payloads;
7. uncertified evidence remains current-session/Job only;
8. local-only data cannot route externally;
9. failed Phase C/Phase E prerequisites cannot become a selected route;
10. ILM route selection does not reserve capacity, create Capability Leases or authorize execution;
11. no ILM-1 code or UI claims foundation-model training;
12. certified memory promotion remains separately governed;
13. browser UI is read-only for route/evaluation/capability evidence;
14. owner/admin profile mutation is governed and versioned;
15. RLS/grants and service-only evidence RPCs pass security review;
16. exact-head CI, migration replay, PR verification, Edge validation and DataNest AI certification pass;
17. Phase G remains future work.

## 17. Execution boundary

This design authorizes Phase F implementation under the established phased programme.

Implementation must proceed test-first on the Phase F branch, remain additive, keep the PR draft until exact-head verification is green, and avoid any statement that ILM-1 is a proprietary trained foundation model unless a separate governed training programme is later implemented and evidenced.
