# GitLab Forge Migration Runbook

## Purpose
This runbook promotes the consolidated Resonance-AppDev / DataNest-Supository monorepo from local certified authority to a new GitLab forge while preserving the existing R&D -> audit -> human review -> canonical main -> immutable build -> production promotion model.

## Canonical naming and authority
- Target GitLab namespace: `Resonance-AppDev`.
- Target canonical repository: `DataNest-Supository`.
- Canonical repository ID: `RSN-PLT-DATANEST`.
- `apps/hub` remains the governed source for Resonance Hub / `resonance-hub`; it is not split back into a second production source repository.
- `platform/ronsas`, `platform/open-nova`, `governance/rcgf`, `services/sovereign-backend`, public assets, apps, packages, operations, tests, evidence and documentation remain inside the governed monorepo.
- The local Weed worktree remains temporary source authority only until the GitLab import, branch protection and post-import validation are complete.

## Current certified lineage at migration preparation
- Weed canonical path: `C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING`.
- Open Nova repair source: `93803e8e78b430e31c035307c11b48d8e75377cb`.
- Open Nova reconciliation commit: `3c6b4bb0889b53f8d25ab2897e453c980c25ab7b`.
- Resonance traceability validation: 35 passed, 0 failed.
- Open Nova sealed build manifest: 261 files verified.
- Final migration bundle must be regenerated after all migration-document/CI changes are committed.

## Free-tier governance model
GitLab Free supports protected branches, merge requests/reviews, GitLab CI/CD, GitLab Pages, and custom Pages domains. Required merge-request approval rules are a Premium/Ultimate capability. Therefore the free-tier governance control is:

1. `main` is protected and is the only production-authority branch.
2. Direct pushes to `main` are restricted to Maintainer/Owner-level recovery use only; routine changes use merge requests.
3. Force push on `main` remains disabled.
4. The traceability and Open Nova manifest jobs must pass.
5. Applicable DataNest/Hub candidate build jobs must pass.
6. The human reviewer records approval in the merge request and in release evidence before promotion.
7. No production deploy or DNS change is performed solely because a merge request is technically mergeable.

If mandatory platform-enforced approval counts become a requirement, upgrade the GitLab tier or move the approval enforcement to a governed external policy gate. Do not silently weaken the human-review requirement.

## Account and project bootstrap
The following requires the repository owner to authenticate to GitLab; credentials must not be stored in the repository.

1. Create/sign in to the GitLab account.
2. Create the top-level group `Resonance-AppDev` if available.
3. Create an empty project named `DataNest-Supository` with no generated README, license or initial commit.
4. Set `main` as the default branch after the first push.
5. Under Settings -> Repository -> Branch rules, protect `main` and disable force push.
6. Restrict normal direct push to `main`; use merge requests for governed changes.
7. Turn on project runners/shared runners or register an authorized self-hosted runner.

## Local export gate
Run from Weed after the canonical worktree is clean:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\forge\Export-CanonicalForge.ps1 `
  -RepoRoot "C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING" `
  -OutputDir "C:\Users\iamas\Dropbox\RONS-Audit\RONS-AI-AUDIT-REPOSITORY\23-DATANEST-RESONANCE-CONSOLIDATION-20261004\forge-export"
