# Developer Hub semantic reconciliation — 2026-09-15

RONSAS `main` at `f3e9449` and `resonance-hub` `main` at `0a48e34` have no Git merge base. The Hub is therefore a semantic import source, not a merge parent.

## Immutable tree inventory

- RONSAS tracked files: 367
- Hub tracked files: 636
- Shared paths: 278
- Byte-identical shared paths: 194
- Shared paths with different content: 84
- Hub-only paths: 358
- RONSAS-only paths: 89

The Hub remote tracks a top-level `.env`. Its contents were not read and must never be promoted into RONSAS, CI artifacts, or audit bundles.

## Promotion policy

1. Do not merge the Hub Git history into RONSAS.
2. Do not copy the Hub working tree wholesale.
3. Review Hub-only and differing paths semantically by functional area.
4. Reimplement or selectively import only validated changes on review branches.
5. Preserve RONSAS-only governance, topology, security, and recovered-integration material.
6. Production Hub and runtime-stage drift remain separate evidence sources and require Ealiophin access before promotion.

The full path inventory is `.ronsas/reconciliation/hub-developer-20260915.json`.
