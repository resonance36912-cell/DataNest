# Governance Control Effectiveness Monitoring

Status: implemented under accepted governance decision `DN-GOV-DEC-940A1C11150442E6`.

## Purpose

DataNest continuously checks whether core governance controls continue to produce the expected operational evidence in production. The monitor is observability-only: it records audit-safe runtime events, performs deterministic checks, writes control evidence, and surfaces anomalies to the owner.

It cannot vote, close a governance proposal, ratify a protocol, grant roles, change financial authority, amend contracts, or deploy remediation.

## Monitored controls

The first monitor release checks six existing controls:

- **CGO-AUTH-001** — persisted authority-boundary invariants.
- **CGO-IMP-001** — AI impact-assessment coverage and overdue review state.
- **CGO-OUT-001** — review-triggered adverse Certified Memory outcomes routed into governance.
- **CGO-PROV-001** — every active control retains traceable evidence.
- **CGO-REL-001** — recent passed release/test/workflow evidence remains available.
- **CGO-STD-001** — standards applicability reviews have not silently expired.

A seventh control, **CGO-MON-001**, records evidence about the monitor itself.

## Runtime instrumentation

Database triggers emit non-sensitive control-point events when:

- a governance decision is recorded;
- Certified Memory outcome feedback is routed;
- an AI impact assessment changes state;
- an Audit Optimizer suggestion changes state.

Only identifiers, control states, boundary flags, timestamps, and other audit-safe metadata are recorded.

## Alerts

Checks run hourly and may create or refresh a deduplicated control alert. Alerts are descriptive evidence, not a compliance determination.

An owner can acknowledge an alert with a rationale. Acknowledgement means the alert has been reviewed; it does **not** mark the underlying condition fixed. A later successful monitor run automatically resolves the alert when the monitored condition is no longer present.

## Owner dashboard

The DataNest Audit Optimizer owner console includes a **Governance Control Monitor** section with:

- the latest monitor run;
- active findings;
- owner acknowledgement;
- recent runtime control events;
- manual owner-triggered checks.

The browser receives no service-role credentials and all owner actions are re-authorized in database RPCs.

## Release validation

CI runs the dedicated governance-control effectiveness contract on every release path in addition to the normal test suite and migration replay. The migration also performs an initial monitor run after installation so production state is visible immediately.

## Boundaries

Monitoring evidence does not equal truth, certification, governance approval, or deployment authority. Any remediation that changes governance behavior remains subject to the existing human governance and release processes.


## Migration ordering

The monitor migration is intentionally ordered after the governed outcome-feedback migration because runtime instrumentation attaches to the outcome-feedback link table. Fresh-database replay must preserve that dependency order.
