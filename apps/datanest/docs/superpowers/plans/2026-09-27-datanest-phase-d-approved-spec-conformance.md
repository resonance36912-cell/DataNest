# DataNest Phase D Approved-Spec Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the already-merged Phase D baseline from PR #135 into full conformance with the user-approved Authority & Execution specification without deleting history, weakening existing safeguards, or duplicating the baseline implementation.

**Architecture:** Preserve the current Phase D tables/RPC/UI as a legacy-compatible baseline, then add a canonical conformance layer through additive migrations, V2 governed mutations, a new route-aware service evaluator, selected execution adapters, and upgraded UI/read models. Existing legacy records are never auto-promoted into executable canonical authority; route enforcement remains `report_only` until explicitly changed per project/route.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, Supabase Edge Functions/Deno TypeScript, Next.js 15/React 19/TypeScript, Node `node:test` source-contract tests, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-27-datanest-phase-d-authority-execution-controls-design.md`

## Current Baseline to Preserve

PR #135 is already merged to `main` and provides:

- `public.authority_envelopes`;
- `public.capability_leases`;
- `public.execution_circuit_breakers`;
- `public.execution_authority_decisions`;
- governed V1 proposal/approval/lease/breaker RPCs;
- `service_authorize_execution_v1`;
- `ExecutionAuthorityPanel` in TranScheduler;
- Phase D unit/browser coverage.

This plan does **not** recreate those objects.

The approved spec adds requirements that baseline does not yet satisfy, including:

- canonical consequence classes distinct from old operation gradient;
- optional project/job envelope scope;
- explicit envelope lifecycle separate from legacy `approval_state`;
- independent/exact-action approval records;
- canonical `enabled|paused|blocked` breaker semantics and automated-tighten-only path;
- route-specific `report_only|enforced` rollout;
- selected route adapters for external AI provider execution and `RESERVED -> RUNNING`;
- Phase C decision reference in Phase D execution authority;
- Governance Authority & Execution section;
- no invented monetary/resource units;
- execution/run provenance and read-only scheduler readiness.

## Global Constraints

- Do not delete or rewrite the PR #135 migrations.
- Do not delete historical Phase D envelopes, leases, decisions, breaker events, reservations, Jobs, runs, or audit evidence.
- Legacy V1 Authority Envelopes and Capability Leases are not automatically canonical execution authority.
- A legacy approved envelope backfills canonical `status='approved'`, **not** `active`; explicit V2 activation is required before an enforced route can use it.
- Existing `resource_ceiling.max_cost_minor` is preserved as historical JSON only; no new code/UI/policy uses or interprets it because no authoritative Phase D currency/pricing unit exists.
- `public.reservations` remain capacity reservations. Existing nullable `reservations.authority_lease_id` may remain provenance only and must never substitute for canonical lease evaluation.
- Existing RLS/RBAC, Job collaboration, file access, Phase C trust policy, provider/budget authorization, certification, and promotion remain independent prerequisites.
- Phase D allow never overrides an upstream deny/review-required result.
- Canonical autonomy levels remain exactly `A0|A1|A2|A3|A4`.
- Canonical consequence classes remain exactly `read_only|advisory|preparatory|reversible_write|external_communication|externally_visible_change|resource_execution|production_change|destructive|legal_commitment|financial_commitment|ownership_or_governance|constitutional`.
- A4 always requires exact-action human approval and remains non-generic/non-autonomous.
- Canonical route keys are exactly `external_ai_provider|job_start`.
- Missing route policy means `report_only`.
- Canonical breaker categories are exactly `autonomous_writes|external_communications|deployments|resource_execution`.
- Canonical breaker states are exactly `enabled|paused|blocked`.
- Automated safety can tighten to paused/blocked but cannot re-enable.
- No new destructive, legal, financial, ownership, billing, remote-control, production-promotion, Phase E Resource Fabric, or Phase F ILM executor is introduced.
- RONSAS remains `DataNest > Products > RONSAS`; billing remains off.

## Review Focus

1. **Legacy authority migration:** an old `approval_state='approved'` envelope or active legacy lease must never become executable canonical authority without explicit V2 activation/review.
2. **Consequence separation:** old operation `execute` must not implicitly grant every A3 consequence class; canonical requested consequence must be explicitly allowed.
3. **Route enforcement:** moving one route to `enforced` must not affect the other route and must fail closed on absent/expired/revoked canonical authority.
4. **Concurrency/idempotency:** canonical lease counters are consumed at most once per trace and cannot be overrun by concurrent distinct traces.
5. **A4 substitution:** exact approval for one operation/target/evidence identity cannot authorize a changed packet.

---

### Task 1: Canonical Schema Conformance on Top of PR #135

**Files:**
- Create: `supabase/migrations/20260927123000_align_phase_d_authority_with_approved_spec.sql`
- Create: `tests/unit/authority-execution-conformance-schema-source.test.mjs`

**Interfaces:**
- Consumes: existing Phase D tables from migrations `20260927110124...` and `20260927110125...`.
- Produces: canonical columns/tables/constraints while retaining legacy columns and rows.

- [ ] **Step 1: Write failing conformance-schema tests**

Pin:

- existing four baseline tables remain;
- new `authority_approvals` table exists;
- envelope gains canonical status/requested+granted autonomy/consequence/scope/limit fields;
- legacy approved rows do not backfill `active`;
- leases gain canonical capability key, target scope and consequence fields;
- breaker vocabulary migrates to approved category/state values;
- decisions gain route/consequence/Phase-C/provider/reservation/lease-array/evidence fields;
- runs gain authority provenance;
- explicit breaker rows exist for existing/future projects;
- no historical row deletion/truncation;
- legacy `max_cost_minor` is never made canonical.

Run:

```bash
node --test --experimental-strip-types tests/unit/authority-execution-conformance-schema-source.test.mjs
```

Expected: FAIL before migration.

- [ ] **Step 2: Add canonical envelope fields without destructive renames**

Alter `public.authority_envelopes`:

- make legacy `job_id` nullable;
- add `status text not null default 'draft'` with canonical lifecycle `draft|proposed|approved|active|paused|exhausted|expired|revoked|superseded|rejected`;
- add `requested_autonomy text`;
- add `granted_autonomy text`;
- add `allowed_consequence_classes text[] not null default '{}'`;
- add `allowed_operation_keys text[] not null default '{}'`;
- add `allowed_target_types text[] not null default '{}'`;
- add `allowed_target_references text[] not null default '{}'`;
- add `allowed_data_classes text[] not null default '{}'`;
- add `allowed_purposes text[] not null default '{}'`;
- add `allowed_provider_keys text[] not null default '{}'`;
- add nullable explicit ceiling columns: `max_operation_count`, `max_concurrent_executions`, `max_external_calls`, `max_retry_count`, `max_runtime_seconds`, `max_target_count`, `max_file_change_count`, `max_external_recipients`;
- add `resource_limits jsonb not null default '{}'`;
- add `require_capability_lease boolean not null default true`;
- add `require_independent_approval boolean not null default false`;
- add `exact_evidence_identity text`;
- add `status_reason text`;
- add `supersedes_envelope_id uuid references public.authority_envelopes(id)`.

Safe backfill:

- `requested_autonomy=autonomy_level`;
- `granted_autonomy=autonomy_level` only for legacy `approval_state='approved'`, otherwise null;
- `allowed_operation_keys=permitted_operations`;
- canonical `status`: draft->draft, approved->approved, rejected->rejected, revoked->revoked, expired->expired;
- `allowed_consequence_classes='{}'` for all legacy rows: no consequence authority is inferred from legacy operation names.

Do not infer project-wide authority from legacy non-null Job scope.

- [ ] **Step 3: Create explicit `authority_approvals`**

Fields:

- `id uuid primary key`;
- `project_id`;
- `authority_envelope_id`;
- `approval_type ordinary|independent|exact_action`;
- `status approved|rejected|revoked|expired`;
- `approver_user_id`;
- nullable `job_id`, `operation_key`, `target_type`, `target_reference`, `exact_evidence_identity`;
- `conditions jsonb`;
- nullable `evidence_reference`, `expires_at`, revocation fields;
- timestamps.

Use project-scoped RLS. Direct authenticated mutation denied. Governed RPCs only.

- [ ] **Step 4: Extend leases conservatively**

Add to `public.capability_leases`:

- `capability_key text`;
- `allowed_target_types text[] not null default '{}'`;
- `allowed_target_references text[] not null default '{}'`;
- `allowed_consequence_classes text[] not null default '{}'`;
- nullable `evidence_reference`, `supersedes_lease_id`.

Expand status check to canonical `proposed|active|exhausted|expired|paused|revoked|superseded|cancelled`, mapping legacy `released -> cancelled`.

Backfill `capability_key` from the referenced `public.capabilities.capability`.

Do not backfill `allowed_consequence_classes`; legacy leases are not canonical execution permission until reviewed/superseded.

- [ ] **Step 5: Migrate breaker vocabulary and seed explicit state**

Migrate:

- `autonomous_write -> autonomous_writes`;
- `deployment -> deployments`;
- `external_communication -> external_communications`;
- `resource_execution -> resource_execution`;
- `open -> enabled`;
- `halted -> blocked`.

Expand state to include `paused`.

Backfill missing categories for every existing project as `enabled`. Add AFTER INSERT project trigger to seed all four for future projects.

- [ ] **Step 6: Extend decisions and runs**

Add to `execution_authority_decisions`:

- `route_key`;
- `requesting_user_id`;
- `actor_type`, `actor_reference`;
- `requested_consequence_class`;
- `requested_autonomy`, `granted_autonomy`;
- `capability_keys text[]`;
- `capability_lease_ids uuid[]`;
- `breaker_category`, `breaker_state`;
- nullable `phase_c_decision_id references public.data_policy_decisions(id)`;
- nullable provider request/reservation references where the existing type supports FK, otherwise trace-safe IDs;
- `exact_evidence_identity`;
- `enforcement_mode report_only|enforced`;
- `ceiling_snapshot jsonb`.

Do not rewrite legacy decisions; new fields remain nullable for historical rows.

Add nullable `authority_envelope_id`, `execution_authority_decision_id`, and `authority_trace_id` to `public.runs`.

- [ ] **Step 7: Run RED→GREEN schema verification**

```bash
node --test --experimental-strip-types tests/unit/authority-execution-conformance-schema-source.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260927123000_align_phase_d_authority_with_approved_spec.sql tests/unit/authority-execution-conformance-schema-source.test.mjs
git commit -m "feat: align Phase D authority schema with approved spec"
```

---

### Task 2: Canonical V2 Governance, Exact Approval, Route Policy and Evaluator

**Files:**
- Create: `supabase/migrations/20260927124000_add_phase_d_approved_authority_operations.sql`
- Create: `tests/unit/authority-execution-conformance-operations-source.test.mjs`

**Interfaces:**
- Consumes: Task 1 canonical fields plus all baseline V1 RPCs/tables.
- Produces: V2 mutation path, canonical route-aware evaluator and read models. V1 remains compatibility/history only.

- [ ] **Step 1: Write failing conformance-operation tests**

Cover:

- canonical minimum autonomy mapping;
- explicit consequence membership required in addition to autonomy rank;
- V2 proposal cannot infer consequence from legacy operation gradient;
- A4/independent envelope proposer cannot self-approve;
- exact-action approval match;
- route mode defaults `report_only`;
- route keys isolated;
- service safety may tighten breaker but never enable it;
- canonical lease scope is subset of active envelope;
- expired/revoked/exhausted/paused state fails closed;
- idempotent and concurrent-safe counter consumption;
- Phase C non-allow remains non-allow;
- no direct/automatic promotion of legacy V1 authority into canonical active state.

- [ ] **Step 2: Add private canonical helpers**

Create:

```sql
private.authority_autonomy_rank(text) returns integer
private.authority_minimum_autonomy(text) returns text
private.authority_breaker_category(text) returns text
private.authority_route_mode(uuid,text) returns text
private.authority_evaluate_execution_v1(
  target_project uuid,
  target_requesting_user uuid,
  target_route_key text,
  target_actor_type text,
  target_actor_reference text,
  target_job uuid,
  target_operation text,
  target_consequence_class text,
  target_requested_autonomy text,
  target_trace_id text,
  target_capability_keys text[],
  target_target_type text,
  target_target_reference text,
  target_exact_evidence_identity text,
  target_phase_c_decision uuid,
  target_provider_request uuid,
  target_require_reservation boolean,
  target_consume_operation boolean
) returns jsonb
```

Revoke private helpers from `public,anon,authenticated`.

- [ ] **Step 3: Add V2 envelope governance**

Create:

```sql
propose_authority_envelope_v2(
  target_project uuid,
  target_actor_type text,
  target_actor_reference text,
  target_accountable_human_user uuid,
  target_purpose text,
  target_requested_autonomy text,
  target_allowed_consequence_classes text[],
  target_allowed_operation_keys text[],
  target_rationale text,
  target_product uuid default null,
  target_job uuid default null,
  target_allowed_capability_keys text[] default '{}',
  target_allowed_tool_keys text[] default '{}',
  target_allowed_target_types text[] default '{}',
  target_allowed_target_references text[] default '{}',
  target_allowed_data_classes text[] default '{}',
  target_allowed_purposes text[] default '{}',
  target_allowed_provider_keys text[] default '{}',
  target_valid_from timestamptz default null,
  target_expires_at timestamptz default null,
  target_limits jsonb default '{}'::jsonb,
  target_reversibility text default 'reversible',
  target_require_capability_lease boolean default true,
  target_require_independent_approval boolean default false,
  target_exact_evidence_identity text default null,
  target_evidence_reference text default null
) returns uuid

