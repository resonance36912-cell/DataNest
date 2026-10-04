# DataNest Phase F — Intelligence Fabric and ILM-1 Implementation Plan

**Date:** 2026-09-27  
**Branch:** `feature/datanest-phase-f-intelligence-fabric`  
**Design:** `docs/superpowers/specs/2026-09-27-datanest-phase-f-intelligence-fabric-design.md`

## Objective

Implement Phase F Intelligence Fabric and ILM-1 as a governed orchestration layer over existing certified memory, provider policy, Resource Fabric capabilities, tools and agents, with append-only routing/evaluation/capability evidence and no foundation-model-training claim.

## Task 1 — Pin source contracts first

Create:

- `tests/unit/intelligence-fabric-schema-source.test.mjs`
- `tests/unit/intelligence-fabric-operations-source.test.mjs`
- `tests/unit/intelligence-fabric-runtime-source.test.mjs`
- `tests/unit/intelligence-fabric-ui-source.test.mjs`

Pin:

- versioned `ilm_profiles`;
- append-only route/evaluation/capability evidence;
- no credential or raw-staging fields;
- no training claims;
- service-only evidence writes;
- Phase C/D/E separation;
- certified-memory compatibility;
- browser evidence read-only;
- ILM-1 orchestration boundary.

## Task 2 — Generate migration names with Supabase CLI

Use a one-shot branch workflow with repository-pinned Supabase CLI:

```bash
supabase migration new add_intelligence_fabric_foundations
supabase migration new add_intelligence_fabric_governed_operations
```

Remove the generator after the migration files exist.

## Task 3 — Intelligence Fabric foundations

First migration creates:

- `public.ilm_profiles`
- `public.intelligence_route_decisions`
- `public.intelligence_evaluation_runs`
- `public.intelligence_capability_evidence`

Add:

- FK/index coverage;
- one-active-profile constraint;
- trace/idempotency indexes;
- RLS;
- authenticated SELECT-only grants;
- service-role grants needed by governed RPCs.

Do not alter or recreate `certified_memory`, `ai_usage_requests`, provider credentials, Resource Fabric or Capability Leases.

## Task 4 — Governed operations

Second migration creates private validation/event helpers and:

- `get_intelligence_fabric_workspace_v1`
- `upsert_ilm_profile_v1`
- `service_record_intelligence_route_v1`
- `service_record_intelligence_evaluation_v1`
- `service_record_intelligence_capability_evidence_v1`

Requirements:

- owner/admin profile versioning;
- service-only evidence ingestion;
- same-project FK/identity validation;
- credential/raw-content rejection;
- no deletion;
- no execution authorization;
- attributable events.

## Task 5 — Shared ILM-1 runtime

Create:

- `supabase/functions/_shared/ilm.ts`

Implement an injected-dependency `resolveIlm1Route(...)` composition contract.

Order:

1. certified memory;
2. Phase C policy;
3. Phase E resource candidate resolution;
4. approved provider connection when needed;
5. route evidence recording.

Return `selected`, `rejected`, or `review_required`.

Do not execute side effects in the resolver.

## Task 6 — DataNest AI integration

Integrate ILM-1 into the DataNest AI server path without changing product identity.

The runtime should record:

- active ILM profile/version;
- selected memory IDs;
- policy/resource route evidence;
- provider/model provenance where applicable;
- route decision ID.

Preserve existing `ai_usage_requests`, staging intake, output staging and reasoning-envelope behavior.

## Task 7 — Evaluation/capability evidence

Add server-side adapters for recording:

- deterministic/policy/certification/human-review evaluation;
- capability-fit evidence linked to Phase E resource/capability IDs.

These are evidence records only. They do not alter Phase E health or certified memory automatically.

## Task 8 — Shared UI contract

Create:

- `src/lib/intelligenceFabric.ts`

Include:

- profile statuses;
- route kinds/decisions;
- evaluator kinds/statuses;
- capability evidence kinds/statuses;
- role helpers;
- labels/tones.

No secret or chain-of-thought types.

## Task 9 — Intelligence Fabric panel

Create:

- `src/components/IntelligenceFabricPanel.tsx`

Read via:

- `get_intelligence_fabric_workspace_v1`

Mutate only via:

- `upsert_ilm_profile_v1`

Show:

- ILM-1 orchestration/not-training boundary;
- profile version/state;
- recent route decisions;
- evaluation evidence;
- capability evidence;
- memory and Resource Fabric linkage.

Owner/admin profile controls only.

Browser must not call service evidence RPCs.

## Task 10 — DataNest AI workspace integration

Integrate the panel into the existing DataNest AI workspace without replacing Certified Memory or the chat.

Preferred presentation:

- preserve existing chat and Certified Memory;
- add Intelligence Fabric as a sibling governance/evidence section;
- keep current Job/session UX unchanged.

## Task 11 — Responsive styling

Add Intelligence Fabric responsive cards/rails in `src/app/globals.css`.

At 390px:

- no page-level horizontal overflow;
- route/evaluation evidence stacks to one column;
- long trace/reason/provider labels wrap safely.

## Task 12 — Browser coverage

Create:

- `tests/browser/intelligence-fabric.spec.ts`

Cases:

1. ILM-1 states orchestration, not model training.
2. Viewer/operator can inspect but not mutate profile/evidence.
3. Owner/admin can version ILM profile.
4. Route/evaluation/capability evidence is read-only.
5. Certified Memory remains present and separate.
6. No provider-secret fields appear.
7. Mobile viewport has no horizontal page overflow.

Add to PR Verification.

## Task 13 — Architecture documentation

Update `docs/ARCHITECTURE.md` with:

- ILM-1 definition;
- route order;
- profile/evidence ledgers;
- no-training boundary;
- Phase C/D/E prerequisites;
- Phase G/H target-state markers.

## Task 14 — Verification

Require exact-head:

- `npm test`
- `npm run check`
- production static build
- provider-agnostic container build
- fresh Supabase migration replay
- browser verification
- Edge Function Validation
- DataNest AI Certification

## Task 15 — Draft PR and merge gate

Open draft PR:

**Phase F: Intelligence Fabric and ILM-1**

Keep draft until all exact-head gates pass.

Before merge:

1. verify PR head SHA;
2. verify all required workflow runs succeed on that exact SHA;
3. verify no unresolved review threads;
4. verify mergeable state;
5. mark ready;
6. re-fetch and confirm head SHA;
7. merge with `expected_head_sha`.

After merge:

- confirm merge commit on `main`;
- verify main CI/PR Verification/Pages;
- advance to Phase G only after post-merge verification is green.
