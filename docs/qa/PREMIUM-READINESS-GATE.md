# RONSAS Premium Readiness Gate

This gate converts the remaining September 2026 public-audit recommendations into a staging-only release process.

## Safety boundary

Do **not** run load, stress, spike, soak, destructive recovery, payment-replay, concurrency, or failure-injection tests against public production domains.

The harness blocks known production Resonance and Career Compass hosts. Traffic is disabled by default and requires an explicit staging target plus `-AllowStagingTraffic`. Load mode additionally requires `RONSAS_ALLOW_LOAD_TEST=1`.

## Current certification state

The repository contains the guardrails and acceptance manifest, but premium readiness is **not certified** merely because these files exist. Certification requires reproducible evidence from production-like staging.

The assessment command is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-RonsasPremiumReadiness.ps1
```

Use `-RequireReady` when you want missing prerequisites or fixture coverage to fail the command.

## Required staging prerequisites

Set these environment variables to `1` only after the named prerequisite is genuinely available:

- `RONSAS_DISPOSABLE_ACCOUNTS_READY`
- `RONSAS_SANDBOX_PAYMENT_READY`
- `RONSAS_PROVIDER_STUBS_READY`
- `RONSAS_OBSERVABILITY_READY`
- `RONSAS_APPROVED_TEST_BUDGET`

No secret values should be stored in Git. These variables are readiness flags, not credentials.

## Output-quality fixtures

`qa/premium-readiness/fixture-manifest.json` defines the required minimums:

- at least 30 representative fixtures per generative app;
- normal, boundary, malformed, multilingual, and ambiguous inputs;
- at least three runs per generative case;
- at least 95% representative-run pass rate;
- zero critical failures.

Fixture directories intentionally begin empty. Do not manufacture placeholder fixtures to satisfy the count. Add reviewed fixtures as real test material becomes available.

## Smoke test

After staging is approved and all prerequisites/fixture gates are ready:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-RonsasPremiumReadiness.ps1 \
  -Mode smoke \
  -TargetBaseUrl https://<staging-host>/ \
  -AllowStagingTraffic
```

Production domains are rejected even when `-AllowStagingTraffic` is present.

## Load profiles

The k6 workload is `qa/performance/reson8-staging.k6.js`.

Before a load run, set:

- `RONSAS_TEST_BASE_URL` to the approved staging origin;
- `RONSAS_ALLOW_LOAD_TEST=1`;
- `RONSAS_LOAD_PROFILE` to `smoke`, `baseline`, `peak`, `stress`, `spike`, or `soak`;
- explicit approved VU values for every non-smoke profile.

Example:

```powershell
$env:RONSAS_TEST_BASE_URL = "https://<staging-host>"
$env:RONSAS_ALLOW_LOAD_TEST = "1"
$env:RONSAS_LOAD_PROFILE = "baseline"
$env:RONSAS_BASELINE_VUS = "<approved concurrency>"
k6 run .\qa\performance\reson8-staging.k6.js
```

The script deliberately has no default concurrency for baseline/peak/stress/spike/soak because the audit requires traffic estimates, quotas, and budget to determine those values.

## Required evidence before sign-off

Attach run evidence for:

1. authenticated user journeys for each supported role;
2. sandbox payment to entitlement delivery;
3. duplicate-click and payment-replay idempotency;
4. concurrent final-credit spending;
5. upload interruption/corruption;
6. session expiry during generation;
7. provider timeout/rate-limit handling;
8. refresh/reopen of running jobs;
9. export retry after worker restart;
10. cross-account project/download isolation;
11. deletion during processing;
12. generated-output quality against reviewed fixtures;
13. WCAG 2.2 AA manual keyboard/screen-reader checks;
14. OWASP ASVS-based authentication, authorization, session, upload, validation, and data-protection checks;
15. approved staging smoke/baseline/peak/stress/spike/soak/failure-recovery results.

Every evidence bundle must identify the exact source commit, fixture-set revision, staging target, provider mode, workload profile, and date.

## Stop conditions

Abort immediately on:

- private-data exposure;
- cross-account access;
- duplicate or incorrect billing;
- lost/corrupt project data;
- uncontrolled provider cost;
- unusable paid output without recovery;
- sustained service degradation beyond the approved staging window.

The presence of this harness does not itself establish premium readiness. It makes the remaining evidence requirements explicit, repeatable, and fail-closed.