approve_authority_envelope_v2(
  target_envelope uuid,
  target_granted_autonomy text,
  target_conditions jsonb default '{}'::jsonb,
  target_evidence_reference text default null
) returns uuid

activate_authority_envelope_v2(target_envelope uuid) returns uuid
reject_authority_envelope_v2(target_envelope uuid,target_reason text) returns uuid
pause_authority_envelope_v2(target_envelope uuid,target_reason text) returns uuid
revoke_authority_envelope_v2(target_envelope uuid,target_reason text) returns uuid
```

Rules:

- owner/admin/operator may propose A0-A3 within current role; A4 proposal is owner/admin only;
- accountable human must be active project member;
- product/Job context must match project;
- project-scoped envelope is allowed through nullable Job;
- requested autonomy must satisfy every requested consequence minimum;
- no currency/cost key is required or interpreted;
- high-impact/independent approval uses a separate human reviewer;
- approval inserts `authority_approvals`;
- activation is separate and required before canonical evaluator use;
- activation never auto-imports legacy consequence scope.

- [ ] **Step 4: Add exact-action approvals and canonical lease operations**

Create:

```sql
record_exact_action_approval_v1(
  target_envelope uuid,
  target_job uuid,
  target_operation text,
  target_target_type text,
  target_target_reference text,
  target_exact_evidence_identity text,
  target_expires_at timestamptz,
  target_evidence_reference text default null
) returns uuid

