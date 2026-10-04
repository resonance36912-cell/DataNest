# DataNest AI Governed Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UNIFI Copilot and active contribution/stake scoring with a governed DataNest AI runtime that stages every human and AI Companion input, learns project-wide only from certified memory, and promotes knowledge through auditable validation and certification gates.

**Architecture:** The browser remains a static Next.js client authenticated against the production Supabase project. Production Edge Functions authenticate the caller, validate Job access, and bridge to a persistent isolated Supabase staging project using server-held branch credentials; raw input never bypasses the staging intake gateway. Production stores only certified-memory objects and operational AI usage/policy data, while the dedicated staging project stores immutable raw evidence, sessions, trend clusters, candidates, validation runs, certification decisions, and reasoning envelopes.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.9, Supabase Postgres/Auth/Edge Functions, `@supabase/supabase-js` 2.x, Node test runner, Playwright 1.55, GitHub Actions, GitHub Pages, Docker.

**Spec:** `docs/superpowers/specs/2026-09-24-datanest-ai-governed-memory-design.md`

## Global Constraints

- Certified Memory Learning only: raw inputs do not modify foundation-model weights and do not become production memory directly.
- Paired staging: implementation code is isolated on `feature/datanest-ai-governed-memory`; raw learning evidence is isolated in a persistent Supabase branch named `datanest-ai-staging`.
- Raw human and AI Companion inputs are retained indefinitely in staging and must have a recoverable export/restore path.
- Uncertified evidence may influence only the current Job/session; certified memory may influence the whole project.
- Certification flow is `INTAKE -> AUDITED -> VERIFIED -> VALIDATED -> STRESS_TESTED -> CERTIFICATION_REVIEW -> CERTIFIED`.
- Low-risk repeated non-conflicting knowledge may auto-certify only after all automated gates pass.
- Admins may certify normal project knowledge; Owner approval is required for architecture, security, authentication/authorization, governance, destructive behavior, production-policy changes, conflicting knowledge, or other high-risk categories.
- Every AI response stores an operational provenance envelope; never store or expose private model chain-of-thought.
- Remove active contribution scoring, stake-credit functionality, suggested stake, external-AI credit scoring, and acceptance/reversal UI; preserve historical rows as legacy audit evidence.
- Keep provider connections, server-side credentials, allowlists, usage accounting, budget controls, reconciliation, authentication, authorization, and RLS.
- Browser code must never receive staging service credentials.
- All exposed tables use RLS; privileged cross-environment writes happen only server-side.
- Staging-only DDL must not live in the normal production migration directory, because Supabase schema deployments deploy normal migrations to production.
- Do not merge the DataNest AI implementation to `main` until exact-head CI, database/security checks, stress tests, and browser acceptance pass.
- Do not merge to `main` without a separate explicit merge instruction after the implementation PR is ready.

## Review Focus

1. **Cross-Job leakage:** a staged event from JOB A must not appear in JOB B context before certification. Task 4 includes a unit test that rejects session evidence when either Job ID or session ID differs.
2. **Duplicate requests:** retrying the same `clientRequestId` must not call the provider twice or create duplicate intake/output events. Tasks 3 and 4 pin the request fingerprint and cached-response path.
3. **Conflicting knowledge:** a candidate that conflicts with active certified memory must never auto-certify. Tasks 5 and 6 test conflict classification and Owner-only review.
4. **Authority bypass:** an Admin or forged client role must not certify Owner-only categories. Task 6 tests server-derived role enforcement.
5. **Staging outage after request reservation:** if staging intake fails, no provider call may occur and the reserved AI request must be finalized as failed/denied rather than left ambiguous. Task 4 includes this failure-path test.

---

## File Structure

The implementation should converge on the following structure.

```text
src/
  components/
    DataNestApp.tsx                    # navigation and top-level composition
    DataNestAiWorkspace.tsx            # Job selection and DataNest AI workspace orchestration
    DataNestAiChatPanel.tsx            # chat composer, trace/trust badges, session transcript
    DataNestAiMemoryPanel.tsx          # certified memory and provenance display
    DataNestAiCertificationPanel.tsx   # role-gated candidate/validation/certification UI
    AiOperationsDashboard.tsx          # provider, budget, allowlist, reconciliation only
    AiReconciliationPanel.tsx          # usage/cost reconciliation without contribution wording
    ExternalAiSidebar.tsx              # external AI handoff; imports now stage evidence
    ProductLab.tsx                     # product testing without contribution-scoring copy
  lib/
    datanestAiPolicy.ts                # browser-safe re-export of shared policy primitives
supabase/
  migrations/
    20260924230000_datanest_ai_production.sql
  staging-migrations/
    20260924230001_datanest_ai_staging.sql
  functions/
    _shared/
      datanestAiPolicy.ts              # risk/authority/trust rules, no Deno-specific imports
      datanestAiRuntime.ts             # prompt/context and idempotent runtime helpers
      datanestAiTrends.ts              # deterministic trend grouping/candidate helpers
      provider.ts                      # provider endpoint validation/call helper
    datanest-ai-chat/
      index.ts                         # context + chat runtime gateway
    datanest-ai-intake/
      index.ts                         # external AI Companion staging gateway
    datanest-ai-certification/
      index.ts                         # review, validation, certification, promotion, supersession
tests/
  unit/
    datanest-ai-policy.test.mjs
    datanest-ai-runtime.test.mjs
    datanest-ai-trends.test.mjs
    datanest-ai-source.test.mjs
    datanest-ai-backup.test.mjs
  sql/
    datanest_ai_staging_acceptance.sql
    datanest_ai_production_acceptance.sql
  browser/
    datanest-ai.spec.ts
  stress/
    datanest-ai-stress.mjs
scripts/
  seed-datanest-ai-e2e.mjs
  export-datanest-ai-staging.mjs
  restore-datanest-ai-staging.mjs
  lib/
    encrypted-backup.mjs
docs/
  runbooks/
    datanest-ai-staging-retention.md
.github/
  workflows/
    ci.yml
    datanest-ai-certification.yml
    pages.yml
```

The existing `RnDDashboard.tsx` and `StakeholderDashboard.tsx` are removed after their replacement surfaces are live and tested. Existing legacy database tables are preserved; they are not dropped.

## Execution Preflight

This preflight happens at execution time before Task 1 code changes.

- If PR #1 / `feature/ai-companion-trace-handoff` is still unmerged, create the implementation branch/worktree from its exact current head so External AI Companion trace work is preserved. If it has merged, branch from the resulting exact `main` head.
- Use the required worktree workflow at execution time; do not develop directly in the existing checkout.
- Before creating the Supabase branch, retrieve the current branch cost for the project organization, repeat the amount to the user, and obtain the required explicit cost confirmation. Only then create the persistent branch `datanest-ai-staging`.
- Record the staging project URL/publishable/service-role/database credentials only in the authorized secret store used for development and CI. Never commit them.
- The branch must remain persistent. Do not wire its lifecycle to PR close/merge.
- Verify whether the persistent branch has a native recoverable backup/PITR mechanism. If it does not, Task 11's encrypted export path becomes a blocking release gate until a durable external destination is selected.

### Task 1: Add shared governance primitives

**Files:**
- Create: `supabase/functions/_shared/datanestAiPolicy.ts`
- Create: `src/lib/datanestAiPolicy.ts`
- Create: `tests/unit/datanest-ai-policy.test.mjs`

**Interfaces:**
- Consumes: project role strings `owner | admin | operator | viewer`; candidate category/risk/conflict metadata; evidence `projectId/jobId/sessionId`.
- Produces: `requiredCertificationAuthority()`, `canAutoCertify()`, `canUseUncertifiedEvidence()`, `contextTrustLabel()`, shared type unions.

- [ ] **Step 1: Write the failing policy tests**

Create `tests/unit/datanest-ai-policy.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  canAutoCertify,
  canUseUncertifiedEvidence,
  requiredCertificationAuthority,
  contextTrustLabel
} from "../../supabase/functions/_shared/datanestAiPolicy.ts";

test("owner-only categories never auto-certify", () => {
  for (const category of ["architecture","security","authorization","governance","destructive","production_policy"]) {
    assert.equal(
      requiredCertificationAuthority({ category, riskClass: "low", hasConflict: false }),
      "owner"
    );
    assert.equal(
      canAutoCertify({
        category,
        riskClass: "low",
        hasConflict: false,
        allGatesPassed: true,
        evidenceCount: 10
      }),
      false
    );
  }
});

test("repeated low-risk non-conflicting knowledge can auto-certify after all gates", () => {
  assert.equal(
    canAutoCertify({
      category: "workflow",
      riskClass: "low",
      hasConflict: false,
      allGatesPassed: true,
      evidenceCount: 2
    }),
    true
  );
});

test("conflict forces owner review", () => {
  assert.equal(
    requiredCertificationAuthority({ category: "workflow", riskClass: "low", hasConflict: true }),
    "owner"
  );
});

test("uncertified evidence is scoped to the same project, job and session", () => {
  const evidence = { projectId: "p1", jobId: "j1", sessionId: "s1" };
  assert.equal(canUseUncertifiedEvidence(evidence, { projectId: "p1", jobId: "j1", sessionId: "s1" }), true);
  assert.equal(canUseUncertifiedEvidence(evidence, { projectId: "p1", jobId: "j2", sessionId: "s1" }), false);
  assert.equal(canUseUncertifiedEvidence(evidence, { projectId: "p1", jobId: "j1", sessionId: "s2" }), false);
});

test("trust labels do not blur provisional and certified evidence", () => {
  assert.equal(contextTrustLabel("uncertified"), "UNCERTIFIED");
  assert.equal(contextTrustLabel("certified"), "CERTIFIED");
});
```

- [ ] **Step 2: Run the policy test and verify RED**

Run:

```bash
node --test --experimental-strip-types tests/unit/datanest-ai-policy.test.mjs
```

Expected: FAIL because `supabase/functions/_shared/datanestAiPolicy.ts` does not exist.

- [ ] **Step 3: Implement the minimal shared policy**

Create `supabase/functions/_shared/datanestAiPolicy.ts`:

