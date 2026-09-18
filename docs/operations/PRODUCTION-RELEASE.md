# Production release

## Current production architecture

The current `reson8.life` production path is the sovereign Ealiophin stack:

`Cloudflare named tunnel -> Caddy -> 127.0.0.1:4174 (primary) -> 127.0.0.1:4173 (fallback) -> ronsas-hub-canonical`

The Hub process serves `C:\Resonance\Sources\ronsas-hub-canonical\.output-local\server\index.mjs` and is owned by the RONSAS ecosystem supervisor. The GitHub workflow `.github/workflows/production-release.yml` describes a Cloudflare Worker deployment path that is **not the current production hosting path**. It is intentionally dormant and must fail closed unless a separately reviewed hosting migration explicitly sets repository variable `ALLOW_CLOUDFLARE_WORKER_PRODUCTION_MIGRATION=REVIEWED_MIGRATION_APPROVED` and the operator types `MIGRATE reson8.life TO CLOUDFLARE WORKER`. Its migration input defaults to `false`. Do not configure `CLOUDFLARE_WORKER_NAME` or Worker credentials merely to make this workflow pass.

## Database release

Production Supabase project: `qitzhxncffcszbpsddpm`.

1. Confirm the project is active and the repository is linked to the exact project ref.
2. Run `supabase migration list --linked` and `supabase db push --linked --include-all --dry-run`.
3. Review the exact pending migration set before applying it.
4. Apply only reviewed migrations with `supabase db push --linked --include-all`.
5. Re-run the migration ledger and verify RLS, grants, policies, and privileged RPC boundaries with read-only catalog queries.

Database rollback is forward-only. Never delete an applied migration or run an unreviewed destructive reversal. Prepare and review a corrective migration instead.

## Hub release

1. Start from a clean, reviewed production-Hub commit on `ronsas/ealiophin-production`.
2. Build in an isolated worktree at the exact reviewed commit. Reuse the existing production `.env.local` only by filesystem link; never print or copy its contents into logs or Git.
3. Run the release gates in the isolated tree:
   - `bun run prebuild`
   - `bun test`
   - `bun run typecheck`
   - `bun run build:local`
4. Stage the resulting `.output-local` beside the live bundle and compare a deterministic SHA-256 tree hash with the validated build.
5. Read the RONSAS cluster ownership record and replace only the supervisor-owned Hub listener. Never stop an unrecognized process.
6. Preserve the previous `.output-local` directory under `runtime\production-edge\backups` before promoting the validated bundle.
7. Run `runtime\production-edge\START-RONSAS-CANONICAL.ps1` to restore the supervised ecosystem, validate/reload Caddy, and ensure the named Cloudflare tunnel is running.
8. Verify `http://127.0.0.1:4174/` as the primary Hub, `http://127.0.0.1:4173/` as the fallback, and `https://reson8.life/`, then run `BASE_URL=https://reson8.life bun run scripts/smoke-hub-routes.ts`.
9. Record the reviewed commit, bundle hash, rollback path, process identity, migration ledger, and smoke-test result in a dated operations ledger entry.

## Application rollback

1. Stop only the Hub PID recorded as RONSAS-owned in the cluster ownership/state file.
2. Restore the preserved pre-release `.output-local` bundle.
3. Restart through `START-RONSAS-CANONICAL.ps1`.
4. Verify local primary `:4174`, fallback `:4173`, the public canonical URL, and the production smoke suite.
5. Record the failed release and restored bundle hashes in the incident/release record.

If a database migration succeeds but the Hub release fails, restore the previous Hub bundle only when it remains schema-compatible. Otherwise promote a reviewed compatibility fix.