revoke_authority_approval_v1(target_approval uuid,target_reason text) returns uuid

issue_capability_lease_v2(
  target_envelope uuid,
  target_capability_key text,
  target_allowed_operations text[],
  target_expires_at timestamptz,
  target_job uuid default null,
  target_capability uuid default null,
  target_allowed_target_types text[] default '{}',
  target_allowed_target_references text[] default '{}',
  target_allowed_consequence_classes text[] default '{}',
  target_max_operation_count integer default null,
  target_trace_identity text default null,
  target_evidence_reference text default null
) returns uuid

pause_capability_lease_v1(target_lease uuid,target_reason text) returns uuid
revoke_capability_lease_v1(target_lease uuid,target_reason text) returns uuid
```

Canonical lease issuance requires parent `status='active'`, not merely legacy `approval_state='approved'`.

Lease scope may only tighten parent scope.

- [ ] **Step 5: Add breaker safety and route modes**

Create:

```sql
set_execution_circuit_breaker_v2(
  target_project uuid,
  target_category text,
  target_state text,
  target_reason text,
  target_evidence_reference text default null
) returns uuid

service_tighten_execution_circuit_breaker_v1(
  target_project uuid,
  target_category text,
  target_state text,
  target_reason text,
  target_trace_id text
) returns uuid