```ts
export type ProjectRole = "owner" | "admin" | "operator" | "viewer";
export type RiskClass = "low" | "normal" | "high";
export type CertificationAuthority = "automation" | "admin" | "owner";
export type TrustState = "uncertified" | "certified";

const ownerOnly = new Set([
  "architecture",
  "security",
  "authentication",
  "authorization",
  "governance",
  "destructive",
  "production_policy"
]);

export function requiredCertificationAuthority(input: {
  category: string;
  riskClass: RiskClass;
  hasConflict: boolean;
}): CertificationAuthority {
  if (input.hasConflict || input.riskClass === "high" || ownerOnly.has(input.category)) return "owner";
  if (input.riskClass === "normal") return "admin";
  return "automation";
}

export function canAutoCertify(input: {
  category: string;
  riskClass: RiskClass;
  hasConflict: boolean;
  allGatesPassed: boolean;
  evidenceCount: number;
}): boolean {
  return (
    input.allGatesPassed &&
    input.evidenceCount >= 2 &&
    requiredCertificationAuthority(input) === "automation"
  );
}

export function canUseUncertifiedEvidence(
  evidence: { projectId: string; jobId: string; sessionId: string },
  context: { projectId: string; jobId: string; sessionId: string }
): boolean {
  return evidence.projectId === context.projectId &&
    evidence.jobId === context.jobId &&
    evidence.sessionId === context.sessionId;
}

export function contextTrustLabel(state: TrustState): "UNCERTIFIED" | "CERTIFIED" {
  return state === "certified" ? "CERTIFIED" : "UNCERTIFIED";
}
```

Create `src/lib/datanestAiPolicy.ts`:

```ts
export * from "../../supabase/functions/_shared/datanestAiPolicy";
```

- [ ] **Step 4: Run the policy test and full unit suite**

Run:

```bash
node --test --experimental-strip-types tests/unit/datanest-ai-policy.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/datanestAiPolicy.ts src/lib/datanestAiPolicy.ts tests/unit/datanest-ai-policy.test.mjs
git commit -m "feat: add DataNest AI governance policy primitives"
```

### Task 2: Create the persistent staging evidence schema

**Files:**
- Create: `supabase/staging-migrations/20260924230001_datanest_ai_staging.sql`
- Create: `tests/sql/datanest_ai_staging_acceptance.sql`

**Interfaces:**
- Consumes: production-authorized UUIDs for project/job/user as opaque provenance values; staging service-role operations.
- Produces: staging tables `ai_sessions`, `ai_intake_events`, `ai_reasoning_envelopes`, `ai_trend_clusters`, `ai_trend_evidence`, `ai_learning_candidates`, `ai_candidate_evidence`, `ai_validation_runs`, `ai_certification_decisions`, `ai_memory_supersessions`.
- Important: project/job UUIDs in staging intentionally have no FK to staging `projects/jobs`, because production data is not copied to a new Supabase staging project. The production gateway validates those identities before any write.

- [ ] **Step 1: Write the staging acceptance SQL first**

Create `tests/sql/datanest_ai_staging_acceptance.sql` with schema assertions:

```sql
\set ON_ERROR_STOP on

do $$
declare
  missing text[];
begin
  select array_agg(required_name)
  into missing
  from unnest(array[
    'ai_sessions',
    'ai_intake_events',
    'ai_reasoning_envelopes',
    'ai_trend_clusters',
    'ai_trend_evidence',
    'ai_learning_candidates',
    'ai_candidate_evidence',
    'ai_validation_runs',
    'ai_certification_decisions',
    'ai_memory_supersessions'
  ]) required_name
  where to_regclass('public.' || required_name) is null;

  if missing is not null then
    raise exception 'missing DataNest AI staging tables: %', missing;
  end if;
end $$;

do $$
declare
  unprotected text[];
begin
  select array_agg(c.relname)
  into unprotected
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname like 'ai_%'
    and c.relname in (
      'ai_sessions','ai_intake_events','ai_reasoning_envelopes',
      'ai_trend_clusters','ai_trend_evidence','ai_learning_candidates',
      'ai_candidate_evidence','ai_validation_runs','ai_certification_decisions',
      'ai_memory_supersessions'
    )
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'RLS disabled on staging tables: %', unprotected;
  end if;
end $$;

do $$
begin
  if has_table_privilege('authenticated','public.ai_intake_events','INSERT')
     or has_table_privilege('anon','public.ai_intake_events','SELECT') then
    raise exception 'browser roles must not have direct staging-table privileges';
  end if;
end $$;
```

- [ ] **Step 2: Verify the acceptance SQL fails before migration**

Run against the new staging project:

```bash
psql "$DATANEST_AI_STAGING_DB_URL" -v ON_ERROR_STOP=1 -f tests/sql/datanest_ai_staging_acceptance.sql
```

Expected: FAIL with missing DataNest AI staging tables.

- [ ] **Step 3: Write the staging-only migration**

Create `supabase/staging-migrations/20260924230001_datanest_ai_staging.sql`. The migration begins with these invariants and core tables:

```sql
begin;

create table public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  job_id uuid not null,
  user_id uuid not null,
  client_session_id uuid not null,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_session_id)
);

create table public.ai_intake_events (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null unique,
  project_id uuid not null,
  job_id uuid not null,
  session_id uuid not null references public.ai_sessions(id),
  source_type text not null check (source_type in ('human','ai_companion','datanest_ai','legacy_import')),
  source_user_id uuid,
  source_provider text,
  external_ai_session_id uuid,
  parent_event_id uuid references public.ai_intake_events(id),
  client_request_id uuid,
  content text not null check (length(btrim(content)) > 0),
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index ai_intake_human_request_once
on public.ai_intake_events(source_user_id,client_request_id,source_type)
where client_request_id is not null and source_type='human';

create table public.ai_reasoning_envelopes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  job_id uuid not null,
  session_id uuid not null references public.ai_sessions(id),
  output_event_id uuid not null unique references public.ai_intake_events(id),
  provider_route text not null,
  policy_version text not null,
  input_event_ids uuid[] not null default '{}',
  certified_memory_ids uuid[] not null default '{}',
  uncertified_event_ids uuid[] not null default '{}',
  request_status text not null,
  created_at timestamptz not null default now()
);

create table public.ai_trend_clusters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  trend_key text not null,
  category text not null,
  normalized_label text not null,
  evidence_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(project_id,trend_key)
);

create table public.ai_trend_evidence (
  cluster_id uuid not null references public.ai_trend_clusters(id) on delete cascade,
  event_id uuid not null references public.ai_intake_events(id),
  created_at timestamptz not null default now(),
  primary key(cluster_id,event_id)
);

create table public.ai_learning_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  normalized_knowledge text not null,
  category text not null,
  risk_class text not null check (risk_class in ('low','normal','high')),
  lifecycle_state text not null default 'INTAKE'
    check (lifecycle_state in (
      'INTAKE','AUDITED','VERIFIED','VALIDATED','STRESS_TESTED',
      'CERTIFICATION_REVIEW','CERTIFIED','NEEDS_EVIDENCE','REJECTED'
    )),
  evidence_count integer not null default 0,
  has_conflict boolean not null default false,
  confidence numeric,
  policy_version text not null,
  content_hash text not null,
  certified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_candidate_evidence (
  candidate_id uuid not null references public.ai_learning_candidates(id) on delete cascade,
  event_id uuid not null references public.ai_intake_events(id),
  created_at timestamptz not null default now(),
  primary key(candidate_id,event_id)
);

create table public.ai_validation_runs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.ai_learning_candidates(id),
  gate text not null check (gate in ('AUDIT','VERIFY','VALIDATE','STRESS_TEST')),
  suite_version text not null,
  passed boolean not null,
  results jsonb not null,
  actor_type text not null check (actor_type in ('automation','human')),
  actor_user_id uuid,
  created_at timestamptz not null default now()
);

create table public.ai_certification_decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.ai_learning_candidates(id),
  decision text not null check (decision in ('certified','rejected','needs_evidence')),
  authority text not null check (authority in ('automation','admin','owner')),
  actor_user_id uuid,
  risk_class text not null check (risk_class in ('low','normal','high')),
  reason text not null,
  policy_version text not null,
  content_hash text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_memory_supersessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  candidate_id uuid not null references public.ai_learning_candidates(id),
  production_memory_id uuid not null,
  supersedes_memory_id uuid,
  reason text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.ai_sessions enable row level security;
alter table public.ai_intake_events enable row level security;
alter table public.ai_reasoning_envelopes enable row level security;
alter table public.ai_trend_clusters enable row level security;
alter table public.ai_trend_evidence enable row level security;
alter table public.ai_learning_candidates enable row level security;
alter table public.ai_candidate_evidence enable row level security;
alter table public.ai_validation_runs enable row level security;
alter table public.ai_certification_decisions enable row level security;
alter table public.ai_memory_supersessions enable row level security;

revoke all on public.ai_sessions from anon, authenticated;
revoke all on public.ai_intake_events from anon, authenticated;
revoke all on public.ai_reasoning_envelopes from anon, authenticated;
revoke all on public.ai_trend_clusters from anon, authenticated;
revoke all on public.ai_trend_evidence from anon, authenticated;
revoke all on public.ai_learning_candidates from anon, authenticated;
revoke all on public.ai_candidate_evidence from anon, authenticated;
revoke all on public.ai_validation_runs from anon, authenticated;
revoke all on public.ai_certification_decisions from anon, authenticated;
revoke all on public.ai_memory_supersessions from anon, authenticated;

create index ai_intake_events_session_time_idx
  on public.ai_intake_events(project_id,job_id,session_id,created_at);
create index ai_learning_candidates_project_state_idx
  on public.ai_learning_candidates(project_id,lifecycle_state,updated_at);
create index ai_validation_runs_candidate_gate_idx
  on public.ai_validation_runs(candidate_id,gate,created_at desc);
create index ai_certification_decisions_candidate_time_idx
  on public.ai_certification_decisions(candidate_id,created_at desc);

commit;
```

Do not add this file under `supabase/migrations/`; it is staging-only and must never auto-merge to production.

- [ ] **Step 4: Apply the staging migration only to the branch and run acceptance**

Apply it to the branch with the staging project ref, then run:

```bash
psql "$DATANEST_AI_STAGING_DB_URL" -v ON_ERROR_STOP=1 -f tests/sql/datanest_ai_staging_acceptance.sql
```

Expected: PASS.

Then run Supabase security and performance advisors against the branch. Expected: no new DataNest AI RLS/security finding.

- [ ] **Step 5: Commit**

```bash
git add supabase/staging-migrations/20260924230001_datanest_ai_staging.sql tests/sql/datanest_ai_staging_acceptance.sql
git commit -m "feat: add isolated DataNest AI staging schema"
```

### Task 3: Add production certified memory and remove contribution side effects

