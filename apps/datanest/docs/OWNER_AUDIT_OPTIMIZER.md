# Resonance DataNest Owner Audit Optimizer

Status: production-enabled on 2026-09-29.

## Purpose

The Owner Audit Optimizer extends DataNest AI and the existing External Audit & Optimizer into a continuous, evidence-linked improvement loop for Resonance DataNest.

The optimizer may **suggest** changes. It may not approve, vote, ratify, deploy, grant authority, mutate governance history, or bypass normal DataNest controls.

## Runtime loop

1. A lightweight Supabase Cron job checks enabled optimizer projects hourly.
2. The project policy controls the actual AI cadence; the Resonance DataNest default is every 6 hours.
3. The audit-optimizer Edge Function validates either the signed-in project owner or the Vault-backed cron token.
4. The worker captures structured project evidence from governance observations/cycles, External Audit findings, AI impact assessments, control evidence, Job metrics, governed AI usage metrics and the active standards register.
5. The worker creates a normal ai_usage_requests record and reuses the existing provider allowlist, budget, model, concurrency, token/cost and reconciliation controls.
6. DataNest AI returns zero or more evidence-linked optimization hypotheses.
7. Suggestions are deduplicated and stored with governance_effect=false and deployment_authority=false.
8. The signed-in owner reviews suggestions in Settings → DataNest Audit Optimizer.
9. Rejection closes the suggestion while preserving the audit record.
10. Approval records a governance observation, creates an improvement candidate, and marks it ready_for_governance.
11. Formal governance remains responsible for proposal routing, voting, decision, ratification and any later implementation authority.

## Owner dashboard

The dashboard is rendered only when the active project membership role is owner. Backend RPCs independently enforce the same owner-only rule.

Owner controls include enabling/disabling continuous optimization, selecting an hourly-to-weekly review cadence, setting the maximum suggestions per run, triggering an immediate review, approving/rejecting with rationale, and inspecting run history. The dashboard auto-refreshes every 30 seconds.

## Scheduling

Production currently uses cron job datanest-audit-optimizer-hourly, an hourly due-check, a 6-hour DataNest optimization cadence, and a maximum of 5 suggestions per run.

The cron request carries a random token held in Supabase Vault under datanest_optimizer_cron_token. The token is never exposed to the browser or repository. The worker verifies it through a service-role-only RPC before scheduled processing.

## Security boundaries

- Owner role is resolved from project_members, never user-editable metadata.
- New optimizer tables use RLS and expose only owner reads.
- No client has direct INSERT/UPDATE/DELETE privileges on optimizer tables.
- Scheduled function JWT verification is disabled only because the function implements explicit Vault-backed token authentication for cron plus full Supabase user verification for owner-triggered runs.
- Service RPCs are revoked from PUBLIC, anon and authenticated and granted only to service_role.
- AI provider credentials remain server-side and continue to use the existing encrypted provider connection system.
- Owner approval is not deployment authority.
- Formal governance is still required after owner approval.

## Source

- src/components/OwnerOptimizerDashboard.tsx
- supabase/functions/audit-optimizer/index.ts
- supabase/migrations/20260929235900_datanest_owner_optimizer_v1.sql
- supabase/migrations/20260929235930_optimize_datanest_owner_optimizer_indexes.sql


## Evidence recency and resolution reconciliation

Accepted governance decision `DN-GOV-DEC-5B1BAB65C7D543BD` adds a recency safeguard to optimizer evidence preparation.

For control-monitor evidence, DataNest groups records by control/check identity and supplies the optimizer with the latest applicable state. Older failed records remain preserved in the governance evidence store and are counted in optimizer-run reconciliation provenance, but they are omitted from the model's active-problem prompt once a newer passing or resolved state exists. A later passing state therefore supersedes an earlier failure for active-problem analysis.

The optimizer prompt explicitly prohibits proposing remediation from a superseded failure when the latest state for the same control/check is passed or resolved. Suggestion evidence references are also filtered to identifiers present in the reconciled evidence snapshot. Suggestions supported exclusively by passing or resolved control evidence are rejected before storage, so stale history cannot be converted into a new active remediation proposal.

This safeguard changes evidence interpretation only. It does not grant the optimizer voting, ratification, deployment, role, ownership, contractual, or financial authority.
