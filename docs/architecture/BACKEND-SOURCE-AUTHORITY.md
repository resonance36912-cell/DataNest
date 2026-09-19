# RONSAS sovereign backend source authority

Snapshot: 2026-09-19

The local RONSAS backend now has an independent private Git source authority:

- Repository: `resonance36912-cell/rons-sovereign-backend-source`
- Ealiophin source: `%USERPROFILE%\Resonance\OpenNova\sources\rons-sovereign-backend-source`
- Baseline commit: `c36a808`
- Baseline tag: `ronsas-source-baseline-2026-09-19`
- Extracted from: `ResonanceAppDev_ZeroCredit_v1.5.8`

## Owned source

The repository owns source history for:

- authentication service;
- storage service;
- sovereign gateway;
- Hub/backend PostgreSQL migrations;
- provider-neutral backend contract and compatibility adapter;
- canonical local backend Compose definition;
- direct backend/billing regression tests.

It explicitly does **not** own mutable databases, auth state, object-storage data, Podman volumes, runtime secrets, logs, caches, or deployed container state.

## Validation baseline

The extracted source tree was recreated with Python 3.12 and pinned dependencies. All 34 direct backend tests pass locally on Ealiophin.

The first GitHub Actions run did not allocate a runner. GitHub annotated the run with an account payment/spending-limit condition before any workflow step executed. This is an infrastructure block, not a backend test failure.

## Runtime contract

The active local backend remains loopback-only:

| Service | Endpoint |
| --- | --- |
| PostgreSQL | `127.0.0.1:55432` |
| Gateway | `http://127.0.0.1:58600` |
| Auth | `http://127.0.0.1:58680` |
| Storage | `http://127.0.0.1:59000` |

Source promotion and runtime promotion are separate. Changes must merge through the private backend source repository, build new versioned service images, deploy to isolated staging first, pass backend/billing/recovery tests, and only then move to the live loopback stack.

## Staging boundary

Issue #55 uses the separate `resonance-sovereign-staging-v2` Podman project for destructive/disposable validation. It has independent secrets and volumes and is never exposed through the public edge.

## Billing migration rule

Checkout launch/read paths already support the sovereign provider adapter. PayFast ITN settlement still contains direct hosted-Supabase writes and must be migrated behind a named, transaction-safe gateway procedure before PayFast sandbox payment/entitlement tests can be marked isolated.

Do not test PayFast settlement against live billing data to work around that migration.