**Files:**
- Create: `supabase/migrations/20260924230000_datanest_ai_production.sql`
- Create: `tests/sql/datanest_ai_production_acceptance.sql`

**Interfaces:**
- Consumes: authenticated Job requests; service-role promotion payloads; existing `ai_usage_requests`, `external_ai_sessions`, project membership helpers.
- Produces: `certified_memory`; `begin_datanest_ai_request()`; `get_certified_memory_context()`; `service_promote_certified_memory()`; external-session staging linkage; usage finalization without contribution creation.

- [ ] **Step 1: Write production acceptance SQL**

Create `tests/sql/datanest_ai_production_acceptance.sql`:

```sql
\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.certified_memory') is null then
    raise exception 'certified_memory table missing';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='certified_memory' and c.relrowsecurity
  ) then
    raise exception 'certified_memory RLS must be enabled';
  end if;
end $$;

do $$
declare
  active_triggers integer;
begin
  select count(*) into active_triggers
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  where not t.tgisinternal
    and t.tgname in (
      'track_development_contribution',
      'track_dispatched_prompt_contribution',
      'track_job_input_contribution',
      'track_product_test_contribution'
    );
  if active_triggers <> 0 then
    raise exception 'legacy contribution triggers remain active';
  end if;
end $$;

do $
begin
  if to_regprocedure('public.begin_datanest_ai_request(uuid,uuid,text)') is null then
    raise exception 'begin_datanest_ai_request missing';
  end if;
  if to_regprocedure('public.get_certified_memory_context(uuid,uuid,integer)') is null then
    raise exception 'get_certified_memory_context missing';
  end if;
  if to_regprocedure('public.mark_external_ai_session_staged(uuid,uuid,text)') is null then
    raise exception 'mark_external_ai_session_staged missing';
  end if;
end $;

do $
declare
  finish_def text;
  reconcile_def text;
begin
  select pg_get_functiondef('public.service_finish_ai_request(uuid,text,bigint,bigint,bigint,bigint,bigint,text,text)'::regprocedure)
    into finish_def;
  select pg_get_functiondef('private.reconcile_unknown_ai_request(uuid,text,bigint,bigint,bigint,text)'::regprocedure)
    into reconcile_def;
  if finish_def ilike '%insert_contribution%' or reconcile_def ilike '%insert_contribution%' then
    raise exception 'AI usage paths still create contribution rows';
  end if;
end $;
```

- [ ] **Step 2: Verify RED on a disposable/staging database**

Run:

```bash
psql "$DATANEST_AI_STAGING_DB_URL" -v ON_ERROR_STOP=1 -f tests/sql/datanest_ai_production_acceptance.sql
```

Expected: FAIL because `certified_memory` and the DataNest AI RPCs do not exist.

- [ ] **Step 3: Implement certified-memory schema and request idempotency**

The production migration must create a compact table and request RPC. Core shape:

```sql
create table public.certified_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  normalized_knowledge text not null,
  category text not null,
  effective_version bigint not null,
  certification_id uuid not null,
  source_job_ids uuid[] not null default '{}',
  source_trace_ids text[] not null default '{}',
  certification_class text not null,
  confidence numeric,
  policy_version text not null,
  content_hash text not null,
  active boolean not null default true,
  supersedes_memory_id uuid references public.certified_memory(id),
  promoted_at timestamptz not null default now(),
  unique(project_id,content_hash,effective_version)
);

alter table public.certified_memory enable row level security;
revoke all on public.certified_memory from anon,authenticated;

create index certified_memory_project_active_idx
  on public.certified_memory(project_id,active,promoted_at desc);

create or replace function public.begin_datanest_ai_request(
  target_job uuid,
  target_client_request_id uuid,
  message_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  j public.jobs%rowtype;
  existing public.ai_usage_requests%rowtype;
  inserted public.ai_usage_requests%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_client_request_id is null or nullif(btrim(message_fingerprint),'') is null then
    raise exception 'client request id and fingerprint are required.';
  end if;

  select * into j from public.jobs where id=target_job;
  if not found then raise exception 'Job not found.'; end if;
  if not (private.is_project_member(j.project_id) or private.is_job_collaborator(j.id)) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  insert into public.ai_usage_requests(
    client_request_id,project_id,job_id,user_id,status,provider_called,
    message_fingerprint,metadata
  )
  values(
    target_client_request_id,j.project_id,j.id,caller,'pending',false,
    message_fingerprint,jsonb_build_object('runtime','datanest_ai')
  )
  on conflict (user_id,client_request_id) do nothing
  returning * into inserted;

  if found then
    return jsonb_build_object('id',inserted.id,'is_new',true,'status',inserted.status,'project_id',j.project_id);
  end if;

  select * into existing
  from public.ai_usage_requests
  where user_id=caller and client_request_id=target_client_request_id;

  if coalesce(existing.message_fingerprint,'') <> message_fingerprint then
    raise exception 'client_request_id payload mismatch.';
  end if;

  return jsonb_build_object(
    'id',existing.id,'is_new',false,'status',existing.status,
    'project_id',existing.project_id,'metadata',existing.metadata
  );
end;
$$;
```

Also add `staging_trace_id text` and `staging_event_id uuid` to `external_ai_sessions` without an FK to staging.

Define the ownership-checked linkage RPC now so Task 7 does not invent an interface later:

```sql
create or replace function public.mark_external_ai_session_staged(
  target_session uuid,
  target_staging_event uuid,
  target_trace_id text
) returns jsonb
language plpgsql
security definer
set search_path=public,private,auth
as $
declare
  caller uuid := auth.uid();
  s public.external_ai_sessions%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into s
  from public.external_ai_sessions
  where id=target_session
  for update;
  if not found then raise exception 'External AI session not found.'; end if;
  if s.user_id <> caller then
    raise insufficient_privilege using message='External AI session ownership is required.';
  end if;
  if not (private.is_project_member(s.project_id) or private.is_job_collaborator(s.job_id)) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  if s.staging_event_id is not null then
    return jsonb_build_object(
      'session_id',s.id,'staging_event_id',s.staging_event_id,
      'trace_id',s.staging_trace_id,'idempotent',true
    );
  end if;

  update public.external_ai_sessions
  set status='imported',
      staging_event_id=target_staging_event,
      staging_trace_id=target_trace_id,
      imported_at=now(),
      updated_at=now()
  where id=s.id;

  return jsonb_build_object(
    'session_id',s.id,'staging_event_id',target_staging_event,
    'trace_id',target_trace_id,'idempotent',false
  );
end;
$;

revoke all on function public.mark_external_ai_session_staged(uuid,uuid,text) from public,anon;
grant execute on function public.mark_external_ai_session_staged(uuid,uuid,text) to authenticated;
```

- [ ] **Step 4: Add certified-memory read/promotion functions**

Add:

```sql
create or replace function public.get_certified_memory_context(
  target_project uuid,
  target_job uuid,
  target_limit integer default 50
) returns jsonb
language sql
stable
security definer
set search_path=public,private,auth
as $$
  select case
    when not (
      private.is_project_member(target_project)
      or (
        private.is_job_collaborator(target_job)
        and exists(select 1 from public.jobs j where j.id=target_job and j.project_id=target_project)
      )
    ) then jsonb_build_object('authorized',false,'items','[]'::jsonb)
    else jsonb_build_object(
      'authorized',true,
      'items',coalesce((
        select jsonb_agg(to_jsonb(m) order by m.promoted_at desc)
        from (
          select id,normalized_knowledge,category,effective_version,certification_id,
                 source_job_ids,source_trace_ids,certification_class,confidence,
                 policy_version,content_hash,supersedes_memory_id,promoted_at
          from public.certified_memory
          where project_id=target_project and active=true
          order by promoted_at desc
          limit greatest(1,least(coalesce(target_limit,50),200))
        ) m
      ),'[]'::jsonb)
    )
  end;
$$;

create or replace function public.service_promote_certified_memory(
  target_project uuid,
  target_knowledge text,
  target_category text,
  target_certification_id uuid,
  target_source_job_ids uuid[],
  target_source_trace_ids text[],
  target_certification_class text,
  target_confidence numeric,
  target_policy_version text,
  target_content_hash text,
  target_supersedes uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  next_version bigint;
  existing_id uuid;
  new_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  select id into existing_id
  from public.certified_memory
  where project_id=target_project and content_hash=target_content_hash and active=true
  order by effective_version desc limit 1;
  if found then return existing_id; end if;

  select coalesce(max(effective_version),0)+1 into next_version
  from public.certified_memory where project_id=target_project;

  if target_supersedes is not null then
    update public.certified_memory
    set active=false
    where id=target_supersedes and project_id=target_project and active=true;
    if not found then raise exception 'Superseded memory is not active in this project.'; end if;
  end if;

  insert into public.certified_memory(
    project_id,normalized_knowledge,category,effective_version,certification_id,
    source_job_ids,source_trace_ids,certification_class,confidence,policy_version,
    content_hash,supersedes_memory_id
  )
  values(
    target_project,btrim(target_knowledge),target_category,next_version,target_certification_id,
    coalesce(target_source_job_ids,'{}'),coalesce(target_source_trace_ids,'{}'),
    target_certification_class,target_confidence,target_policy_version,
    target_content_hash,target_supersedes
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.begin_datanest_ai_request(uuid,uuid,text) from public,anon;
grant execute on function public.begin_datanest_ai_request(uuid,uuid,text) to authenticated;

revoke all on function public.get_certified_memory_context(uuid,uuid,integer) from public,anon;
grant execute on function public.get_certified_memory_context(uuid,uuid,integer) to authenticated;

revoke all on function public.service_promote_certified_memory(
  uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,uuid
) from public,anon,authenticated;
grant execute on function public.service_promote_certified_memory(
  uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,uuid
) to service_role;
```

- [ ] **Step 5: Remove contribution creation from active write paths**

In the same migration:

```sql
drop trigger if exists track_development_contribution on public.ai_development_updates;
drop trigger if exists track_dispatched_prompt_contribution on public.ai_prompt_queue;
drop trigger if exists track_job_input_contribution on public.job_inputs;
drop trigger if exists track_product_test_contribution on public.product_test_runs;

revoke execute on function public.accept_contribution(uuid) from anon,authenticated;
revoke execute on function public.reject_contribution(uuid,text) from anon,authenticated;
revoke execute on function public.reverse_contribution(uuid,text) from anon,authenticated;
revoke execute on function public.verify_contribution(uuid) from anon,authenticated;
```