set_authority_execution_route_mode_v1(
  target_project uuid,
  target_route_key text,
  target_mode text,
  target_reason text,
  target_evidence_reference text default null
) returns text
```

Store route policy in existing `scheduler_policies` under:

- `authority_execution:external_ai_provider`;
- `authority_execution:job_start`.

JSON value: `mode`, `reason`, nullable `evidence_reference`, `updated_by`, `updated_at`.

Missing row = `report_only`.

Service tightening accepts only `paused|blocked`; only governed human V2 mutation may restore `enabled`.

- [ ] **Step 6: Implement canonical evaluator**

Create service wrapper:

```sql
service_evaluate_execution_authority_v1(
  target_project uuid,
  target_requesting_user uuid,
  target_route_key text,
  target_actor_type text,
  target_actor_reference text,
  target_job uuid,
  target_operation text,
  target_consequence_class text,
  target_requested_autonomy text,
  target_trace_id text,
  target_capability_keys text[] default '{}',
  target_target_type text default null,
  target_target_reference text default null,
  target_exact_evidence_identity text default null,
  target_phase_c_decision uuid default null,
  target_provider_request uuid default null,
  target_require_reservation boolean default false,
  target_consume_operation boolean default false
) returns jsonb
```

Service-role only.

Resolution rules:

1. validate project/requesting-user/Job;
2. validate route/consequence/autonomy;
3. read route mode;
4. resolve canonical `status='active'` envelope by exact Job scope first, then project scope, matching actor/purpose/time;
5. require explicit requested consequence in envelope;
6. enforce autonomy minimum/granted ceiling;
7. enforce canonical breaker;
8. A4 requires exact-action approval identity;
9. require one canonical active lease per requested capability key when envelope requires lease;
10. enforce operation/target/consequence subset;
11. validate capability health; `UNKNOWN|OFFLINE|DISABLED|EXHAUSTED|COOLDOWN` is non-executable;
12. require capacity reservation separately when requested;
13. if Phase C decision supplied, require same project + `outcome='allow'`;
14. under enforced mode and `target_consume_operation=true`, row-lock matching leases in deterministic order and atomically consume once per unique trace;
15. insert/return idempotent canonical decision.

Report-only returns the computed non-allow result but does not consume lease counters or block by itself.

- [ ] **Step 7: Add canonical read models**

Create:

```sql
get_authority_execution_workspace_v1(target_project uuid) returns jsonb

