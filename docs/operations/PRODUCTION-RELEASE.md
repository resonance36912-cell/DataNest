# Production release runbook

Production releases are manual and run only from `main` through
`.github/workflows/production-release.yml`.

## One-time GitHub configuration

Create the `production` environment and require an approving reviewer.
Prevent administrators from bypassing the protection rule where supported.

Environment variables:

- `PRODUCTION_BASE_URL=https://reson8.life`
- `SUPABASE_PROJECT_REF=qitzhxncffcszbpsddpm`
- `CLOUDFLARE_WORKER_NAME=<confirmed production worker name>`

Environment secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Use least-privilege tokens restricted to the named production resources.

## Release

1. Merge a reviewed pull request into `main` with all required checks green.
2. Open Actions, select **Production release**, and choose **Run workflow** on `main`.
3. Enter the exact confirmation `RELEASE reson8.life`.
4. Keep **Apply pending Supabase migrations** enabled when migrations are part of the release.
5. Approve the protected `production` environment only after reviewing the commit SHA.
6. Confirm the migration, Worker deployment, and production smoke test succeed.

The workflow serializes releases, validates the candidate before accessing
production, checks the exact Supabase project and public URL, and uploads the
validated build as an immutable artifact.

## Rollback

Application rollback:

1. In Cloudflare Workers, select the confirmed production Worker.
2. Roll back to the version that preceded the failed GitHub workflow run.
3. Re-run the production smoke test against `https://reson8.life`.
4. Record the failed and restored version IDs in the incident record.

Database rollback is forward-only. Do not delete an applied migration or run an
unreviewed destructive reversal. Prepare a new corrective migration, review it
through a pull request, back up affected data, and run the release workflow again.

If a migration succeeds but application deployment fails, restore the previous
Worker version only when it remains compatible with the migrated schema.
Otherwise, deploy a reviewed compatibility fix.
