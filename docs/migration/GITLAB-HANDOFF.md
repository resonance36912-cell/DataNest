# GitLab Handoff — Canonical DataNest / Resonance Monorepo

## Authority

- Canonical repository: `DataNest-Supository-canonical`
- Production/default branch: `main`
- Source-control target group recommendation: `Resonance-AppDev`
- Target project recommendation: `DataNest-Supository`
- GitLab is source-control/CI authority, not the sole deployment authority.

## Export policy

1. Push `main` first.
2. Push certified/release tags.
3. Configure `main` as protected before enabling collaborative writes.
4. Require merge requests for canonical changes.
5. Keep production promotion behind the CI `governance:approve-production` manual gate and human review.
6. Push historical `legacy/*`, `quarantine/*`, `candidate/*`, `reconcile/*`, `repair/*`, `fix/*`, `consolidation/*`, and `certified/*` branches only after the canonical project is established.
7. Preserve the full all-refs Git bundle as independent recovery evidence even if archive branches are not immediately pushed.

## CI architecture

The root `.gitlab-ci.yml` separates:

- canonical traceability / public-asset governance audit;
- Open Nova sealed-manifest validation;
- DataNest npm/Next.js checks;
- Hub Bun/Vite tests, security and build verification;
- ePublisher, Creative Studio, Sync Vision and YouTube Optimizer Bun/Vite validation;
- canonical certification artifact generation;
- manual human-governance production checkpoint.

Deployment remains provider-decoupled and is not automatically performed by repository import.

## First GitLab setup

1. Create a GitLab account.
2. Create the `Resonance-AppDev` top-level group.
3. Create a blank private project named `DataNest-Supository` without README/license initialization.
4. Add the supplied GitLab project URL through `ops/export/push-gitlab.ps1`.
5. Push `main` and tags first.
6. Set `main` as the default branch and protect it.
7. Permit direct pushes only to authorized maintainers; normal changes use merge requests.
8. Confirm the first GitLab pipeline completes before archive branches are pushed.
9. Add a self-hosted GitLab Runner later if hosted-minute usage becomes material.
10. Keep deployment DNS/runtime independent of GitLab.

## Safe push command

Dry run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\export\push-gitlab.ps1 -GitLabProjectUrl '<gitlab-project-url>' -DryRun
```

Canonical push:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\export\push-gitlab.ps1 -GitLabProjectUrl '<gitlab-project-url>'
```

Archive branch push after validation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\export\push-gitlab.ps1 -GitLabProjectUrl '<gitlab-project-url>' -IncludeLegacyBranches
```

## Rollback

The all-refs `.bundle` and local mirror repository are the provider-independent rollback source. Never delete them after GitLab onboarding. Rebuild any provider from the bundle rather than relying on provider-specific export formats.
## Node inclusion
The canonical handoff includes Ealiophin, Weed and Spider in the governed topology. Ealiophin retains production authority; Weed and Spider remain support/DR workers with no direct production promotion authority. Spider is currently offline and therefore remains `included-pending-fresh-audit`; this does not prevent source-forge import but must remain visible until its direct node audit is completed.