Replace `public.service_finish_ai_request` with the existing usage-accounting logic minus the `private.insert_contribution(...)` block. Replace `private.reconcile_unknown_ai_request` the same way: retain status/token/cost/reservation/reconciliation updates, remove `contribution_weight` and `insert_contribution` calls.

Do not drop `contribution_ledger`, stake tables, or historical rows.

- [ ] **Step 6: Validate the migration on the staging project**

Apply the production migration to the staging project first, then run:

```bash
psql "$DATANEST_AI_STAGING_DB_URL" -v ON_ERROR_STOP=1 -f tests/sql/datanest_ai_production_acceptance.sql
```

Expected: PASS.

Run security and performance advisors. Fix every new finding attributable to this migration before commit.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260924230000_datanest_ai_production.sql tests/sql/datanest_ai_production_acceptance.sql
git commit -m "feat: add certified memory and retire contribution side effects"
```

### Task 4: Build the traced DataNest AI chat gateway

**Files:**
- Create: `supabase/functions/_shared/datanestAiRuntime.ts`
- Create: `supabase/functions/_shared/provider.ts`
- Create: `supabase/functions/datanest-ai-chat/index.ts`
- Create: `tests/unit/datanest-ai-runtime.test.mjs`

**Interfaces:**
- Consumes: `POST { action:"context"|"chat", jobId, sessionId?, clientRequestId?, message?, providerConnectionId? }`.
- Produces for `context`: Job metadata, current-session staged events, certified memory.
- Produces for `chat`: `{sessionId,inputTraceId,outputTraceId,assistant,trustState:"UNCERTIFIED",certifiedMemoryIds,requestId,providerMode,usage}`.
- Uses staging secrets `DATANEST_AI_STAGING_URL` and `DATANEST_AI_STAGING_SERVICE_ROLE_KEY`, available only to the Edge Function.

- [ ] **Step 1: Write runtime unit tests**

Create `tests/unit/datanest-ai-runtime.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGovernedPrompt,
  filterCurrentSessionEvidence,
  sha256Text
} from "../../supabase/functions/_shared/datanestAiRuntime.ts";

test("governed prompt orders certified memory before provisional session evidence", async () => {
  const prompt = buildGovernedPrompt({
    governance: "GOVERNANCE",
    certifiedMemory: ["CERTIFIED-A"],
    job: { id: "j1", title: "Job One" },
    uncertifiedEvidence: ["UNCERTIFIED-B"],
    userMessage: "USER-C"
  });
  assert.ok(prompt.indexOf("GOVERNANCE") < prompt.indexOf("CERTIFIED-A"));
  assert.ok(prompt.indexOf("CERTIFIED-A") < prompt.indexOf("UNCERTIFIED-B"));
  assert.ok(prompt.indexOf("UNCERTIFIED-B") < prompt.indexOf("USER-C"));
});

test("session evidence cannot cross job or session", () => {
  const events = [
    { projectId:"p",jobId:"j1",sessionId:"s1",content:"keep" },
    { projectId:"p",jobId:"j2",sessionId:"s1",content:"wrong job" },
    { projectId:"p",jobId:"j1",sessionId:"s2",content:"wrong session" }
  ];
  assert.deepEqual(
    filterCurrentSessionEvidence(events,{projectId:"p",jobId:"j1",sessionId:"s1"}).map(x=>x.content),
    ["keep"]
  );
});

