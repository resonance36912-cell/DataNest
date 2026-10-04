# Knowledge Tree

The **Knowledge** tree is DataNest's repository-learning pipeline. It learns from observable repository evidence in both `DataNest-Supository/DataNest` and `DataNest-Supository/Mirror-DataNest`, categorizes recurring work, derives optimization candidates, and emits target-specific feeds.

## Contract

- Sources are repository evidence such as commits and merged pull requests. Private reasoning and chain-of-thought are never collected.
- Learned items are **provisional evidence**, not Certified Memory, policy, truth, or production authorization.
- Canonical and Mirror evidence retain their source repository and immutable commit/PR identifiers.
- Optimization candidates are recommendations for review; they cannot self-certify or bypass Boundaries.
- Canonical feeds are published to the isolated `automation/knowledge-feed` branch, never directly to `main`.
- Mirror consumes only its relevant feed into its own isolated knowledge-inbox branch.
- FREETREE is intentionally excluded from Knowledge ingestion and feed synchronization.

Generated files under `knowledge/feeds/` and `knowledge/index.json` are automation output and are regenerated from source evidence.
