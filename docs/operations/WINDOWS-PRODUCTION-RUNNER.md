# Windows production runner

The RONSAS production Hub is Windows-native on Ealiophin. The existing Linux Actions runner is intentionally container-isolated and must not be granted arbitrary Windows filesystem mounts.

## Bootstrap

Run `ops/ealiophin/ci/INSTALL-RONSAS-WINDOWS-RUNNER.ps1` locally on Ealiophin under the Ashley Windows account.

The runner is repository-scoped to the **private** `resonance36912-cell/RONSAS` control repository and carries the labels `ronsas`, `ealiophin`, and `production-host`.

Do not register this host runner to public application repositories.

## Governed Hub release

A production request is a committed `ops/release-requests/hub-production.json` document with schema `ronsas-hub-release-request/v1`, the exact production source commit, and explicit confirmation `PROMOTE RONSAS HUB`.

The promotion workflow verifies the request against the current `ronsas/ealiophin-production` head, creates an isolated worktree, hard-links the existing production `.env.local`, runs release gates, builds into candidate output, stages the candidate beside the live bundle, invokes the existing rollback-safe `PROMOTE-RONSAS-HUB.ps1`, restores the named Cloudflare/Caddy edge, verifies policy-critical public routes and core app subdomains, and writes a machine-local release receipt.

The workflow targets the GitHub `production` Environment so environment protections can be applied to future releases.
