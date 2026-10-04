# DataNest / Resonance canonical consolidation audit runbook

Date: 2026-10-04
Current execution node: Weed (`NOD-WED`)
Target repository: `C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING`
Status: migration staging; not production certified

## 1. Objective

Consolidate DataNest-Supository, Resonance Hub, RONSAS, Open Nova and RCGF into one provider-neutral Git repository without erasing source history, authority boundaries, local work, public-asset traceability or governance evidence.

The consolidated repository must support later export to GitLab or another forge, but no forge account is required for this local phase.

## 2. Governing authority model

- Hub: runtime/commercial web authority.
- DataNest: governance, trusted knowledge, certification, audit and control-plane authority.
- RONSAS: sovereign control, operations, topology, workers, recovery and platform integration.
- Open Nova: provider-neutral/zero-credit development and migration platform.
- RCGF: constitutional governance framework.
- Worker/recovery nodes: evidence and support; no direct production promotion.

A single repository does not mean a single undifferentiated application. Authority remains explicit in the catalog.

## 3. Traceability standard applied

Canonical machine identifiers use URN-like IDs such as `urn:resonance:service:hub-web`.
Short immutable audit keys use prefixes: `PLT`, `APP`, `GOV`, `ENV`, `NOD`, `SVC`, `PUB`, `EVD`.
Paths use lower-case kebab-case. Display labels and legacy domains are aliases, never primary identity.

Environment IDs:
- `ENV-DEV` development
- `ENV-RND` R&D
- `ENV-TST` controlled test
- `ENV-STG` staging/certification
- `ENV-PRD` production
- `ENV-DR` disaster recovery / compatibility recovery
- `ENV-MIG` temporary migration staging

See `docs/traceability/NOMENCLATURE.md`.

## 4. Safety prerequisites completed

Ealiophin recovery bundles were previously created and verified for DataNest, DataNest-ci-check, RCGF, resonance-hub and rons-sovereign-codebase. Dirty work was preserved as patches/untracked archives before any migration preparation.

Weed recovery artifacts were created under `C:\Users\iamas\Resonance\RONSAS\migration-audit-20261004`:
- RONSAS-control.bundle SHA-256 `7672543977E5B9AD04DB84E06889C5D6869362E6BFB1CEE46D03B6D99B405D08`
- RONSAS-control-worker.bundle SHA-256 `FEB7BAABAA092FB9D807BB6852C9F51F31EEB40F36FF53F837B87484B66D4042`
- resonance-hub-Weed.bundle SHA-256 `6B77D053205DF25742046F2B5F26D1AFF60FBC2CFE19EAC4DE48AE37829780FE`
- resonance-hub-Weed-staged.patch SHA-256 `1EA61A7623E2BFD80DC62DF127183D3FD55A388883C6EE47FF0E2EE46E32424C`

No reset, rebase, clean, force push or destructive source rewrite was used.

## 5. Weed repository observations

RONSAS control:
- path: `C:\Users\iamas\Resonance\RONSAS\github\control`
- branch: `main`
- head: `819b773a263c277693031d76c1b4d32542365fd7`
- state: clean

RONSAS control-worker:
- head: `31af5284ef0690f7079ff278791b90d211ea41f4`
- relationship: ancestor of control; clean control is 613 commits ahead
- disposition: archive/evidence only, not a separate application

Weed Hub:
- branch: `ronsas/ealiophin-production`
- head: `1cbc8b72f88c210c076c4a9f9edafb40e55414fc`
- state: 8 staged paths, no unstaged diff
- disposition: committed HEAD imported as a provisional snapshot; staged patch remains external evidence for reconciliation

## 6. Hub/RONSAS semantic reconciliation

`evidence/audits/hub-ronsas-file-reconciliation.csv` compares non-generated files by relative path and SHA-256.

Conclusion: RONSAS contains both Hub-derived application code and genuine control-plane additions. Therefore the canonical layout does not import RONSAS as a second full Hub application.

