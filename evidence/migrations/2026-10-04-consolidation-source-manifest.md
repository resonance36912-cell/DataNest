# Canonical consolidation source manifest — 2026-10-04

Status: local canonical candidate; not yet export-certified.

## Canonical authority selections

- DataNest governance/control plane → `apps/datanest` from `39d7eaf1c70448acec4773b2f60d4d92266f8385` (`governance/local-consolidation-alignment-20261004`).
- Resonance Hub runtime/commercial authority → `apps/hub` from `002e7c3e6636e4fccf7938f4a2f35a71b7614906`, based on Hub upstream PR144 plus nomenclature alignment.
- Reviewed Hub request-memo optimization → carried from `acfbcfe78c5ffc0aa97a714b3a42583e370f6b33` as a separate canonical commit.
- RONSAS sovereign orchestration/control authority → `platform/ronsas` from `819b773a263c277693031d76c1b4d32542365fd7`.
- RCGF constitutional governance → `governance/rcgf` from `26c40c14e011dc494457b033c96a8e68029e46cb`.
- Open Nova → verified sealed R5 archive `RONS-v1.5.8-SEALED-R5-20260911.zip`, SHA-256 `B745DA3DB6D78ADE4A2FCC6AE47D324F2511C15A00D99703AC5CB70A88C0BC9F`; 259/259 manifest entries verified.

## Product/service histories preserved

- ePublisher → `apps/epublisher`, source commit `948d5d28852949f73c4fd67a1fd87b9c6df83ba2`.
- Creative Studio → `apps/creative-studio`, source commit `04e3d5149df8e20d11523f92666a04f1aa5b69c5`.
- Sync Vision → `apps/sync-vision`, source commit `a7ccdb6d0cd4587d71ec94b68d9411ff7d3781fd`.
- YouTube Optimizer → `apps/youtube-optimizer`, source commit `62c3d6746595a3540d9812605c0da090b1ac08fd`.
- Sovereign backend → `services/sovereign-backend`, source commit `be6ae9dee842e7bdfb6173d7f2c7c78863a47d99`.

## RONSAS / Hub deduplication disposition

Hub remains frontend/runtime/commercial authority. The duplicate historical RONSAS frontend/public trees are excluded from canonical `platform/ronsas`, while full source history remains reachable under `legacy/ronsas-authority/main`. Reconciliation evidence records 98 identical same-path files, 95 divergent same-path files and 10 RONSAS-only files; no divergent frontend file was promoted automatically.

## Quarantined lines retained in this repository

- `quarantine/hub-recovery-ealiophin-20261004` → complete 40-path Ealiophin Hub recovery snapshot.
- `quarantine/hub-review-ealiophin-20261004` → independent reviewed request-memo branch.
- `quarantine/hub-ci-remediation-20260919` → stale CI-remediation line retained for review.
- `quarantine/datanest-plugin-autopilot` → automatic plugin-autopilot registration retained but not promoted; canonical policy remains manual-only.
- `quarantine/datanest-aipi-build-check` → DataNest CI build-check line.
- `quarantine/ronsas-credit-wallet-20260919` → historical RONSAS entitlement line.

## Independent recovery bundles

The pre-consolidation Ealiophin recovery bundles remain outside this repository at `_audit-20261004/gitlab-migration-safety`. Their recorded SHA-256 manifest was reverified before canonical construction. Weed-side RONSAS/Hub bundles and patch evidence are independently synchronized under Dropbox audit handoff `23-DATANEST-RESONANCE-CONSOLIDATION-20261004`.

## Governance checks at this checkpoint

- Original source checkouts were not reset, cleaned, rebased, deleted or rewritten.
- Canonical traceability validator: 35 passed, 0 failed.
- Public operational metadata is allowlist-derived and contains no detected local paths/internal addresses/secrets.
- Approved `.env*.example` templates are permitted; populated secret material remains prohibited.
- Automatic DataNest plugin-autopilot execution on `main` was reverted in canonical `main` because the selected governance baseline requires manual-only invocation.
- GitLab export remains blocked until component builds/tests, security scanning, cross-system validation and human approval complete.