get_job_execution_authority_summary_v1(
  target_project uuid,
  target_jobs uuid[]
) returns jsonb
```

Workspace includes canonical envelopes, approvals, leases, breakers, route modes, recent decisions, Jobs, role booleans.

Job summary returns per Job:

- route mode;
- envelope ID/status;
- per-capability lease states;
- breaker state;
- latest decision outcome/reason;
- readiness: `not_evaluated|report_only|ready_for_check|approval_required|lease_missing|lease_expired|paused|blocked|authorized`.

`authorized` only when latest matching **enforced** decision is allow.

- [ ] **Step 8: Keep legacy V1 non-authoritative**

Add tests/documentation comments that V1 RPCs are compatibility/history paths.

Do not drop them in Phase D conformance.

Canonical selected routes and upgraded UI must use V2/canonical functions only.

- [ ] **Step 9: Verify and commit**

```bash
node --test --experimental-strip-types tests/unit/authority-execution-conformance-operations-source.test.mjs
npm test
git add supabase/migrations/20260927124000_add_phase_d_approved_authority_operations.sql tests/unit/authority-execution-conformance-operations-source.test.mjs
git commit -m "feat: add approved Phase D authority evaluator"
```

---

### Task 3: Canonical Route Adapters

**Files:**
- Create: `supabase/migrations/20260927125000_add_phase_d_authority_route_adapters.sql`
- Modify: `supabase/functions/datanest-ai-chat/index.ts`
- Create: `tests/unit/authority-execution-route-source.test.mjs`
- Modify: `tests/unit/datanest-ai-trust-policy-source.test.mjs`

**Interfaces:**
- Consumes: Task 2 canonical evaluator/route policy.
- Produces: selected route integration while defaulting both routes to report-only.

- [ ] **Step 1: Write failing route tests**

Pin:

- Phase C -> Phase D -> existing provider authorization order;
- report-only never widens provider denial;
- enforced Phase D denial prevents provider call and preserves embedded fallback;
- `RESERVED -> RUNNING` evaluates `job_start`;
- report-only preserves current transition;
- enforced job start requires canonical authority + lease + reservation;
- all other existing human status transitions remain unchanged;
- no route creates envelope/lease automatically.

- [ ] **Step 2: Add Job-start adapter additively**

`CREATE OR REPLACE public.transition_job_status(uuid,text)` in the new migration; do not edit historical migration.

Keep same signature/grants/state machine.

Use `SECURITY DEFINER SET search_path=public,private,auth` with explicit `auth.uid()` and existing owner/admin/operator role check.

Only `RESERVED -> RUNNING` evaluates canonical Phase D:

- route `job_start`;
- human actor = current user;
- operation `job_start`;
- consequence `resource_execution`;
- A3;
- capability keys from all distinct Job required capabilities;
- target Job;
- reservation required;
- consume operation true.

Block only when route mode is `enforced` and evaluator outcome is non-allow.

- [ ] **Step 3: Add external AI adapter**

After Phase C provider-processing decision and before `service_authorize_ai_request`, call canonical Phase D with:

- route `external_ai_provider`;
- actor `service:datanest-ai`;
- requesting user = current human;
- operation `external_provider_call`;
- consequence `resource_execution`;
- A3;
- capability key `external_ai:<providerKey>`;
- target provider/providerKey;
- Phase C decision ID;
- provider request ID;
- no capacity reservation;
- consume operation true.

Enforced non-allow: do not call provider, finish usage request denied, preserve embedded fallback.

Report-only: record result, continue existing provider authorization.

- [ ] **Step 4: Verify**

```bash
node --test --experimental-strip-types tests/unit/authority-execution-route-source.test.mjs tests/unit/datanest-ai-trust-policy-source.test.mjs
npm test
npm run check
deno check supabase/functions/datanest-ai-chat/index.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260927125000_add_phase_d_authority_route_adapters.sql supabase/functions/datanest-ai-chat/index.ts tests/unit/authority-execution-route-source.test.mjs tests/unit/datanest-ai-trust-policy-source.test.mjs
git commit -m "feat: apply canonical Phase D authority to selected routes"
```

---

### Task 4: Upgrade Existing Phase D UI to the Approved Model

**Files:**
- Modify: `src/lib/executionAuthority.ts`
- Modify: `src/components/ExecutionAuthorityPanel.tsx`
- Modify: `src/components/GovernanceWorkspace.tsx`
- Modify: `src/components/DataNestApp.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/unit/authority-execution-conformance-ui-source.test.mjs`

**Interfaces:**
- Consumes: existing PR #135 component plus Task 2 canonical workspace/V2 RPCs.
- Produces: one shared upgraded `ExecutionAuthorityPanel` used in Governance and TranScheduler.

- [ ] **Step 1: Write failing conformance UI tests**

Require:

- consequence classes distinct from legacy operation gradient;
- canonical breakers/routes/states;
- no `max_cost_minor` input;
- V2 proposal/approval/lease/breaker RPCs;
- exact-action approval control;
- route-mode controls;
- Governance third tab `Authority & Execution`;
- TranScheduler keeps its existing Authority sibling mode as operational surface;
- viewer/operator/admin/owner controls match backend;
- AVAILABLE resource is never rendered as authorization;
- expired/revoked/exhausted lease is visibly non-authorizing;
- report-only is not presented as enforced authorization;
- secrets remain absent.

- [ ] **Step 2: Extend `executionAuthority.ts`**

Preserve any legacy exported types needed by existing tests during migration, but add canonical:

```ts
export type ConsequenceClass =
  "read_only"|"advisory"|"preparatory"|"reversible_write"|
  "external_communication"|"externally_visible_change"|"resource_execution"|
  "production_change"|"destructive"|"legal_commitment"|"financial_commitment"|
  "ownership_or_governance"|"constitutional";

