# DataNest-Supository - Resonance canonical staging repository

This repository is the local consolidation workspace for DataNest-Supository, Resonance Hub, RONSAS, Open Nova and RCGF before export to a new Git forge.

## Authority model

- `apps/datanest` - DataNest governance, trusted knowledge, certification, audit and control-plane UI. Full source import is pending Ealiophin reconnection.
- `apps/hub` - Resonance runtime/commercial web authority. Current content is a committed Weed-side recovery snapshot; dirty Weed work is preserved separately as evidence.
- `platform/ronsas` - sovereign operations, topology, workers, recovery, QA and RONSAS-specific overlays. It is not a second runtime/commercial Hub authority.
- `platform/open-nova` - verified zero-credit/provider-neutral development and migration platform.
- `governance/rcgf` - constitutional governance references; standalone RCGF repository history is pending Ealiophin import.
- `catalog` - canonical IDs and traceability indexes for platforms, apps, environments, nodes, services and public assets.

## Safety status

This is `ENV-MIG` migration staging, not production. No Git remote is configured by design. Original repositories remain untouched. Binary recovery bundles remain outside this repository and are referenced by hashes in audit evidence.

## Promotion rule

`input -> classification -> component tests -> cross-component contracts -> security/secret scan -> governance review -> human approval -> canonical main -> deployment`

See `docs/traceability/NOMENCLATURE.md` and `docs/audit/CONSOLIDATION-AUDIT.md`.
