# DataNest platform governance controls

These controls are intentionally kept outside source control. The repository contains the reconciler and deployment preflights; platform credentials must be supplied through GitHub/Supabase secret stores.

## GitHub-native BRANCH-X rulesets

Create a GitHub Actions secret named `DATANEST_GITHUB_ADMIN_TOKEN` with permission to edit repository rulesets. GitHub requires repository administration-level rules permissions for ruleset creation/update.

Run the manual workflow:

`.github/workflows/native-protection-reconcile.yml`

It reconciles:

- `BRANCH-X Canonical`
- `BRANCH-X Automation`

and publishes the observed native rulesets plus active main-branch rules as workflow evidence.

The scheduled native audit will use `DATANEST_GITHUB_ADMIN_TOKEN` when it is present.

## File worker authentication

Create the production GitHub Actions secret:

`DATANEST_FILE_WORKER_TOKEN`

Do not reuse `SUPABASE_SERVICE_ROLE_KEY`.

The worker deployment workflow:

1. requires `DATANEST_FILE_WORKER_TOKEN`;
2. writes it to a temporary mode-0600 environment file;
3. synchronizes it with `supabase secrets set --env-file ... --project-ref sgqdmfgjbprsoqsmgigi`;
4. verifies that the secret name is present in the remote project;
5. only then deploys `datanest-ai-file-worker`.

The secret value must never be committed to the repository, printed to logs, or embedded in client-side code.

## Review floor

Canonical branches are governed by the checked-in BRANCH-X policy:

- at least one approving review;
- CODEOWNERS approval;
- required automated status checks.

The final human approval remains a platform control and is not automated by this repository.
