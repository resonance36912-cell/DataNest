# DataNest AI Adversarial Stress Test — 2026-09-28

## Purpose

This record converts the DataNest AI architecture stress test from a conceptual exercise into a verified database-level validation record. Tests were run against the staging Supabase project and production schema metadata. No production mutation was performed by the stress-test transactions.

## Environment

- Repository: DataNest-Supository/DataNest
- Production Supabase project: sgqdmfgjbprsoqsmgigi
- Staging Supabase project: qchttpcyqlqnhvahprhz
- Staging test project: 0f7fe314-f3de-499f-b2f8-00b8207caa65
- Staging test user: d8dab5e9-4260-463e-bcbe-12c66c02af1d

## Verified controls

### 1. Production governed data boundary

Production contains `contribution_ledger`, `certified_memory`, and `external_ai_sessions`. Production does not contain the staging raw-intake table `ai_intake_events`.

**Result: PASS**

Implication: production impact scoring must remain based on governed contribution data, not raw intake activity.

### 2. Production privilege boundary

The following sensitive service functions are not executable by `anon` or `authenticated`:

- `service_promote_certified_memory`
- `service_finish_ai_request`

The public AI request and certified-memory retrieval functions require authentication through their function logic and/or are callable only by authenticated users.

**Result: PASS**

### 3. Authority escalation control

`approve_authority_envelope_v2` verifies:

- authenticated caller
- target envelope exists and is proposed
- owner/admin project authority
- granted autonomy does not exceed requested autonomy
- consequence-specific minimum autonomy
- independent approval for A4/independent cases
- proposer cannot self-approve independent/A4 widening
- envelope has not expired

**Result: PASS by inspected production implementation**

### 4. Contribution certification control

`certify_contribution_v1` verifies:

- authenticated caller
- contribution exists
- owner/admin project authority
- contributor cannot certify their own contribution
- contribution is accepted and scored
- a final versioned score exists

**Result: PASS by inspected production implementation**

### 5. DataNest AI request idempotency

A staging transaction executed `begin_datanest_ai_request` twice with the same user, job, client request ID and fingerprint.

Observed replay response:

- `is_new=false`
- same request record ID
- status remained `pending`
- same project/job identity

The transaction was rolled back.

**Result: PASS**

### 6. Duplicate request payload protection

A staging transaction attempted to reuse the same client request ID with a different message fingerprint.

Observed behavior:

- request rejected with `client_request_id payload mismatch.`

The transaction was rolled back.

**Result: PASS**

### 7. Contribution ledger row isolation

Under the staging `authenticated` role and test-user JWT subject, a direct query of `contribution_ledger` returned:

- visible rows: 0
- foreign-user rows: 0

The production policy inspected for this table permits authenticated SELECT only for the row owner or project owner/admin.

**Result: PASS for the tested staging identity**

### 8. Certified-memory direct table exposure

Production `certified_memory` has RLS enabled and direct SELECT/INSERT/UPDATE/DELETE privileges are not granted to `authenticated` or `anon`.

**Result: PASS**

Certified memory is therefore accessed through governed server-side functions rather than direct client table access.

## Findings requiring continued audit

### Security Advisor finding: RLS-enabled tables without policies

Production currently reports four public tables with RLS enabled but no table policies:

- `ai_shared_provider_configs`
- `certified_memory`
- `development_command_turns`
- `development_command_working_memory`

This is not automatically a vulnerability because direct table privileges can also be revoked and governed RPCs can provide the intended access path. Production privilege inspection confirms the latter for the listed DataNest working-memory/certified-memory tables.

**Status: REVIEW / DOCUMENTED**

The four tables should remain on the security-audit watchlist. If direct table access is ever granted, explicit RLS policies must be added.

### Security Advisor finding: SECURITY DEFINER functions

Production reports 110 SECURITY DEFINER functions executable by `authenticated`. This is a broad advisor finding, not proof that all 110 are unsafe. The inspected critical functions contain explicit authentication and project/role checks, while service-only functions are not executable by `authenticated`.

**Status: REVIEW / NOT BLOCKING**

A function-by-function privilege review remains appropriate before any blanket revocation.

### Development Work expertise routing

Open PR #197 introduces `development-work-expertise-v1` and bridges staged routed work into the governed production contribution lifecycle. Its final implementation must preserve the production boundary: `ai_intake_events` is staging-only, while production scoring is sourced from `contribution_ledger`.

**Status: GATE BEFORE MERGE**

Do not merge or release the routing change until its final branch is verified against the current production schema and CI.

## Test limitations

This validation is not a full penetration test. It verifies database controls, authorization logic, idempotency, and privilege boundaries using available connected project tooling. It does not prove resistance to every browser, provider, network, credential, or infrastructure attack.

## Acceptance rule

A DataNest AI action should remain governed by:

**IDENTITY → PROJECT AUTHORITY → DATA POLICY → AI/MEMORY POLICY → RESOURCE/CAPABILITY → EXECUTION AUTHORITY → APPROVAL → EXECUTION → EVIDENCE → VERIFICATION → CERTIFICATION**

Raw AI activity must not mint contribution value or certified memory.