test("message hashing is stable and content-sensitive", async () => {
  assert.equal(await sha256Text("same"), await sha256Text("same"));
  assert.notEqual(await sha256Text("same"), await sha256Text("different"));
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test --experimental-strip-types tests/unit/datanest-ai-runtime.test.mjs
```

Expected: FAIL because runtime helpers do not exist.

- [ ] **Step 3: Implement pure runtime helpers and provider helper**

`datanestAiRuntime.ts` must export:

```ts
export async function sha256Text(value:string):Promise<string> {
  const bytes = new TextEncoder().encode(value.trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

export function filterCurrentSessionEvidence<T extends {
  projectId:string; jobId:string; sessionId:string;
}>(events:T[], context:{projectId:string;jobId:string;sessionId:string}):T[] {
  return events.filter(event =>
    event.projectId===context.projectId &&
    event.jobId===context.jobId &&
    event.sessionId===context.sessionId
  );
}

export function buildGovernedPrompt(input:{
  governance:string;
  certifiedMemory:string[];
  job:Record<string,unknown>;
  uncertifiedEvidence:string[];
  userMessage:string;
}):string {
  return [
    input.governance,
    "CERTIFIED PROJECT MEMORY:",
    JSON.stringify(input.certifiedMemory),
    "CURRENT JOB MANIFEST:",
    JSON.stringify(input.job),
    "UNCERTIFIED CURRENT-SESSION EVIDENCE — do not present as established project knowledge:",
    JSON.stringify(input.uncertifiedEvidence),
    "CURRENT USER MESSAGE:",
    input.userMessage
  ].join("\n\n");
}
```

Move the HTTPS endpoint validation and OpenAI-compatible call mechanics from live `rnd-ai-chat-v3` into `provider.ts`, preserving redirect rejection, 30-second timeout, allowed endpoint host matching, server-side secret use, usage extraction, and explicit unknown-vs-failed outcome handling. The system identity string becomes `DataNest AI`; no `UNIFI Copilot` string remains.

- [ ] **Step 4: Implement chat/context Edge Function with fail-closed intake**

The function sequence for `action:"chat"` is fixed:

```ts
// Pseudocode shape that the implementation must follow exactly in order.
const user = await authenticatedClient.auth.getUser();
const job = await loadAuthorizedJob(authenticatedClient, body.jobId);

const fingerprint = await sha256Text(message);
const request = await authenticatedClient.rpc("begin_datanest_ai_request", {
  target_job: job.id,
  target_client_request_id: body.clientRequestId,
  message_fingerprint: fingerprint
});

const session = await ensureStagingSession(stagingService, {
  projectId: job.project_id,
  jobId: job.id,
  userId: user.id,
  existingSessionId: body.sessionId || null
});
// If existingSessionId is null, create ai_sessions with a generated client_session_id.
// If it is present, load by ai_sessions.id and verify project/job/user ownership before reuse.

// HARD GATE: this insert must succeed before provider authorization/call.
const inputEvent = await insertStagingEvent(stagingService, {
  sourceType: "human",
  clientRequestId: body.clientRequestId,
  content: message,
  contentHash: fingerprint
});

const certified = await authenticatedClient.rpc("get_certified_memory_context", {
  target_project: job.project_id,
  target_job: job.id,
  target_limit: 50
});
const provisional = await loadOnlyCurrentSessionEvidence(stagingService, session);

const providerResult = await callApprovedProviderOrEmbeddedFallback(/* governed context */);

const outputEvent = await insertStagingEvent(stagingService, {
  sourceType: "datanest_ai",
  parentEventId: inputEvent.id,
  content: providerResult.content,
  contentHash: await sha256Text(providerResult.content)
});

await insertReasoningEnvelope(stagingService, {
  outputEventId: outputEvent.id,
  certifiedMemoryIds: certified.ids,
  uncertifiedEventIds: provisional.ids.concat(inputEvent.id)
});
```

If the input-event insert fails, call `service_finish_ai_request` with `target_status:'failed'`, `target_error_category:'staging_intake_failed'`, and return 503. The provider must not be called.

For a duplicate `clientRequestId`, verify the fingerprint matches, then read the existing staging input/output pair and return it with `providerMode:"cached"`; do not re-call the provider.

- [ ] **Step 5: Add duplicate and staging-outage tests**

Add source-level dependency-injection tests to `datanest-ai-runtime.test.mjs` around a pure `executeChatTurn(deps,input)` exported from `datanestAiRuntime.ts`:

```js
test("staging intake failure prevents provider call", async () => {
  let providerCalls = 0;
  const deps = {
    beginRequest: async () => ({ id:"r1", isNew:true }),
    stageInput: async () => { throw new Error("staging down"); },
    finishRequest: async () => {},
    callProvider: async () => { providerCalls++; return {content:"bad"}; }
  };
  await assert.rejects(() => executeChatTurn(deps,{message:"x"}), /staging down/);
  assert.equal(providerCalls, 0);
});

test("cached duplicate does not call provider again", async () => {
  let providerCalls = 0;
  const result = await executeChatTurn({
    beginRequest: async () => ({ id:"r1", isNew:false }),
    loadCachedTurn: async () => ({ assistant:"cached", outputTraceId:"t2" }),
    callProvider: async () => { providerCalls++; return {content:"bad"}; }
  },{message:"same"});
  assert.equal(result.assistant, "cached");
  assert.equal(providerCalls, 0);
});
```

Use a dependency type whose optional operations are required only on the path that invokes them, so these tests do not need network access.

- [ ] **Step 6: Run tests and typecheck**

```bash
node --test --experimental-strip-types tests/unit/datanest-ai-runtime.test.mjs
npm test
npm run check
```

Expected: PASS.

- [ ] **Step 7: Deploy only to the staging project for integration testing**

Deploy `datanest-ai-chat` to the staging project with staging-project secrets. Do not deploy it to production in this task.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/datanestAiRuntime.ts supabase/functions/_shared/provider.ts supabase/functions/datanest-ai-chat/index.ts tests/unit/datanest-ai-runtime.test.mjs
git commit -m "feat: add traced DataNest AI chat gateway"
```

### Task 5: Add continuous trend grouping and learning candidates

**Files:**
- Create: `supabase/functions/_shared/datanestAiTrends.ts`
- Create: `tests/unit/datanest-ai-trends.test.mjs`
- Modify: `supabase/functions/datanest-ai-chat/index.ts`

**Interfaces:**
- Consumes: staged human/AI Companion evidence.
- Produces: deterministic `trendKey`, normalized token set, similarity score, risk category, and candidate proposal.
- Trend/candidate creation never changes production memory.

- [ ] **Step 1: Write trend tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrendTokens,
  evidenceSimilarity,
  classifyLearningRisk,
  candidateFromRepeatedEvidence
} from "../../supabase/functions/_shared/datanestAiTrends.ts";

test("near-duplicate requirements cluster", () => {
  const a = normalizeTrendTokens("Clipboard auto fill must require permission");
  const b = normalizeTrendTokens("Require clipboard permission before automatic fill");
  assert.ok(evidenceSimilarity(a,b) >= 0.5);
});

test("security and authorization learnings are high risk", () => {
  assert.deepEqual(classifyLearningRisk("change authentication and RLS authorization"), {
    category:"authorization",
    riskClass:"high"
  });
});

test("one-off evidence does not become an auto candidate", () => {
  assert.equal(candidateFromRepeatedEvidence([{id:"e1",content:"single observation"}]), null);
});

test("repeated evidence can produce a low-risk candidate but not a certification", () => {
  const candidate = candidateFromRepeatedEvidence([
    {id:"e1",content:"Use the compact job header in DataNest AI"},
    {id:"e2",content:"Keep the compact job header for DataNest AI"}
  ]);
  assert.equal(candidate?.lifecycleState, "INTAKE");
  assert.ok(candidate?.evidenceIds.length === 2);
});
```

- [ ] **Step 2: Verify RED**

Run the specific test; expect missing module failure.

- [ ] **Step 3: Implement deterministic trend helpers**

Use normalized lowercase alphanumeric tokens, a fixed stop-word set, Jaccard similarity, and explicit high-risk keyword/category mapping:

```ts
const stopWords=new Set(["the","a","an","and","or","to","of","for","in","on","with","is","be","as"]);

export function normalizeTrendTokens(value:string):string[] {
  return [...new Set(
    value.toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/)
      .filter(token=>token.length>2&&!stopWords.has(token))
  )].sort();
}

export function evidenceSimilarity(a:string[],b:string[]):number {
  const left=new Set(a), right=new Set(b);
  const intersection=[...left].filter(token=>right.has(token)).length;
  const union=new Set([...left,...right]).size;
  return union===0?0:intersection/union;
}

export function classifyLearningRisk(value:string):{category:string;riskClass:"low"|"normal"|"high"} {
  const text=value.toLowerCase();
  if (/auth|authorization|rls|permission|role/.test(text)) return {category:"authorization",riskClass:"high"};
  if (/security|secret|credential|encryption/.test(text)) return {category:"security",riskClass:"high"};
  if (/architecture|schema|migration/.test(text)) return {category:"architecture",riskClass:"high"};
  if (/delete|destroy|drop|purge/.test(text)) return {category:"destructive",riskClass:"high"};
  return {category:"workflow",riskClass:"low"};
}

export function candidateFromRepeatedEvidence(events:Array<{id:string;content:string}>) {
  if(events.length<2)return null;
  const anchor=events[0];
  const similar=events.filter(event=>
    evidenceSimilarity(normalizeTrendTokens(anchor.content),normalizeTrendTokens(event.content))>=0.5
  );
  if(similar.length<2)return null;
  const risk=classifyLearningRisk(similar.map(x=>x.content).join(" "));
  return {
    normalizedKnowledge:anchor.content.trim(),
    category:risk.category,
    riskClass:risk.riskClass,
    lifecycleState:"INTAKE" as const,
    evidenceIds:similar.map(x=>x.id)
  };
}
```

Candidate creation requires at least two similar evidence items. It returns `lifecycleState:"INTAKE"`; it never returns `CERTIFIED`.

- [ ] **Step 4: Integrate trend update after a successful staged input/output**

After the output envelope is safely stored, load recent same-project staging evidence, update or create `ai_trend_clusters`, attach `ai_trend_evidence`, and create/update an `ai_learning_candidates` row only when the deterministic threshold is met. Any trend-analysis failure is recorded in the response metadata but must not lose the already-recorded chat turn.

- [ ] **Step 5: Run unit suite**

```bash
node --test --experimental-strip-types tests/unit/datanest-ai-trends.test.mjs
npm test
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/datanestAiTrends.ts tests/unit/datanest-ai-trends.test.mjs supabase/functions/datanest-ai-chat/index.ts
git commit -m "feat: add continuous DataNest AI trend candidates"
```

### Task 6: Implement validation, tiered certification, promotion, and supersession

**Files:**
- Create: `supabase/functions/datanest-ai-certification/index.ts`
- Modify: `tests/unit/datanest-ai-policy.test.mjs`

**Interfaces:**
- Consumes: `POST {action:"workspace"|"record_validation"|"certify"|"promote"|"supersede", projectId, candidateId?, ...}`.
- Produces: role-filtered certification workspace and immutable decisions; promotion returns production `memoryId`.
- Server derives role from `project_members`; client-supplied role values are ignored.

- [ ] **Step 1: Add authority tests**

Extend policy tests:

```js
import { canHumanCertify } from "../../supabase/functions/_shared/datanestAiPolicy.ts";

test("admin cannot certify owner-only architecture knowledge", () => {
  assert.equal(canHumanCertify("admin",{category:"architecture",riskClass:"high",hasConflict:false}), false);
  assert.equal(canHumanCertify("owner",{category:"architecture",riskClass:"high",hasConflict:false}), true);
});

test("admin can certify normal project knowledge", () => {
  assert.equal(canHumanCertify("admin",{category:"workflow",riskClass:"normal",hasConflict:false}), true);
});
```

- [ ] **Step 2: Implement `canHumanCertify` and gate-completion helper**

```ts
export function canHumanCertify(
  role: ProjectRole,
  candidate:{category:string;riskClass:RiskClass;hasConflict:boolean}
):boolean {
  const required = requiredCertificationAuthority(candidate);
  if (required === "owner") return role === "owner";
  if (required === "admin") return role === "owner" || role === "admin";
  return role === "owner" || role === "admin";
}

export function allCertificationGatesPassed(
  runs:Array<{gate:"AUDIT"|"VERIFY"|"VALIDATE"|"STRESS_TEST";passed:boolean}>
):boolean {
  const required = new Set(["AUDIT","VERIFY","VALIDATE","STRESS_TEST"]);
  for (const run of runs) if (run.passed) required.delete(run.gate);
  return required.size === 0;
}
```

- [ ] **Step 3: Implement certification Edge Function**

For every action:

1. authenticate production user;
2. load active `project_members` row from production;
3. reject missing membership;
4. use staging service credentials to read/write candidate evidence;
5. never trust `role`, `riskClass`, `hasConflict`, or lifecycle state from the request body when authoritative staged values exist.

The handler core must derive the role and candidate server-side:

```ts
const {data:userData,error:userError}=await userClient.auth.getUser();
if(userError||!userData.user)return json({error:"Authentication is required."},401,origin);

const {data:member,error:memberError}=await userClient
  .from("project_members")
  .select("role,status")
  .eq("project_id",body.projectId)
  .eq("user_id",userData.user.id)
  .eq("status","active")
  .maybeSingle();

if(memberError||!member)return json({error:"Active project membership is required."},403,origin);

const {data:candidate,error:candidateError}=await staging
  .from("ai_learning_candidates")
  .select("*")
  .eq("id",body.candidateId)
  .eq("project_id",body.projectId)
  .single();

if(candidateError||!candidate)return json({error:"Candidate not found."},404,origin);

const candidatePolicy={
  category:candidate.category,
  riskClass:candidate.risk_class,
  hasConflict:candidate.has_conflict
};

if(body.action==="certify"&&!canHumanCertify(member.role,candidatePolicy)){
  return json({error:"Certification authority is insufficient."},403,origin);
}
```

For `certify`:
- load latest passing run for each required gate;
- compute required authority;
- permit automation only when `canAutoCertify` returns true;
- permit Admin/Owner according to `canHumanCertify`;
- append `ai_certification_decisions`;
- transition candidate to `CERTIFIED` only after the decision row commits.

For `promote`:
- require candidate `CERTIFIED`;
- load the corresponding certification decision;
- collect source Job IDs and trace IDs from `ai_candidate_evidence -> ai_intake_events`;
- call production service-role `service_promote_certified_memory`;
- record `ai_memory_supersessions` if applicable;
- return the production memory ID.

- [ ] **Step 4: Add conflict guard**

Before automated certification or promotion, compare the candidate against active production `certified_memory` in the same category. If content hashes differ and the candidate is marked conflicting by validation, force Owner review. Do not auto-deactivate existing memory.

- [ ] **Step 5: Run tests/typecheck and deploy to staging only**

```bash
npm test
npm run check
```

Deploy the function to the staging project for integration testing, not production.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/datanest-ai-certification/index.ts supabase/functions/_shared/datanestAiPolicy.ts tests/unit/datanest-ai-policy.test.mjs
git commit -m "feat: add DataNest AI certification and promotion gateway"
```

### Task 7: Route External AI Companion returns into staging

**Files:**
- Create: `supabase/functions/datanest-ai-intake/index.ts`
- Modify: `src/components/ExternalAiSidebar.tsx`
- Modify: `tests/unit/external-ai-return.test.mjs`

**Interfaces:**
- Consumes: `POST {sourceType:"ai_companion", externalAiSessionId, content}`.
- Produces: `{eventId,traceId,sessionId,jobId,trustState:"UNCERTIFIED"}`.
- Preserves external provider, External AI session ID, JOB ID, and DataNest Trace Key.

- [ ] **Step 1: Add failing source/import tests**

Extend `external-ai-return.test.mjs`:

```js
test("external AI return uses governed staging intake rather than legacy job_inputs import", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/ExternalAiSidebar.tsx"),
    "utf8"
  );
  assert.match(source, /functions\.invoke\("datanest-ai-intake"/);
  assert.doesNotMatch(source, /rpc\("import_external_ai_response"/);
  assert.match(source, /datanest:external-ai-staged/);
});

test("handoff no longer describes imported output as R&D contribution", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/components/ExternalAiSidebar.tsx"),
    "utf8"
  );
  assert.doesNotMatch(source, /external-AI R&D input/);
});
```

- [ ] **Step 2: Verify RED**

Run the specific test and confirm it fails on the old RPC call.

- [ ] **Step 3: Implement `datanest-ai-intake`**

The function must authenticate the caller, load the caller-owned external session, preserve its trace key/provider/JOB lineage, and stage it before marking the production session imported:

```ts
const {data:session,error:sessionError}=await userClient
  .from("external_ai_sessions")
  .select("id,project_id,job_id,user_id,provider,status,context_snapshot,staging_event_id,staging_trace_id")
  .eq("id",body.externalAiSessionId)
  .single();
if(sessionError||!session)return json({error:"External AI session not found."},404,origin);

if(session.staging_event_id){
  return json({
    eventId:session.staging_event_id,
    traceId:session.staging_trace_id,
    jobId:session.job_id,
    trustState:"UNCERTIFIED",
    idempotent:true
  },200,origin);
}

const traceId=String(session.context_snapshot?.trace_key||"");
const contentHash=await sha256Text(String(body.content||""));
const staged=await stageCompanionEvent(stagingService,{
  projectId:session.project_id,
  jobId:session.job_id,
  userId:session.user_id,
  externalAiSessionId:session.id,
  provider:session.provider,
  traceId,
  content:String(body.content||"").trim(),
  contentHash
});

const {data:linked,error:linkError}=await userClient.rpc("mark_external_ai_session_staged",{
  target_session:session.id,
  target_staging_event:staged.id,
  target_trace_id:traceId
});
if(linkError)throw linkError;
```

It must not insert `job_inputs`.

- [ ] **Step 4: Update the sidebar**

Replace the legacy import RPC with:

```ts
const {data,error}=await supabase.functions.invoke("datanest-ai-intake",{
  body:{
    sourceType:"ai_companion",
    externalAiSessionId:sessionId,
    content:content.trim()
  }
});
if(error)throw error;
const payload=(data||{}) as Record<string,unknown>;
setLastImportedId(String(payload.eventId||""));
window.dispatchEvent(new CustomEvent("datanest:external-ai-staged",{
  detail:{jobId:selectedJobId,eventId:payload.eventId,traceId:payload.traceId}
}));
```

Change handoff text to: `I will return the relevant result to Resonance DataNest as traceable uncertified AI Companion evidence.`

- [ ] **Step 5: Run tests/typecheck**

```bash
npm test
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/datanest-ai-intake/index.ts src/components/ExternalAiSidebar.tsx tests/unit/external-ai-return.test.mjs
git commit -m "feat: stage External AI Companion evidence"
```

### Task 8: Replace the R&D Dashboard with the DataNest AI workspace

**Files:**
- Create: `src/components/DataNestAiWorkspace.tsx`
- Create: `src/components/DataNestAiChatPanel.tsx`
- Create: `src/components/DataNestAiMemoryPanel.tsx`
- Create: `src/components/DataNestAiCertificationPanel.tsx`
- Modify: `src/components/DataNestApp.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/unit/datanest-ai-source.test.mjs`
- Delete after replacement is wired: `src/components/RnDDashboard.tsx`

**Interfaces:**
- `DataNestAiWorkspace({projectId,currentUserId,currentUserEmail,role,canOperate,openScheduler,setNotice,setError})`.
- Chat panel consumes runtime context/turns and emits `send(message)`.
- Memory panel consumes certified-memory items.
- Certification panel consumes role and invokes `datanest-ai-certification`.
- Job selection continues dispatching `datanest:job-selected` so External AI Companion remains synchronized.

- [ ] **Step 1: Write failing source tests for the replacement**

Create `tests/unit/datanest-ai-source.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");

test("navigation exposes DataNest AI and not the R&D Dashboard", () => {
  const source=fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");
  assert.match(source,/label:"DataNest AI"/);
  assert.doesNotMatch(source,/label:"R&D Dashboard"/);
});

test("DataNest AI workspace exposes chat, current job, certified memory and certification", () => {
  const source=fs.readFileSync(path.join(root,"src/components/DataNestAiWorkspace.tsx"),"utf8");
  assert.match(source,/DataNest AI/);
  assert.match(source,/Current Job Context/);
  assert.match(source,/Certified Memory/);
  assert.match(source,/Learning & Certification/);
});

test("old UNIFI Copilot identity is absent from runtime UI source", () => {
  const files=[
    "src/components/DataNestApp.tsx",
    "src/components/DataNestAiWorkspace.tsx",
    "src/components/DataNestAiChatPanel.tsx"
  ];
  for(const file of files){
    const source=fs.readFileSync(path.join(root,file),"utf8");
    assert.doesNotMatch(source,/UNIFI Copilot/);
  }
});
```

- [ ] **Step 2: Verify RED**

Run the specific test and confirm missing component/navigation failures.

- [ ] **Step 3: Build the workspace orchestrator**

`DataNestAiWorkspace` loads accessible jobs from production RLS, maintains selected Job/session, dispatches `datanest:job-selected`, and calls `datanest-ai-chat` with `action:"context"`.

Use this state/refresh shape:

```tsx
const [selectedJobId,setSelectedJobId]=useState("");
const [sessionId,setSessionId]=useState("");
const [context,setContext]=useState<DataNestAiContext|null>(null);

const refreshContext=useCallback(async()=>{
  if(!selectedJobId)return;
  const supabase=getSupabase();
  if(!supabase)return;
  const {data,error}=await supabase.functions.invoke("datanest-ai-chat",{
    body:{action:"context",jobId:selectedJobId,sessionId:sessionId||null}
  });
  if(error)throw error;
  setContext(data as DataNestAiContext);
  if((data as DataNestAiContext).sessionId)setSessionId((data as DataNestAiContext).sessionId);
},[selectedJobId,sessionId]);

useEffect(()=>{
  if(!selectedJobId)return;
  window.dispatchEvent(new CustomEvent("datanest:job-selected",{detail:{jobId:selectedJobId}}));
  void refreshContext();
},[selectedJobId,refreshContext]);
```

Listen for `datanest:external-ai-staged` and refresh current-session context when the event Job matches the selected Job.

- [ ] **Step 4: Build the chat panel**

Each turn displays author, timestamp, JOB code, trace ID, trust badge, and provider route for AI output. Submit with a stable request UUID:

```tsx
const requestId=requestIdRef.current||crypto.randomUUID();
requestIdRef.current=requestId;
const {data,error}=await supabase.functions.invoke("datanest-ai-chat",{
  body:{
    action:"chat",
    jobId,
    sessionId:sessionId||null,
    clientRequestId:requestId,
    message:draft.trim()
  }
});
if(error)throw error;
setSessionId(String(data.sessionId));
setDraft("");
requestIdRef.current="";
```

On failure before staging, keep both the draft and request ID so the user can retry idempotently.

- [ ] **Step 5: Build memory and certification panels**

`DataNestAiMemoryPanel` renders only certified items returned by the context gateway. Each item includes version, category, source Job IDs, certification class, confidence/evidence indicator, and supersession state.

`DataNestAiCertificationPanel` is visible to owner/admin. It shows candidates, gates, conflicts, required authority, and action controls. Operator/viewer roles never receive certification action buttons.

- [ ] **Step 6: Replace navigation and overview copy**

In `DataNestApp.tsx`:
- change `ViewKey` member `"rnd"` to `"ai"`;
- nav label becomes `DataNest AI`;
- dynamic import `DataNestAiWorkspace`;
- replace `Open R&D` with `Open DataNest AI`;
- keep `UNIFI Planner` intact because only UNIFI Copilot is being removed;
- pass `membership.role` to DataNest AI.

- [ ] **Step 7: Remove old R&D component and add styles**

Delete `RnDDashboard.tsx` only after the app no longer imports it. Add focused `.datanestAi*` styles without unrelated global redesign.

- [ ] **Step 8: Run tests/build**

```bash
npm test
npm run check
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/DataNestAiWorkspace.tsx src/components/DataNestAiChatPanel.tsx src/components/DataNestAiMemoryPanel.tsx src/components/DataNestAiCertificationPanel.tsx src/components/DataNestApp.tsx src/app/globals.css tests/unit/datanest-ai-source.test.mjs
git rm src/components/RnDDashboard.tsx
git commit -m "feat: replace R&D workspace with DataNest AI"
```

### Task 9: Replace Stakeholders & AI Credit with AI Operations and clean Product Lab copy

**Files:**
- Create: `src/components/AiOperationsDashboard.tsx`
- Modify: `src/components/DataNestApp.tsx`
- Modify: `src/components/AiReconciliationPanel.tsx`
- Modify: `src/components/ProductLab.tsx`
- Modify: `tests/unit/datanest-ai-source.test.mjs`
- Delete: `src/components/StakeholderDashboard.tsx`

**Interfaces:**
- `AiOperationsDashboard({projectId,currentUserId,canManageAi})`.
- Retains provider connection/rotation, domain allowlist, budget policy, and `AiReconciliationPanel`.
- Contains no contribution ledger, stake pool, external credit declaration, acceptance/rejection/reversal, scoring history, or suggested-stake calculations.

- [ ] **Step 1: Add failing legacy-removal assertions**

Append:

```js
test("active client source no longer references contribution or stake scoring RPCs", () => {
  const files=[
    "src/components/DataNestApp.tsx",
    "src/components/AiOperationsDashboard.tsx",
    "src/components/AiReconciliationPanel.tsx",
    "src/components/ProductLab.tsx"
  ];
  const source=files.map(file=>fs.readFileSync(path.join(root,file),"utf8")).join("\n");
  for(const forbidden of [
    "contribution_ledger",
    "get_stakeholder_summary",
    "submit_external_ai_credit",
    "accept_contribution",
    "reject_contribution",
    "reverse_contribution",
    "suggested_product_stake"
  ]) assert.equal(source.includes(forbidden),false,forbidden+" must be retired from active client source");
});
```

- [ ] **Step 2: Verify RED**

Expected: FAIL because the current stakeholder dashboard and Product Lab copy still reference contribution semantics.

- [ ] **Step 3: Create AI Operations from the operational subset**

Move only provider connection/rotation, project budget, provider-domain allowlist, and `AiReconciliationPanel`. The component state starts as:

```tsx
export default function AiOperationsDashboard({
  projectId,currentUserId,canManageAi
}:{projectId:string;currentUserId:string;canManageAi:boolean}) {
  const [connections,setConnections]=useState<Connection[]>([]);
  const [budget,setBudget]=useState<BudgetStatus|null>(null);
  const [allowlist,setAllowlist]=useState<AllowDomain[]>([]);
  // provider connection form + budget form + allowlist form only
}
```

Remove all `Stakeholder`, `Contribution`, `StakeHistory`, credit form, stake pool, pending/accepted contribution, and scoring-history state/queries/functions/UI.

Navigation label becomes `AI Operations`, not `Stakeholders & AI Credit`.

- [ ] **Step 4: Clean usage and Product Lab wording**

Change `AiReconciliationPanel` explanatory copy to end after usage/cost evidence; remove the sentence about contribution acceptance.

In `ProductLab.tsx`:
- `Contribution is tracked ...` becomes `Test evidence is recorded once per tester/test-version/build.`
- the page intro no longer claims contribution scoring is deduplicated;
- example copy `stakeholder workspace` becomes `DataNest workspace`.

Product test execution remains intact; only contribution-scoring semantics are removed.

- [ ] **Step 5: Wire AI Operations and remove old dashboard**

Update dynamic import/render in `DataNestApp.tsx`, then delete `StakeholderDashboard.tsx`.

- [ ] **Step 6: Run source/unit/build checks**

```bash
npm test
npm run check
npm run build
```

Expected: PASS and no active client source contains the retired scoring RPC names.

- [ ] **Step 7: Commit**

```bash
git add src/components/AiOperationsDashboard.tsx src/components/DataNestApp.tsx src/components/AiReconciliationPanel.tsx src/components/ProductLab.tsx tests/unit/datanest-ai-source.test.mjs
git rm src/components/StakeholderDashboard.tsx
git commit -m "feat: retire stake scoring UI and add AI operations"
```

### Task 10: Add branch E2E seed, browser acceptance, and stress tests

**Files:**
- Create: `scripts/seed-datanest-ai-e2e.mjs`
- Create: `tests/browser/datanest-ai.spec.ts`
- Create: `tests/stress/datanest-ai-stress.mjs`
- Modify: `package.json`

**Interfaces:**
- E2E seed consumes staging project URL + service key + `DATANEST_AI_E2E_EMAIL/PASSWORD`.
- Browser test consumes branch-hosted preview URL and the same E2E user credentials.
- Stress test calls `datanest-ai-chat` with concurrent unique IDs plus deliberate duplicates.

- [ ] **Step 1: Add E2E scripts to `package.json`**

Add:

```json
{
  "scripts": {
    "test:browser:datanest-ai": "playwright test tests/browser/datanest-ai.spec.ts",
    "test:stress:datanest-ai": "node tests/stress/datanest-ai-stress.mjs",
    "seed:e2e:datanest-ai": "node scripts/seed-datanest-ai-e2e.mjs"
  }
}
```

Keep all existing scripts.

- [ ] **Step 2: Implement deterministic branch seed**

The seed script uses the staging-project service-role client and never prints credentials:

```js
const admin=createClient(process.env.DATANEST_AI_STAGING_URL,process.env.DATANEST_AI_STAGING_SERVICE_ROLE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false}
});
const email=process.env.DATANEST_AI_E2E_EMAIL;
const password=process.env.DATANEST_AI_E2E_PASSWORD;
if(!email||!password)throw new Error("E2E credentials are required.");

const listed=await admin.auth.admin.listUsers();
let user=listed.data.users.find(item=>item.email===email);
if(!user){
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(created.error)throw created.error;
  user=created.data.user;
}
```

Then idempotently upsert `projects.slug='resonance-datanest'`, active owner membership, and one Job titled `DataNest AI E2E Job`. Print only project/job IDs.

- [ ] **Step 3: Write browser acceptance flow**

`tests/browser/datanest-ai.spec.ts` must sign in normally and prove:

```ts
test("human input is traced, remains uncertified, then certified memory becomes reusable", async ({page}) => {
  await page.goto(process.env.DATANEST_APP_PATH || "/");
  await page.getByLabel("Email").fill(process.env.DATANEST_AI_E2E_EMAIL!);
  await page.getByLabel("Password").fill(process.env.DATANEST_AI_E2E_PASSWORD!);
  await page.getByRole("button",{name:"Sign in"}).click();

  await page.getByRole("button",{name:"DataNest AI"}).click();
  await page.getByText("DataNest AI E2E Job").click();

  await page.getByPlaceholder(/development input/i).fill("Keep DataNest AI trace IDs visible on every turn.");
  await page.getByRole("button",{name:/Send to DataNest AI/i}).click();

  await expect(page.getByText("UNCERTIFIED").last()).toBeVisible();
  await expect(page.getByText(/DN-AI-/).last()).toBeVisible();
  await expect(page.getByText(/Certified Memory/i)).toBeVisible();
});
```

Add a second browser test that opens the External AI Sidebar and verifies the Return-to-DataNest path produces an UNCERTIFIED AI Companion evidence card in the same Job.

Certification UI actions that require the full gate chain can use seeded validation rows in the branch for browser acceptance; the SQL/server tests separately prove gate enforcement.

- [ ] **Step 4: Write stress test**

The stress test sends concurrent unique requests and deliberate duplicates:

```js
const requests=Array.from({length:25},(_,index)=>({
  clientRequestId:crypto.randomUUID(),
  message:`stress-message-${index}`
}));
const results=await Promise.all(requests.map(item=>
  client.functions.invoke("datanest-ai-chat",{
    body:{action:"chat",jobId,sessionId,clientRequestId:item.clientRequestId,message:item.message}
  })
));
if(results.some(result=>result.error))throw new Error("unique stress request failed");

const duplicateId=requests[0].clientRequestId;
const duplicates=await Promise.all(Array.from({length:5},()=>
  client.functions.invoke("datanest-ai-chat",{
    body:{action:"chat",jobId,sessionId,clientRequestId:duplicateId,message:requests[0].message}
  })
));
if(duplicates.some(result=>result.error||!result.data?.idempotent))throw new Error("duplicate request was not idempotent");
```

Afterward query staging with service role and assert 25 distinct human intake events and 25 distinct output events, and assert no event from a second seeded Job appears in the first Job/session context. Exit non-zero on mismatch.

- [ ] **Step 5: Run E2E/stress on the dedicated staging project**

Run:

```bash
npm run seed:e2e:datanest-ai
npm run test:browser:datanest-ai
npm run test:stress:datanest-ai
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/seed-datanest-ai-e2e.mjs tests/browser/datanest-ai.spec.ts tests/stress/datanest-ai-stress.mjs
git commit -m "test: add DataNest AI browser and stress acceptance"
```

### Task 11: Add encrypted staging export/restore and retention runbook

**Files:**
- Create: `scripts/lib/encrypted-backup.mjs`
- Create: `scripts/export-datanest-ai-staging.mjs`
- Create: `scripts/restore-datanest-ai-staging.mjs`
- Create: `tests/unit/datanest-ai-backup.test.mjs`
- Create: `docs/runbooks/datanest-ai-staging-retention.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `DATANEST_AI_STAGING_URL`, `DATANEST_AI_STAGING_SERVICE_ROLE_KEY`, `DATANEST_AI_BACKUP_KEY`.
- Produces: encrypted `.datanest-ai-backup` files containing versioned JSON for staging evidence tables.
- Backup files are never committed.

- [ ] **Step 1: Write crypto round-trip test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { encryptBackup, decryptBackup } from "../../scripts/lib/encrypted-backup.mjs";

test("staging backup encryption round-trips and does not expose plaintext", () => {
  const key=Buffer.alloc(32,7);
  const plaintext=Buffer.from(JSON.stringify({events:[{content:"sensitive raw input"}]}));
  const encrypted=encryptBackup(plaintext,key);
  assert.equal(encrypted.includes("sensitive raw input"),false);
  assert.deepEqual(decryptBackup(encrypted,key),plaintext);
});
```

- [ ] **Step 2: Verify RED**

Run and expect missing module failure.

- [ ] **Step 3: Implement AES-256-GCM backup envelope**

Use Node `crypto.createCipheriv("aes-256-gcm", key, iv)` with a random 12-byte IV, store a small JSON header containing format version, IV, auth tag, and ciphertext encoded base64. Require exactly 32 decoded key bytes.

- [ ] **Step 4: Implement export and restore**

Export these tables in dependency-safe order:
`ai_sessions`, `ai_intake_events`, `ai_reasoning_envelopes`, `ai_trend_clusters`, `ai_trend_evidence`, `ai_learning_candidates`, `ai_candidate_evidence`, `ai_validation_runs`, `ai_certification_decisions`, `ai_memory_supersessions`.

The export script:
- pages through all rows;
- serializes `{formatVersion:1,exportedAt,projectRef,tables:{...}}`;
- encrypts before writing;
- writes under `backups/`;
- never logs row content.

Restore:
- decrypts;
- validates `formatVersion===1`;
- requires an explicit `--target-ref` matching the configured staging ref;
- upserts by primary key in dependency order;
- refuses to target the production project ref.

- [ ] **Step 5: Add retention runbook**

The runbook must state:
- persistent branch must not be deleted during normal PR lifecycle;
- raw evidence is retained indefinitely;
- native branch backup/PITR, if available, is the primary recovery mechanism;
- encrypted export is the secondary recovery mechanism;
- production release is blocked until at least one durable backup destination outside the staging project is configured and a restore drill succeeds;
- if native persistent-branch backup is unavailable, stop and obtain user approval for the durable external destination rather than silently choosing one.

This is an explicit blocking gate, not a deferred promise.

- [ ] **Step 6: Ignore backup artifacts and test**

Add `backups/` to `.gitignore`.

Run:

```bash
node --test tests/unit/datanest-ai-backup.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 7: Perform one staging export/restore drill**

Exercise the real encrypted restore path without deleting retained evidence. Add a `--verify-only` mode to `restore-datanest-ai-staging.mjs` that decrypts the backup, validates the format, computes per-table row counts plus SHA-256 over canonical JSON, and queries the target branch to compare the same IDs/hashes without writing.

Run:

```bash
node scripts/export-datanest-ai-staging.mjs
BACKUP_FILE="$(ls -t backups/*.datanest-ai-backup | head -1)"
node scripts/restore-datanest-ai-staging.mjs "$BACKUP_FILE" \
  --target-ref "$DATANEST_AI_STAGING_PROJECT_REF" \
  --verify-only
```

Expected: every exported table reports identical row count and canonical hash on the dedicated staging project. Then perform an idempotent restore of the same backup:

```bash
node scripts/restore-datanest-ai-staging.mjs "$BACKUP_FILE" \
  --target-ref "$DATANEST_AI_STAGING_PROJECT_REF"
```

Expected: PASS, no duplicate primary keys, and post-restore counts/hashes remain unchanged. This tests decrypt, validation, target-ref protection, dependency ordering, and upsert behavior without deleting raw retained evidence. Keep the dedicated staging project.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/encrypted-backup.mjs scripts/export-datanest-ai-staging.mjs scripts/restore-datanest-ai-staging.mjs tests/unit/datanest-ai-backup.test.mjs docs/runbooks/datanest-ai-staging-retention.md .gitignore
git commit -m "feat: add recoverable DataNest AI staging backups"
```

### Task 12: Wire certification CI, release manifest, and exact-head release gates

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/datanest-ai-certification.yml`
- Modify: `.github/workflows/pages.yml`
- Create: `supabase/config.toml`
- Modify: `scripts/write-release-manifest.mjs`
- Modify: `public/release-manifest.json` only through the generator during build, not by hand.

**Interfaces:**
- CI consumes repository secrets for the dedicated staging project and E2E account.
- Release manifest reports database release `datanest-ai-governed-memory-v1` and Edge Function versions.

- [ ] **Step 1: Extend normal CI without weakening existing checks**

Keep existing:
- `npm ci`
- `npm test`
- `npm run check`
- production dependency audit
- release manifest generation
- `npm run build`
- Docker build

Add a source guard:

```bash
if grep -R --line-number --exclude-dir=node_modules --exclude-dir=docs   -E 'UNIFI Copilot|submit_external_ai_credit|suggested_product_stake' src supabase/functions; then
  echo "Retired Copilot/contribution-scoring source remains active."
  exit 1
fi
```

- [ ] **Step 2: Add governed certification workflow**

`.github/workflows/datanest-ai-certification.yml` runs on PRs targeting the eventual production base and `workflow_dispatch`.

Required secret names:
- `DATANEST_AI_STAGING_URL`
- `DATANEST_AI_STAGING_PUBLISHABLE_KEY`
- `DATANEST_AI_STAGING_SERVICE_ROLE_KEY`
- `DATANEST_AI_STAGING_DB_URL`
- `DATANEST_AI_E2E_EMAIL`
- `DATANEST_AI_E2E_PASSWORD`

The browser job does not depend on an unspecified Vercel/Pages preview. Build a local static export whose public Supabase runtime points at the dedicated staging project:

```yaml
- name: Fail clearly when governed staging secrets are absent
  shell: bash
  env:
    STAGING_URL: ${{ secrets.DATANEST_AI_STAGING_URL }}
    STAGING_KEY: ${{ secrets.DATANEST_AI_STAGING_PUBLISHABLE_KEY }}
    STAGING_DB: ${{ secrets.DATANEST_AI_STAGING_DB_URL }}
    E2E_EMAIL: ${{ secrets.DATANEST_AI_E2E_EMAIL }}
    E2E_PASSWORD: ${{ secrets.DATANEST_AI_E2E_PASSWORD }}
  run: |
    test -n "$STAGING_URL" || { echo "DATANEST_AI_STAGING_URL is required"; exit 1; }
    test -n "$STAGING_KEY" || { echo "DATANEST_AI_STAGING_PUBLISHABLE_KEY is required"; exit 1; }
    test -n "$STAGING_DB" || { echo "DATANEST_AI_STAGING_DB_URL is required"; exit 1; }
    test -n "$E2E_EMAIL" || { echo "DATANEST_AI_E2E_EMAIL is required"; exit 1; }
    test -n "$E2E_PASSWORD" || { echo "DATANEST_AI_E2E_PASSWORD is required"; exit 1; }

- name: Build static DataNest against governed staging
  env:
    DATANEST_STATIC_EXPORT: "true"
    NEXT_PUBLIC_BASE_PATH: ""
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.DATANEST_AI_STAGING_URL }}
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.DATANEST_AI_STAGING_PUBLISHABLE_KEY }}
    SUPABASE_URL: ${{ secrets.DATANEST_AI_STAGING_URL }}
    SUPABASE_PUBLISHABLE_KEY: ${{ secrets.DATANEST_AI_STAGING_PUBLISHABLE_KEY }}
  run: |
    node scripts/write-runtime-config.mjs public/runtime-config.js
    npm run build

