# GUARDIAN Tree

**GUARDIAN** is DataNest's health-monitor and safe-healing tree.

It captures versioned health snapshots from the canonical root through specialized tree inputs, compares the observed environment with `config/guardian.blueprint.json`, measures drift from required operating conditions, and records changes from the previous snapshot.

GUARDIAN heals only what DataNest can prove is safe and reversible:

- branches with **zero unique commits**, no open PR, and successful live revalidation may be deleted through the existing Branch Cleaner;
- deterministic source normalization is staged through the existing Workflow Reviewer in a review PR;
- behavioral refactoring or duplicate-code removal remains a reviewable healing proposal/PR;
- unknown or unique history is never treated as redundant.

GUARDIAN never gains production authority, weakens Boundaries/ENFORCER, publishes secrets, or synchronizes/heals FREETREE automatically.

Snapshots bind to the actual checked-out commit and include input content digests and freshness observations. Missing reports, required contracts and blueprint sources cannot count as healthy. Expired or invalid ENFORCER evidence is critical. Snapshot drift includes removed blueprint sources. Source normalization remains subject to semantic review; GUARDIAN does not infer that matching text or whitespace proves behavioral equivalence.

Monitoring follows upstream completion events with a 30-minute fallback pulse. Snapshots measure repository contracts and supplied tree evidence, including remote repository availability; they are not authenticated production uptime or database acceptance tests. The published snapshot describes the pre-healing observation; the healing artifact records attempted changes, and the next observation measures their effect. GUARDIAN and Maintenance share a healing lock and reuse any open source-healing PR.

Activation requires merging the reviewed workflows into canonical main. Inspect the first GUARDIAN, CONDUCTOR and SUGGESTER runs and their artifacts after merge. An absent bootstrap feed is reported as missing, never synthesized as a success. Production promotion retains its separate human-review governance.
