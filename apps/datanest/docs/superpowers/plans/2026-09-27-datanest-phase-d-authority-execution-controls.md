# DataNest Phase D — Authority and Execution Controls Implementation Plan

**Date:** 2026-09-27  
**Repository:** DataNest-Supository/DataNest  
**Approved design:** `docs/superpowers/specs/2026-09-27-datanest-phase-d-authority-execution-controls-design.md`  
**Implementation branch:** `feature/datanest-phase-d-authority-execution-controls`  
**Plan status:** Execution authorized by user instruction; self-review complete

## Goal

Implement a bounded execution-authority layer above existing project RBAC, Job controls, Phase C trust policy, provider authorization, and capacity reservations.

Phase D must make automated A3 execution require an approved Authority Envelope and a short-lived authorization Capability Lease while preserving existing human-controlled scheduler workflows.

## Global constraints

- Existing `reservations` remain capacity reservations and are not renamed or repurposed.
- Existing `transition_job_status(...)` remains the explicit human-control status path.
- Phase D automated authority never bypasses RLS/RBAC, Job collaboration, Phase C data policy, provider trust, AI budgets, file access, or publication/learning controls.
- A4 is representable/reviewable but not executable through the generic automated lease path.
- All new public tables use project-scoped RLS and explicit grants.
- Authenticated clients get read access only; mutations occur through governed RPCs.
- Service evaluator functions are service-role only.
- Unknown/expired/mismatched/over-ceiling authority fails closed.
- Lease-use counters are updated atomically under row lock.
- No existing data is deleted or rewritten.
- No billing behavior changes.
- No Resource Fabric, Supository, Cloud-Nest, ILM, or Outcome Ledger implementation in Phase D.
- Migration files must be created using `supabase migration new` in a Supabase-capable environment before SQL is committed. The current assistant container has no Supabase CLI, so migration filenames are intentionally not invented in this plan.

## File structure

Create:

- CLI-generated migration: `add_authority_execution_foundations`
- CLI-generated migration: `add_authority_execution_governed_operations`
- `src/lib/executionAuthority.ts`
- `src/components/ExecutionAuthorityPanel.tsx`
- `tests/unit/execution-authority-schema-source.test.mjs`
- `tests/unit/execution-authority-operations-source.test.mjs`
- `tests/unit/execution-authority-ui-source.test.mjs`
- `tests/browser/execution-authority.spec.ts`

Modify:

- `src/components/DataNestApp.tsx`
- `src/app/globals.css`
- `.github/workflows/pr-verification.yml`
- `docs/ARCHITECTURE.md`

Preserve all existing tests and workflows.

---

# Task 1 — Generate migrations with the Supabase CLI

In a Supabase-capable repository checkout:

```bash
supabase --version
supabase migration new add_authority_execution_foundations
supabase migration new add_authority_execution_governed_operations
supabase migration list --local
```

Record the generated filenames before writing SQL.

Do not hand-invent migration timestamps.

---

# Task 2 — Authority schema and RLS

**Migration:** CLI-generated `add_authority_execution_foundations`

Create:

### `public.authority_envelopes`

Required columns:

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `product_id uuid null references public.products(id) on delete set null`
- `job_id uuid not null references public.jobs(id) on delete cascade`
- `actor_type text not null`
- `actor_user_id uuid null references auth.users(id) on delete set null`
- `actor_key text not null`
- `sponsor_user_id uuid not null references auth.users(id)`
- `purpose text not null`
- `autonomy_level text not null`
- `permitted_capabilities text[] not null default '{}'`
- `permitted_operations text[] not null default '{}'`
- `data_scope jsonb not null default '{}'`
- `resource_ceiling jsonb not null default '{}'`
- `reversibility text not null default 'reversible'`
- `evidence_requirements jsonb not null default '{}'`
- `approval_state text not null default 'draft'`
- `trace_key text not null`
- `effective_from timestamptz null`
- `expires_at timestamptz not null`
- `created_by uuid not null references auth.users(id)`
- `approved_by uuid null references auth.users(id)`
- `approved_at timestamptz null`
- `revoked_by uuid null references auth.users(id)`
- `revoked_at timestamptz null`
- `revocation_reason text null`
- `created_at timestamptz not null default now()`

Controlled values:

- actor type: `human|agent|application|model|service|workflow`
- autonomy: `A0|A1|A2|A3|A4`
- operation: `observe|prepare|write|execute|promote|destruct`
- reversibility: `reversible|conditionally_reversible|irreversible`
- approval state: `draft|approved|rejected|revoked|expired`

Indexes:

- project/job/status/expiry
- sponsor
- product when non-null
- unique project trace key
- partial index for currently approved, unrevoked envelope candidates

### `public.capability_leases`

Required columns:

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references public.projects(id) on delete cascade`
- `authority_envelope_id uuid not null references public.authority_envelopes(id) on delete cascade`
- `job_id uuid not null references public.jobs(id) on delete cascade`
- `capability_id uuid not null references public.capabilities(id) on delete restrict`
- `actor_key text not null`
- `allowed_operations text[] not null default '{}'`
- `data_scope jsonb not null default '{}'`
- `resource_ceiling jsonb not null default '{}'`
- `approval_level text not null`
- `trace_key text not null`
- `status text not null default 'active'`
- `max_operations integer not null`
- `used_operations integer not null default 0`
- `expires_at timestamptz not null`
- `issued_by uuid not null references auth.users(id)`
- `issued_at timestamptz not null default now()`
- `last_used_at timestamptz null`
- `released_at timestamptz null`
- `release_reason text null`

Controlled status:

- `active|released|expired|revoked|exhausted`

Create a unique partial index preventing two active authorization leases for the same envelope + capability + actor where that would create ambiguous authority.

### `public.execution_circuit_breakers`

Columns:

- project id
- category
- state
- reason
- updated_by
- updated_at

Categories:

- `autonomous_write`
- `deployment`
- `external_communication`
- `resource_execution`

State:

- `open|halted`

Unique project + category.

Seed no implicit broad permission. Missing breaker rows resolve conservatively in the evaluator according to operation class.

### `public.execution_authority_decisions`

Append-only evidence columns:

- project/job
- actor/sponsor
- envelope/lease/capability
- requested operation
- purpose
- autonomy level
- outcome
- reason code
- breaker snapshot
- capability state snapshot
- resource usage snapshot
- trace id
- created_at

Controlled outcome:

- `allow|deny|review_required`

### Reservation linkage

Add nullable `authority_lease_id` to `public.reservations` referencing `public.capability_leases(id)` with `on delete set null`.

This is evidence linkage only. Existing reservation semantics remain unchanged.

### RLS and grants

Enable RLS on all new public tables.

Authenticated project members may read.

Do not grant authenticated direct mutation access.

Explicitly grant only required SELECT privileges to `authenticated`, and service-role access needed by evaluator operations.

Add FK indexes.

---

# Task 3 — Private validators and governed authenticated RPCs

**Migration:** CLI-generated `add_authority_execution_governed_operations`

Private helpers should include:

- project/Job/capability identity validation;
- active sponsor/member validation;
- autonomy-to-operation ceiling validation;
- high-impact/A4 detection;
- circuit-breaker classification;
- resource-ceiling normalization and validation;
- event writer.

Authenticated RPCs:

### `propose_authority_envelope_v1(...)`

Owner/admin/operator may propose.

Rules:

- Job and optional product must belong to project.
- Sponsor must be active project member.
- Non-human actor requires sponsor.
- A3 requires finite expiry and complete resource ceiling.
- A4 requires explicit evidence requirements and cannot contain a generic autonomous execution permission.
- operation list must be compatible with autonomy.

### `approve_authority_envelope_v1(target_envelope)`

- A0-A2: owner/admin/operator according to project membership.
- A3: owner/admin; independent from author when author is sponsor.
- A4: owner only; independent reviewer required.
- activation never bypasses other policy systems.

### `reject_authority_envelope_v1(...)`

Records reason and immutable event.

### `revoke_authority_envelope_v1(...)`

Owner/admin may revoke active authority.

Revocation must immediately make linked active leases unusable. It may update lease status to revoked transactionally.

### `issue_capability_lease_v1(...)`

Rules:

- approved, current, unrevoked envelope;
- same project/Job/actor;
- capability listed in envelope;
- operation subset of envelope;
- capability enabled and not disabled/offline/exhausted;
- finite expiry no later than envelope expiry;
- max operations no greater than envelope ceiling;
- A4 denied;
- relevant circuit breaker must be open.

Issue lease with snapshot copies of data scope and resource ceiling.

### `release_capability_lease_v1(...)`

Governed release; no deletion.

### `set_execution_circuit_breaker_v1(...)`

Owner/admin only.

Every mutation emits an event with trace IDs.

Revoke default execute from `public` and `anon`; grant only intended roles.

---

# Task 4 — Service-side atomic execution authorization

Create service-only:

`service_authorize_execution_v1(...)`

Inputs:

- target project
- target job
- actor key
- capability id
- requested operation
- purpose
- trace id
- envelope id
- capability lease id

Behavior:

1. lock lease row `FOR UPDATE`;
2. resolve and validate project/Job/capability/envelope/lease identity;
3. validate sponsor membership;
4. validate envelope approval and expiry;
5. validate lease active/expiry/remaining operation budget;
6. validate requested capability + operation scope;
7. validate autonomy ceiling;
8. deny A4/high-impact generic automation;
9. check circuit breaker;
10. check capability enabled/state/concurrency;
11. return `review_required` rather than allow on materially unknown health/resource state;
12. on allow, atomically increment `used_operations`, stamp `last_used_at`, and mark `exhausted` when the limit is reached;
13. insert append-only execution authority decision;
14. emit project event;
15. return decision JSON.

Privileges:

- revoke from `public, anon, authenticated`;
- grant execute only to `service_role`.

No authenticated UI path may call it directly.

---

# Task 5 — Shared TypeScript contract

Create `src/lib/executionAuthority.ts`.

Export controlled types and label helpers:

- `AutonomyLevel`
- `ExecutionOperation`
- `AuthorityEnvelopeState`
- `CapabilityLeaseState`
- `ExecutionCircuitBreakerCategory`
- `ExecutionAuthorityRole`
- autonomy labels/descriptions
- permission gradient
- `canProposeExecutionAuthority(role)`
- `canApproveExecutionAuthority(role, level)`
- `canManageCircuitBreakers(role)`

Do not encode authorization decisions that belong in the database.

---

# Task 6 — TranScheduler Authority & Execution UI

Create `src/components/ExecutionAuthorityPanel.tsx`.

Read through a governed workspace RPC:

`get_execution_authority_workspace_v1(target_project)`

The read model should include:

- envelopes;
- leases;
- breakers;
- capability summaries;
- caller role/capabilities;
- explicit boundary flags.

Integrate into TranScheduler without replacing queue/Gantt.

Preferred UX:

- queue/Gantt remains default;
- an `Authority & Execution` disclosure/tab shows:
  - A0-A4 legend;
  - explicit “capacity reservation ≠ authorization lease” warning;
  - envelope cards;
  - lease budget/expiry;
  - circuit breakers;
  - propose/approve/revoke/issue/release actions based on role;
  - A4 rendered as human-gated and no automated lease action.

No secret fields.

Responsive at 390px with no horizontal overflow.

---

# Task 7 — Human-control compatibility

Keep `transition_job_status(...)` behavior unchanged.

Update event payload only if useful to make the human path explicit, e.g. `authority_mode='human_control'`, without changing allowed transitions.

Do not require Authority Envelopes for existing human Pause/Resume/Cancel or manual Job lifecycle operations.

Source tests must assert the distinction.

---

# Task 8 — Unit and browser tests

Create schema/source tests that assert:

- controlled values and FK/index/RLS/grant boundaries;
- authenticated direct mutation is absent;
- service evaluator is service-role only;
- A4 generic automation is denied;
- lease usage is atomic;
- circuit breakers exist;
- reservations remain capacity and only gain nullable authority linkage;
- current RLS/RBAC helpers remain authoritative;
- Phase C service evaluator remains independent.

Create UI source test for:

- A0-A4;
- capacity vs authorization warning;
- role gating;
- no secret fields;
- A4 human-gated copy.

Create browser test scenarios:

1. viewer reads authority state, no mutation;
2. operator proposes A0-A3 but cannot approve A3 or change breakers;
3. owner/admin sees A3 approval and lease controls;
4. A4 shows no automated lease action;
5. halted breaker is visible;
6. existing queue/Gantt human controls still work;
7. mobile viewport has no horizontal overflow.

Add `tests/browser/execution-authority.spec.ts` to PR Verification.

---

# Task 9 — Architecture documentation

Update `docs/ARCHITECTURE.md` with:

- Authority Envelope as execution authorization, not credential storage;
- Capability Lease as authorization, distinct from reservation/capacity;
- A4 human-gated boundary;
- circuit-breaker categories;
- service-side fail-closed evaluation;
- Phase E Resource Fabric remains target state.

---

# Task 10 — Verification and PR gate

Required exact-head gates:

- unit tests;
- TypeScript check;
- production build;
- browser verification;
- migration replay from a fresh database;
- Edge Function Validation;
- DataNest AI Certification.

Run Supabase security/performance advisors after schema implementation in a safe development environment before production promotion.

Open Phase D as a draft PR until all exact-head gates pass.

Merge only the verified exact head.

After merge:

- confirm `main` CI and PR Verification;
- confirm GitHub Pages deploy/live smoke;
- do not claim Phase D live until those post-merge checks are green.