Canonical handling:
- Hub committed snapshot -> `apps/hub`
- RONSAS control surfaces -> `platform/ronsas/control`
- RONSAS application/public/config differences -> `platform/ronsas/reconciliation/control-overlay`
- exact duplicates -> represented once by the Hub/application source

This preserves RONSAS additions without silently changing Hub runtime/commercial authority.

## 7. Open Nova verification and import

Source installation: `C:\Users\iamas\Resonance\OpenNova\ResonanceAppDev_ZeroCredit_v1.5.5`.
It is not a Git repository.

The supplied `scripts\verify-build-manifest.ps1` was inspected and run with a process-local execution-policy bypass. Result: `Open Nova build manifest verified: 199 files.`

Imported source/config/docs/tests into `platform/open-nova`. Runtime secrets/state and model artifacts remain excluded. `runtime/secrets` contained only `.gitkeep` at observation time.

## 8. Public assets are first-class governed resources

Hub public assets were imported with the committed Hub snapshot. DataNest public source remains import-pending.

Each deployable application now has `public/.well-known/resonance/` metadata in migration staging:
- `service-manifest.json`
- `environment.json`
- `release.json`
- `asset-index.json`

Central `catalog/public-assets.json` indexes public files using canonical IDs, trace IDs, path, SHA-256, media type, state and `secret_material_permitted=false`.

Known DataNest public release surfaces are pre-indexed as import-pending: `release-manifest.json`, `runtime-config.js`, `health.json`, and `transparency/audits/index.json`.

A static public health/build marker must never be treated as proof of database/provider health.

## 9. Public-asset security boundary

Never place the following in public assets:
- tokens, passwords, API keys or private keys
- service-role/database credentials
- private member/project records
- unrestricted local filesystem paths
- provider secrets or tunnel credentials
- mutable runtime state

Public metadata may include canonical resource IDs, release/build identifiers, public URLs, non-secret health semantics, SHA-256 hashes and transparency references.

## 10. Nodes and environments

Canonical node IDs:
- `NOD-EAL` / `urn:resonance:node:ealiophin`: primary production/runtime authority; Desktop Commander currently offline and direct state must be re-observed.
- `NOD-WED` / `urn:resonance:node:weed`: support-worker and compatibility-recovery node; non-production authority.
- `NOD-SPD` / `urn:resonance:node:spider`: historical review/control worker; current state not observed in this session.

Existing Weed `authority.json` and `last-sync.json` remain operational for backward compatibility. New sidecars were added:
- `C:\Users\iamas\Resonance\RONSAS\node\traceability-index.v2.json`
- `C:\Users\iamas\Resonance\RONSAS\node\service-index.v2.json`

No legacy runtime schema was replaced.

## 11. Service observation

The RONSAS module registry declares Hub, four spoke apps and internal AI/control/data services. A direct Weed localhost probe checked 17 declared endpoints.

Observed on Weed at this audit: 0 reachable, 17 unreachable.

This is recorded as an observation only. No production suite was started on Weed because it is a support/recovery node and its Hub working tree is intentionally dirty/preserved.

Service catalog records distinguish declared configuration, runtime authority and observed state.

## 12. Catalogs created

`catalog/index.json` references:
- `platforms.json`
- `applications.json`
- `governance.json`
- `environments.json`
- `nodes.json`
- `services.json`
- `aliases.json`
- `public-assets.json`

The catalog build created 25 public-asset records and 18 service records. Validation passed with `TRACEABILITY_VERIFY_OK resources=66`.

## 13. Copy-helper exception and correction

During initial staging import, a helper used PowerShell `Copy-Item -LiteralPath` with a wildcard. It created destination directory shells but did not copy their contents.

The issue was detected by listing the staged directories before certification. The copy was repeated with `Copy-Item -Path ...\* -Recurse`, and the RONSAS control/Open Nova directory content was populated. This exception is intentionally retained in the audit record.