```

The exporter blocks on a dirty worktree, reruns the 35-point traceability suite, reruns the Open Nova manifest verifier, creates a full-history `main` Git bundle, verifies the bundle, and writes a SHA-256 manifest.

## Preferred GitLab import from the canonical worktree
After the empty GitLab project exists, add the authenticated remote URL supplied by GitLab:

```powershell
git -C "C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING" remote add gitlab https://gitlab.com/Resonance-AppDev/DataNest-Supository.git
git -C "C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING" push --set-upstream gitlab main
git -C "C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING" push gitlab --tags
```

If the namespace differs, use the actual GitLab project URL. Do not rename the canonical repository merely to match a workstation folder.

## Recovery/import from the sealed bundle
The bundle is the portable migration and disaster-recovery copy. On an authorized machine:

```powershell
git clone DataNest-Supository-main-<short-sha>.bundle DataNest-Supository
cd DataNest-Supository
git remote set-url origin https://gitlab.com/Resonance-AppDev/DataNest-Supository.git
git push --set-upstream origin main
git push origin --tags
```

Verify the imported GitLab `main` SHA exactly matches the export manifest before enabling it as canonical authority.

## GitLab CI contract
The root `.gitlab-ci.yml` implements the migration baseline:
- traceability validation on pipelines;
- Open Nova sealed-manifest verification;
- DataNest tests, type checks, production-contract checks, high-severity production dependency audit, static export and seven-app RONSAS bundle build;
- Resonance Hub pinned-dependency, navigation/domain/copy/security/public-audit/ITN/transparency/discernment checks and Nitro production build;
- manual GitLab Pages candidate publication from protected/default `main` only.

Required GitLab CI/CD variables for the DataNest static build:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Use project/group CI variables; never commit runtime secrets. Publishable browser configuration is still managed deliberately as deployment configuration rather than copied from workstation `.env` files.

## Mirror / R&D reconstruction
After canonical GitLab import is verified, recreate `Mirror-DataNest` as an R&D-only fork or secondary project derived from canonical `main`.

Rules:
- Mirror/R&D may be less gated for experimentation.
- Mirror/R&D is never production authority.
- Candidate changes return to canonical `DataNest-Supository` through a merge request with audit evidence.
- Automated synchronization must not overwrite divergent R&D work without review.
- Production artifacts are built only from protected canonical `main` after governance review.

## Public hosting topology after forge migration
### DataNest
GitLab Pages is a valid free static-hosting candidate and supports custom domains/TLS. The CI Pages job is intentionally manual so importing the repo does not automatically authorize public publication.

For migration testing, the current static contract uses `NEXT_PUBLIC_BASE_PATH=/DataNest`. Before a root-domain deployment, set the base path to the actual route being served and rebuild; never reuse a build generated for the wrong base path.

### Resonance Hub
Keep `reson8.life` as the canonical Hub brand/runtime endpoint. The Hub remains TanStack Start + Nitro with server functions/APIs and should deploy to the Cloudflare-module/runtime target or another governed server runtime, not GitLab Pages.

### DataNest custom-domain choices
- Direct static domain: prefer a dedicated hostname such as `datanest.reson8.life` when binding GitLab Pages directly.
- Shared Hub path: if DataNest must remain at `reson8.life/DataNest`, keep Cloudflare/public ingress in front and route that path to the certified static origin while the Hub owns the root runtime.

No DNS record is changed until the provider-issued origin works, TLS is valid, canonical metadata/CSP/CORS/Supabase redirects are aligned, and human promotion approval is recorded.

## Post-import certification
After pushing to GitLab:
1. Confirm GitLab `main` equals the local export manifest SHA.
2. Confirm the default branch is `main` and force push is disabled.
3. Run the first GitLab pipeline and retain job evidence.
4. Re-run local traceability and Open Nova verification against a fresh clone from GitLab.
5. Build DataNest and Hub from that fresh clone.
6. Compare generated artifact hashes with the release evidence for the same source SHA.
7. Only then change `ops/index/TRACEABILITY-INDEX.json` status from `local-certified-pending-remote-promotion` to the appropriate remote-certified status.

## Production promotion rule
A successful GitLab import is not a production deployment. Production promotion requires an immutable build from protected `main`, passing governance evidence, recorded human approval, verified hosting origin/TLS, controlled DNS/config cutover and post-deploy health probes.

## Current external references
- GitLab protected branches / branch rules: https://docs.gitlab.com/user/project/repository/branches/protected/
- GitLab merge-request approvals: https://docs.gitlab.com/user/project/merge_requests/approvals/
- GitLab Pages: https://docs.gitlab.com/user/project/pages/
- GitLab CI Pages publish syntax: https://docs.gitlab.com/ci/yaml/#pages

## Three-node topology gate
The forge migration explicitly includes all three governed nodes:
- `RSN-NODE-EALIOPHIN-PRD-01` — production-master/runtime authority.
- `RSN-NODE-WEED-DR-01` — support/recovery worker and current local consolidation/export host.
- `RSN-NODE-SPIDER-DR-01` — support/disaster-recovery worker with no production promotion authority.

Spider's readiness record is `ops/nodes/SPIDER-READINESS.json`, with certification evidence at `evidence/certification/SPIDER-NODE-READINESS-20261004.md`. Spider was directly audited online on 2026-10-04; the sealed canonical reference passed 35/35 traceability and 261-file Open Nova verification, local RONSAS repositories were clean, and all four governed worker scripts matched canonical SHA-256 values.

Spider does not block the non-destructive GitLab source import. The fresh re-entry audit is complete, but fresh GitHub remote checks for both governed private origins are currently degraded: RONSAS control fails at the Windows Schannel/TLS layer and `resonance-hub` resets the connection. Preserve this as an operational warning and require successful fresh remote checks/fetches before declaring the Spider DR synchronization path fully ready.
