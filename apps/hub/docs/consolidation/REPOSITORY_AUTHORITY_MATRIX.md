# Repository Authority Matrix

Status: **GOVERNANCE REFERENCE — PRE-TRANSFER**  
Applies to: `Resonance-AppDev` consolidation of the DataNest repository estate

This matrix defines **authority by responsibility/domain**, not one repository-wide canonical flag. A repository may be authoritative for one domain while depending on another repository for governance, promotion, or runtime execution.

| Repository | Canonical authority domain | Production deploy authority | Governance origin authority | R&D authority | Promotion destination | Transfer state |
| --- | --- | --- | --- | --- | --- | --- |
| `Resonance-AppDev/resonance-hub` | Runtime, commercial Hub, ecosystem integration | Yes | No | Limited | Production runtime | Existing |
| `Resonance-AppDev/DataNest` | Registry, audit, certification, governance state, control plane | Yes, subject to governance | **Yes** | Controlled | Certified production | Pending transfer |
| `Resonance-AppDev/Mirror-DataNest` | Experimental UI and functional validation | No | No | **Yes** | `DataNest` after governed approval | Rehearsal transfer |
| Other `DataNest-Supository/*` repositories | Inventory-defined | TBD | TBD | TBD | TBD | Inventory required |

## Authority rules

1. `resonance-hub` is authoritative for Hub runtime/commercial behavior, but it does not supersede DataNest governance/certification authority.
2. `DataNest` remains authoritative for governance state, audit/certification evidence, registry/control-plane decisions, and approval policy.
3. `Mirror-DataNest` may originate R&D/test changes but may not self-promote to production; promotion requires the governed path into `DataNest`.
4. No repository may become a second writable source of truth for another repository's authority domain through consolidation.
5. Cross-repository integrations must consume authoritative outputs through explicit interfaces, workflows, or governed synchronization rather than duplicated writable state.
6. Any additional DataNest-owned repository must receive an explicit authority-domain classification before transfer.

## Transfer governance

No canonical DataNest transfer is permitted until:

- the complete `DataNest-Supository` repository inventory is captured with exact repository identities and HEAD/default-branch SHAs;
- deployment/configuration dependencies and rollback checkpoints are captured;
- `Resonance-AppDev/resonance-hub` protected-main governance is enabled and verified;
- the Mirror rehearsal has completed successfully; and
- outstanding DataNest governance items are reconciled or explicitly accepted for transfer.

This document is the single authority reference for the consolidation. If another migration artifact conflicts with this matrix, the conflict must be resolved through governance before transfer proceeds.