export const consequenceClasses:ConsequenceClass[] = [/* exact order above */];
export const authorityRouteKeys=["external_ai_provider","job_start"] as const;
export const breakerCategories=["autonomous_writes","external_communications","deployments","resource_execution"] as const;
```

Browser helper logic remains presentation-only.

- [ ] **Step 3: Upgrade `ExecutionAuthorityPanel`**

Switch writes/reads to canonical V2/workspace functions.

Remove monetary/cost field.

Add:

- requested/granted autonomy;
- explicit allowed consequence classes;
- optional Job scope;
- independent approval evidence;
- exact-action approval form for A4;
- canonical active/paused/revoked/expired lifecycle;
- route modes;
- three-state breakers;
- canonical lease target/consequence scope;
- recent execution decisions.

Keep boundary copy that reservation != lease and no secrets.

A4 exposes review/approval only, never a generic destructive/financial/legal executor.

- [ ] **Step 4: Add Governance section while preserving scheduler surface**

In `GovernanceWorkspace.tsx` extend section to `sovereign|trust|authority`.

`section=authority` renders the shared `ExecutionAuthorityPanel`.

Sovereign remains default; Trust deep link remains.

TranScheduler retains its `Authority & Execution` sibling mode for operational context.

- [ ] **Step 5: Add scheduler readiness read model**

`DataNestApp.tsx` calls `get_job_execution_authority_summary_v1(project.id,currentPageJobIds)` when scheduler jobs change.

Keep authority summary separate from `Capability.state`.

Labels may include:

- Authority not evaluated;
- Report only;
- Ready for authority check;
- Authorized only from latest enforced allow decision;
- Approval required;
- Lease missing/expired;
- Paused/blocked by policy.

Do not change queue/Gantt sorting or human Pause/Resume/Cancel controls.

- [ ] **Step 6: Verify and commit**

```bash
node --test --experimental-strip-types tests/unit/authority-execution-conformance-ui-source.test.mjs
npm test
npm run check
git add src/lib/executionAuthority.ts src/components/ExecutionAuthorityPanel.tsx src/components/GovernanceWorkspace.tsx src/components/DataNestApp.tsx src/app/globals.css tests/unit/authority-execution-conformance-ui-source.test.mjs
git commit -m "feat: align Phase D authority UI with approved model"
```

---

### Task 5: Browser, Documentation, and CI Conformance

**Files:**
- Modify: `tests/browser/execution-authority.spec.ts`
- Modify: `tests/browser/transcheduler-project-gantt.spec.ts`
- Modify: `tests/browser/trust-policy.spec.ts`
- Modify: `.github/workflows/pr-verification.yml`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/UX_WORKFLOW_ARCHITECTURE.md`
- Modify: `tests/unit/ecosystem-authority-contract.test.mjs`

