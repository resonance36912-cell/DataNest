# GitHub consolidation — 2026-09-15

RONSAS remains the sovereign GitHub control authority for Resonance.

## Canonical ownership

- Canonical owner: `resonance36912-cell`
- Control repository: `resonance36912-cell/RONSAS`
- Development identity: `ResonanceAppDev`
- Promotion rule: review branch -> pull request -> validated merge to `main`

## Preserved repositories

| Repository | Role | Verified `main` head |
| --- | --- | --- |
| `resonance36912-cell/RONSAS` | sovereign control authority | `8ddce3f` |
| `resonance36912-cell/resonance-hub` | preserved developer history and reconciliation input | `0a48e34` |
| `resonance36912-cell/RCGF` | governance upstream | `26c40c1` |
| `resonance36912-cell/rons-epublisher-sovereign-source` | ePublisher source upstream | `bf4b2b8` |

## Consolidation rule

The repositories are governed as one RONSAS GitHub authority, but their Git histories are not flattened, force-rewritten, or copied over one another. RONSAS is a manifest-driven meta-repository, not a monorepo.

`ResonanceAppDev` may act as a development/collaboration identity, but canonical repository ownership remains under `resonance36912-cell`.

The machine-readable authority snapshot is `.ronsas/github-authority.json`. Verified heads are evidence for this snapshot, not permanent pins; later movement must occur through each repository's governed workflow.
