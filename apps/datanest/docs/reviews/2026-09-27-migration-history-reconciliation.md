# Production Migration History Reconciliation — 2026-09-27

This source-only repair restores the Git migration chain from the authoritative applied migration history of the DataNest application Supabase project.

- Production project ref: `sgqdmfgjbprsoqsmgigi`
- Applied production migrations restored: **53**
- Previous Git SQL migration files replaced: **16**
- Source of SQL: `supabase_migrations.schema_migrations.statements`
- Ordering authority: applied migration `version`
- Naming authority: applied migration `name`
- Production database mutation performed by this repair: **none**
- Secret-like literal scan: **clear**
- Production-specific UUID literal scan: one historical RBAC seed migration identified and normalized for replay

Supabase branching replays migration files sequentially against a fresh database. This reconciliation therefore restores each migration under its applied timestamp and name rather than preserving later source-only renames or timestamp changes.

The repair does not mark the branching incident resolved by itself. Resolution requires a fresh migration replay (local reset or preview-branch creation/rebase) and a subsequent Branch-Cleaner parity check.


## Replay-safe historical normalization

Fresh replay exposed one historical data dependency in `20260924123459_add_project_membership_rbac.sql`: the applied production SQL embedded the production-generated project UUID and an existing production auth-user UUID.

The Git migration retains the same applied version/name and RBAC schema/policies, but its bootstrap membership insert now:

1. resolves the DataNest project by stable slug (`resonance-datanest`);
2. seeds the owner membership only when the referenced auth user exists; and
3. creates no production identity data in fresh preview/local databases.

This is intentionally the only migration whose SQL differs from the stored production statement. It is a replay repair, not a production database change.