- [ ] **Step 1: Extend browser fixtures to canonical model**

Cover:

- Governance authority deep link;
- TranScheduler operational authority surface;
- viewer read-only;
- operator proposal only;
- owner/admin governed controls;
- A4 exact approval and no generic executor;
- route modes;
- canonical breakers;
- expired/revoked lease;
- capacity/authorization distinction;
- no authorization inferred from AVAILABLE.

- [ ] **Step 2: Preserve existing Phase C/browser flows**

Ensure Trust & Data Policy browser suite remains green and no Governance default regression occurs.

- [ ] **Step 3: Update PR browser list**

Keep existing `execution-authority.spec.ts` in PR Verification and add no replacement/removal of existing suites.

- [ ] **Step 4: Correct documentation truth**

`docs/ARCHITECTURE.md`:

- describe canonical consequence/route/lease model;
- mark legacy PR #135 V1 path as compatibility, not current authority source;
- Phase E/F remain target state;
- no destructive/legal/financial/billing capability claimed.

`docs/UX_WORKFLOW_ARCHITECTURE.md`:

- Governance sections include Authority & Execution;
- scheduler has operational Authority view;
- reservation != lease;
- available != authorized.

- [ ] **Step 5: Pin ecosystem compatibility**

Extend authority contract test to retain:

