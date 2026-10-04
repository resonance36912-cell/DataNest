# Resonance → DataNest value consolidation ledger

Snapshot: 2026-09-26

## Objective

Consolidate the strongest functional and visual work from the Resonance Hub/RONSAS source lines into Resonance DataNest without importing stale branch drift, duplicating already-merged features, or reintroducing workstation/local-runtime dependencies.

## Reviewed authorities

- Public production surface: `https://www.reson8.life/`
- Production source lineage: `resonance36912-cell/resonance-hub@ronsas/ealiophin-production`
- Current Hub source authority: `resonance36912-cell/resonance-hub@main`
- RONSAS design authority: `resonance36912-cell/RONSAS/docs/design/RESONANCE_SOVEREIGN_SPECTRUM_2026.md`
- DataNest source authority: `DataNest-Supository/DataNest@main`

The public site could not be fetched through the current web gateway during this review, so production source is treated as the authoritative implementation record rather than inferring from a failed HTTP fetch.

## Public surface review finding

A recent searchable public snapshot of `reson8.life` still describes once-off application packs and optional monthly ecosystem passes. The newer reviewed production source lineage presents a free-promotion/no-new-billing state. Because direct live HTML fetch was unavailable through the review gateway, this is recorded as `RH-WEB-DRIFT` with status `needs_verification` rather than treated as a confirmed production defect.

Required follow-up: verify the currently served production HTML and deployment head, then reconcile public metadata/crawl state with the authoritative commercial policy.

## Consolidation decisions

| Source | Valuable content | DataNest treatment |
| --- | --- | --- |
| `resonance-hub/main` | Sovereign Spectrum application, governed ecosystem state, admin readiness/status patterns, current Hub security fixes | **Integrated/adapted.** Keep DataNest-native navigation/data model; reuse status/evidence patterns. |
| `ronsas/ealiophin-production` | Production Reson8 homepage composition, filterable product/update cards, ecosystem relationships and public status semantics | **Integrated/adapted.** Portfolio Pulse now derives equivalent cards from governed DataNest records instead of hard-coded updates. |
| `appdev/datanest-collaboration-core-20260924` | Owner-controlled collaboration, bounded integration metadata, GitHub/Supabase/browser integration references | **Adapt concepts.** DataNest already has project membership/invitations. Do not import `bridge_devices` or Ealiophin coupling. |
| `datanest/event-trigger-acl-hardening-20260925` | Service-role-only mutation boundary for append-only event protection | **Retain security principle.** Do not apply the SQL where the legacy target function does not exist. |
| `ronsas/nova-datanest-project-graph-20260920` | Versioned artifacts, typed lineage, derivation/approval relationships | **Map into DataNest evidence/governance model.** Do not import parallel `nova_projects` ownership tables that duplicate DataNest `projects`. |
| `ronsas/nova-datanest-v2-reconciled-20260921` | Memory/pattern/capability/job concepts | **Reference only.** The branch carries broad stale/destructive drift versus current Hub main; transplanting the tree would regress security/CI. |
| Hub Admin/R&D branches merged through PRs #114/#121/#129/#130 | Readiness checks, explicit safety boundary, portable read-only evidence presentation | **Design pattern only.** DataNest remains cloud/self-dependent; no arbitrary shell, runner recovery, desktop control or local machine requirement is imported. |

## Already present in DataNest before this pass

- Resonance Sovereign Spectrum 2026 tokens and AppDev cyan/violet binding.
- Reduced-motion and accessible focus treatment.
- Governed product catalog with applications, components, source authorities, environments, integrations, governance controls, risks, roadmap, evidence, decisions and DataNest branches.
- State-aware workspace continuation.
- Product-aware RONSAS/AI hero work on current/open DataNest branches.
- RONSAS cloud integration through authenticated `ronsas-status@1`, with no local runtime dependency.

## New migration in this pass

### Governed Portfolio Pulse

The production Reson8 Hub uses a filterable update/status grid. DataNest now carries the same high-value interaction pattern as `ResonancePortfolioPulse`, but its content is computed from DataNest products and product records:

- lifecycle/status tone;
- evidence count;
- active risk count;
- DataNest/source branch count;
- governed drill-down;
- responsive cards;
- reduced-motion-safe hover treatment.

This prevents a second hard-coded status feed from becoming stale.

### Source lineage records

The reviewed source branches are recorded in the RONSAS product as `source_branch` records in production DataNest. They are evidence/lineage records, not executable branches inside the DataNest repository. The status explicitly states whether a source was integrated, adapted, reviewed, or retained only as reference.

## Exclusion rules

Do not migrate a branch merely because it exists. Exclude or adapt branches when they:

- have no common ancestor with current Hub main and duplicate newer work;
- remove current security/CI controls;
- introduce local Ealiophin, desktop, loopback, or device dependencies;
- duplicate DataNest project/member ownership models;
- contain recovery/runner mutation rather than reusable product functionality;
- are superseded by merged current-main work.

## Quality gate

Every migrated feature must preserve:

1. DataNest cloud/self-dependent operation;
2. current Supabase/RLS authority;
3. current project/member role semantics;
4. reduced-motion and keyboard access;
5. source/evidence traceability;
6. exact-head CI, type, build and governed certification before promotion.