- name: Serve static export
  run: |
    python3 -m http.server 4173 --directory out >/tmp/datanest-ai-http.log 2>&1 &
    echo $! > /tmp/datanest-ai-http.pid
    for i in {1..30}; do
      curl --fail --silent http://127.0.0.1:4173/ >/dev/null && exit 0
      sleep 1
    done
    cat /tmp/datanest-ai-http.log
    exit 1

- name: Run governed browser acceptance
  env:
    PLAYWRIGHT_BASE_URL: http://127.0.0.1:4173
    DATANEST_APP_PATH: /
    DATANEST_AI_E2E_EMAIL: ${{ secrets.DATANEST_AI_E2E_EMAIL }}
    DATANEST_AI_E2E_PASSWORD: ${{ secrets.DATANEST_AI_E2E_PASSWORD }}
  run: npm run test:browser:datanest-ai
```

Jobs:
1. install Node 22 dependencies;
2. run staging and production SQL acceptance against the branch;
3. seed E2E;
4. build and serve the local static export against staging;
5. run browser acceptance against that local export;
6. run stress tests;
7. emit a machine-readable certification artifact containing exact commit SHA and pass/fail results.

Do not make a missing secret look like success; the governed acceptance job must fail with a clear configuration message.

- [ ] **Step 3: Commit explicit Edge Function authentication configuration**

Create `supabase/config.toml`:

```toml
[functions.datanest-ai-chat]
verify_jwt = true