## 14. Current canonical repository layout

```text
DataNest-Supository-CANONICAL-STAGING/
  apps/
    datanest/              # authoritative import pending Ealiophin
    hub/                   # provisional committed Hub recovery snapshot
  platform/
    ronsas/
      control/
      reconciliation/control-overlay/
    open-nova/
  governance/
    rcgf/                  # references present; standalone history pending
    policies/
  packages/
  ops/
  catalog/
  evidence/
  docs/
  scripts/
  tests/
```

## 15. Ealiophin / Desktop Commander reconnection

Ealiophin remains reachable on the LAN but the Desktop Commander device connector is offline. Administrative shares are not available from Weed, so the authoritative DataNest/RCGF source is not being copied over SMB.

Reconnection procedure:
1. On Ealiophin, open the Desktop Commander device-management/setup page in a browser.
2. Sign in using the same Desktop Commander account connected to this ChatGPT session.
3. Reconnect the existing Ealiophin device if shown offline; otherwise choose the add/connect device flow.
4. Run the exact one-line agent command displayed by Desktop Commander in PowerShell/Terminal on Ealiophin. Do not paste credentials into ChatGPT.
5. Leave the agent running or install/start it according to the page's instructions.
6. Confirm Ealiophin appears Online in the device list.
7. Return to this chat and send `resume consolidation`.

Device management: `https://mcp.desktopcommander.app/`
Desktop Commander: `https://desktopcommander.app/`

## 16. Steps after Ealiophin reconnects

1. Re-observe Ealiophin node/process/service state; do not rely on historical PIDs.
2. Verify existing recovery bundles and SHA-256 checksums are unchanged.
3. Inventory DataNest, RCGF, Hub and RONSAS refs/branches/tags and working status.
4. Import DataNest history/source into `apps/datanest` using an evidence-preserving history strategy.
5. Import standalone RCGF history/source into `governance/rcgf` and reconcile the current references.
6. Compare Ealiophin Hub against the provisional Weed Hub snapshot and preserved Weed staged patch.
7. Compare Ealiophin RONSAS/control changes against the RONSAS overlay.
8. Rebuild public asset indexes from the authoritative DataNest/Hub trees.
9. Reconcile environment/node/service manifests to canonical IDs while retaining compatibility aliases.
10. Run component tests and builds from clean dependency installs.
11. Run secret/path/public-asset validation, dependency audit and supply-chain evidence generation.
12. Run cross-component contract checks: auth, entitlements, billing, update feeds, app registry, governance and RONSAS topology.
13. Generate release/SBOM/provenance evidence.
14. Human-review unresolved overlays and dirty branches.
15. Certify a clean local clone from the canonical repository.
16. Only then create the new GitLab account/group/project and push the certified repository.

## 17. Final pre-export acceptance gates

- All authoritative source histories imported or intentionally archived with signed-off disposition.
- No unresolved dirty source is silently discarded.
- No duplicated runtime authority between Hub and RONSAS.
- DataNest governance/RPC/function boundaries preserved and re-tested.
- Public assets indexed and secret-free.
- Node/service catalogs resolve all canonical references.
- Production authority is not inferred from a worker node.
- Clean clone builds without junctions to legacy repositories.
- Tests, type checks, security scans and key business-flow checks pass or carry approved exceptions.
- SBOM and release provenance generated.
- Recovery/rollback artifacts verifiable.
- Human reviewer approves export manifest.

## 18. Audit evidence checklist

For every migration action retain:
- timestamp (ISO-8601)
- actor/tool/node
- source canonical ID and source commit/hash
- destination canonical ID/path
- operation type
- before/after SHA-256 where applicable
- test/check result
- governance decision/approval
- rollback reference
- exception or dissent, if any

Never mark `validated`, `certified`, `production`, or `healthy` from configuration declarations alone. Record observations separately from authority and certification.
