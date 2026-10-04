# RONSAS Module Control Contract

Effective candidate: 2026-09-17

RONSAS is one governed system. ePublisher, Creative Studio, Sync Vision, YouTube Optimizer, Hub, Foundry, local AI/media runtimes, and supporting brokers are modules or services of RONSAS; none is an independent runtime authority.

## Authority

- Source/governance authority: the version-controlled RONSAS control repository.
- Machine runtime authority: the canonical RONSAS supervisor on Ealiophin.
- Module registry: `ops/ealiophin/cluster/RONSAS-MODULES.json`.
- Live module registry: `integrations/rons-cluster/RONSAS-MODULES.json`.
- Audit authority: immutable evidence and hash manifests; runtime logs/models/secrets remain local-only.

Separate processes and ports are permitted only as isolation, performance, and recovery boundaries. They do not create separate products, governance domains, startup authorities, or release authorities.

## Control rules

1. One canonical start control: `START-RONSAS-ECOSYSTEM.ps1`.
2. One registry-driven status control: `STATUS-RONSAS-ECOSYSTEM.ps1`.
3. One state-aware stop control: `STOP-RONSAS-ECOSYSTEM.ps1`.
4. Legacy launchers may exist only as thin aliases to those controls.
5. Application entitlement IDs are read from the module registry by the launch broker.
6. Local-first services are required parts of the RONSAS owner runtime when their module depends on them.
7. External AI/provider use remains denied by default and must pass the existing provider authorization boundary.

## RGP alignment

Changes follow the controlled continuous-improvement loop: preserve current evidence, implement on a review branch, verify deterministically, run sovereignty/security/functional gates, promote only after gate passage, retain rollback artifacts, and monitor drift.

The module registry is the machine-readable operational register for RONSAS composition. The repository remains the single source of governance truth. Machine-specific paths, secrets, models, mutable state, and credentials are not moved into Git merely to make the suite appear monolithic.

## Streamlining principle

Consolidation means one authority and contract, not one process. Combining GPU, media, web, database, and orchestration workloads into a single process would reduce fault isolation and violate the Protocol's reliability and minimalism objectives. RONSAS therefore uses one control plane with bounded service processes behind it.