[functions.datanest-ai-intake]
verify_jwt = true

[functions.datanest-ai-certification]
verify_jwt = true
```

This keeps JWT verification explicit and consistent when the three new functions are deployed through the Supabase CLI/GitHub integration. The functions themselves still perform caller and role checks; JWT verification is not treated as sufficient authorization.

- [ ] **Step 4: Update release manifest identities**

Set:
- database release: `datanest-ai-governed-memory-v1`;
- AI chat: `datanest-ai-chat@1`;
- external intake: `datanest-ai-intake@1`;
- certification: `datanest-ai-certification@1`;
- provider management remains `manage-ai-provider-v2@1`;
- invites remain `send-job-invite@1`.

Update the live Pages verification greps to match these exact values.

- [ ] **Step 5: Run the complete local/static verification**

```bash
npm ci
npm test
npm run check
npm audit --omit=dev --audit-level=high
npm run build
docker build -t resonance-datanest:datanest-ai-cert .
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/datanest-ai-certification.yml .github/workflows/pages.yml supabase/config.toml scripts/write-release-manifest.mjs
git commit -m "ci: certify DataNest AI governed memory releases"
```

### Task 13: Run final security review, exact-head acceptance, and prepare the PR

**Files:**
- Modify only if verification finds a real root-cause defect.
- Add final verification evidence to the PR body; do not fabricate or pre-write pass results.

**Interfaces:**
- Consumes: exact Git commit, dedicated staging project, exact Edge Function versions, full CI/certification results.
- Produces: a review-ready PR; no merge in this task.

- [ ] **Step 1: Rebase/alignment check before final verification**

If the External AI Companion parent branch has merged since implementation began, rebase/align the DataNest AI branch onto the exact current production base. Resolve only real conflicts; do not drop trace-handoff behavior.

After any rebase, re-run all checks from Task 12.

- [ ] **Step 2: Run Supabase advisors on both environments**

Run security and performance advisors against:
- dedicated staging project;
- production project schema as represented by the candidate migration state before production apply.

No new RLS, exposed-secret, unsafe-function, or missing-index finding attributable to DataNest AI may remain unresolved.

- [ ] **Step 3: Run adversarial acceptance**

Exercise at least:
- cross-Job evidence request;
- forged `role:"owner"` body from an Admin account;
- prompt injection asking DataNest AI to mark itself certified;
- fabricated certification ID;
- conflicting candidate with active certified memory;
- duplicate chat request;
- staging database outage;
- provider timeout/unknown outcome;
- attempted direct browser insert to staging tables;
- attempted direct authenticated call to `service_promote_certified_memory`.

Expected: every unauthorized or unsafe path is denied/fails closed, with no project-wide memory promotion.

- [ ] **Step 4: Verify legacy-data preservation**

Record row counts and hashes for existing legacy contribution/stake audit tables before the production migration rehearsal. After rehearsal, confirm historical rows are unchanged and the contribution-tracking triggers are absent.

Product Lab test evidence must still record successfully.

- [ ] **Step 5: Verify complete lineage**

Create one synthetic candidate through the full staging flow and verify:

```text
certified_memory
  -> certification_id
  -> ai_certification_decisions
  -> ai_validation_runs
  -> ai_learning_candidates
  -> ai_candidate_evidence
  -> ai_intake_events
  -> source trace IDs + Job IDs