- DataNest parent/RONSAS product hierarchy;
- billing off;
- no Resource Fabric/ILM live claim;
- no new destructive/legal/financial execution claim.

- [ ] **Step 6: Run targeted/full tests and commit**

```bash
npm test
npm run check
npx playwright test tests/browser/execution-authority.spec.ts tests/browser/transcheduler-project-gantt.spec.ts tests/browser/trust-policy.spec.ts --workers=1
git add tests/browser/execution-authority.spec.ts tests/browser/transcheduler-project-gantt.spec.ts tests/browser/trust-policy.spec.ts .github/workflows/pr-verification.yml docs/ARCHITECTURE.md docs/UX_WORKFLOW_ARCHITECTURE.md tests/unit/ecosystem-authority-contract.test.mjs
git commit -m "test: verify approved Phase D conformance"
```

---

### Task 6: Exact-Head Verification and Merge Gate

**Files:** No source changes unless a RED gate exposes a defect.

- [ ] **Step 1: Full local checks**

```bash
npm test
npm run check
npm run build
npx playwright test tests/browser/auth.smoke.spec.ts tests/browser/home-optimization.spec.ts tests/browser/products.spec.ts tests/browser/portfolio-registry.spec.ts tests/browser/trust-policy.spec.ts tests/browser/execution-authority.spec.ts tests/browser/datanest-ai-layout.spec.ts tests/browser/datanest-ai-recovery.spec.ts tests/browser/transcheduler-project-gantt.spec.ts --workers=1
deno check supabase/functions/datanest-ai-chat/index.ts
```

Expected: PASS.

- [ ] **Step 2: Migration replay**

```bash
supabase db start
```

Expected: historical chain + PR #135 migrations + three additive conformance migrations replay cleanly.

- [ ] **Step 3: Exact PR-head GitHub gates**

Require green on the same SHA:

- CI;
- PR Verification;
- Migration Replay Validation;
- Edge Function Validation;
- DataNest AI Certification.

- [ ] **Step 4: Whole-branch review**

Review current-main base through conformance head for:

- no legacy authority auto-promotion;
- explicit consequence class;
- A4 exact human approval;
- route-specific report-only default;
- canonical breaker tightening;
- lease/reservation separation;
- Phase C/provider/RBAC precedence;
- no currency/pricing invention;
- no secret fields;
- no destructive/legal/financial executor;
- no Phase E/F creep;
- RONSAS hierarchy and billing off.

Any High/Medium finding requires RED→GREEN fix and all exact-head gates rerun.

- [ ] **Step 5: Stop at programme merge gate**

Report verified head, changed files, gate results, and conformance findings.

Do not merge, deploy, change a production route to `enforced`, or alter production circuit breakers without the next explicit programme decision.

---

## Plan Self-Review

### Spec coverage

All user-approved Phase D requirements are covered. PR #135 baseline is treated as preserved legacy-compatible implementation rather than discarded work.

### Step scan

Each task is independently reviewable: schema conformance, canonical operations, route adapters, UI, acceptance/docs, final verification.

### Type/signature consistency

Canonical evaluator/signatures are shared by selected routes; UI uses V2/canonical read models; legacy V1 names remain compatibility-only.

### Review Focus coverage

1. Legacy authority not auto-promoted — Task 1/2 tests.
2. Explicit consequence class — Task 1/2.
3. Route isolation/enforcement — Task 2/3.
4. Counter concurrency/idempotency — Task 2.
5. Exact A4 identity — Task 2/4/5.

### Proportion

This plan specifies only the deltas that current merged Phase D lacks. It does not repeat implementation already present in PR #135 and does not prescribe function bodies except where migration/backfill safety and evaluator ordering are architecture decisions.