```

Missing any link is a release blocker.

- [ ] **Step 6: Verify retention recovery**

Confirm the persistent branch is not ephemeral, run the encrypted backup/restore drill, and document the durable backup destination or native backup/PITR capability. If neither exists, stop: the release does not meet the approved indefinite-retention design.

- [ ] **Step 7: Let exact-head CI drain**

Fetch the exact PR head SHA and wait for:
- normal CI;
- DataNest AI certification workflow;
- deployment/preview status;
- all required status checks.

Do not use stale earlier-run results after a new commit.

- [ ] **Step 8: Prepare PR, but do not merge**

The PR body must summarize:
- DataNest AI replaces UNIFI Copilot;
- R&D contribution/stake scoring is retired while history is preserved;
- raw human/AI Companion evidence is staged and retained;
- certified memory is project-wide and traceable;
- hybrid/tiered certification rules;
- exact staging project/ref used;
- exact Edge Function versions;
- exact-head test/security/stress/browser results;
- known operational backup destination/capability.

Stop with the PR ready for review. Merge only after a separate explicit user instruction.

---

## Self-Review Checklist

Before execution, verify the plan against the approved spec:

- Spec sections 1–5: covered by Tasks 1, 4, 7, 8.
- Staging data model: Task 2.
- Certified production memory: Task 3.
- Certification state machine/policy: Tasks 1, 2, 6.
- Dual-context reasoning and provenance envelope: Task 4.
- External AI Companion: Task 7.
- Legacy contribution cleanup: Tasks 3 and 9.
- Provider/budget/security controls: Tasks 3, 4, 9.
- Error handling: Tasks 4, 6, 13.
- Stress/security/browser testing: Tasks 10, 12, 13.
- Retention and recovery: Task 11 and Task 13.
- Migration/release/rollback boundaries: Tasks 3, 12, 13.
- No task authorizes a production merge without an explicit later instruction.
## Execution Topology Amendment — 2026-09-24

**Ruling:** Supabase Pro Branching is not required for the approved functionality. Replace every planned dedicated Supabase staging project with the already-created dedicated staging project **DataNest AI Staging** (project ref `qchttpcyqlqnhvahprhz`, region `eu-central-1`). Production remains project ref `sgqdmfgjbprsoqsmgigi`. All server-only gateway, RLS, certification, retention, backup, stress-test, and promotion requirements remain binding. Staging-only DDL must be applied only to `qchttpcyqlqnhvahprhz` and must never be applied to production. Git branch `feature/datanest-ai-governed-memory` remains the code-isolation boundary.
