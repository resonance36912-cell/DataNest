# Spider Node Readiness Evidence — 2026-10-04

## Canonical identity
- Node: `RSN-NODE-SPIDER-DR-01`.
- Machine alias: `Spider`.
- Environment: disaster recovery / support worker.
- Production promotion authority: **false**.
- Desktop Commander device: `36b21a2a-f70e-4efb-8773-4ac5f0454417`.

## Fresh direct observation
Spider was directly observed online on 2026-10-04. Desktop Commander ping succeeded at `2026-10-04T15:54:17.138Z`.

Machine identity:
- Hostname: `Spider`.
- Windows account: `spider\iamas`.
- Governed live root: `C:\Users\iamas\Resonance\RONSAS`.

Repository state:
- Control: branch `main`, HEAD `819b773a263c277693031d76c1b4d32542365fd7`, clean.
- Hub: branch `ronsas/ealiophin-production`, HEAD `0329aeb42c3f10b26febb638482207468a050332`, clean.
- Control HEAD matches the directly observed Weed control checkout.
- Hub HEAD matches Ealiophin's latest locally available `origin/ronsas/ealiophin-production` tracking ref.

## Worker validation
`node\Verify-RONSAS.ps1` completed with exit code `0` and `aligned: true` at `2026-10-04T15:59:34Z`.

The four deployed Spider worker scripts byte-match the canonical source in `platform/ronsas/ops/workers/spider`:
- `Publish-RonsasControlMirror.ps1`: `26C323F8585C7F7DFF685F22E9281F2AF01D4CB7FF044DEF37BBB1913B8382E6`.
- `Start-RonsasWorkerLoop.ps1`: `F362BCAADDBA20761AB1313E65A966ED32AF99702D23F1ADC6773C7EAD5086D7`.
- `Sync-RonsasWorker.ps1`: `6FAFB66D11D215ACC17F21C3313F1F274316BA85F46E6DB25A49E8788111D63D`.
- `Verify-RONSAS.ps1`: `42546A11AD8153497C7292AB109883E8800E66AF8AA57D4DF223217B3E614F7D`.

Runtime observations:
- Hidden Spider worker loop is running (`Start-RonsasWorkerLoop.ps1`, observed PID `9728`).
- RONSAS sovereignty browser watcher is running (`Watch-RonsasBrowserProcesses.ps1`, observed PID `17700`).
- Dropbox desktop processes are running and `C:\Users\iamas\Dropbox\RONS-Audit\RONS-AI-AUDIT-REPOSITORY` is present.
- No listeners were observed on governed production/runtime ports `4173, 3101, 3201, 3301, 3401, 7863, 7864, 7868, 8787`; this is consistent with Spider's support/DR role.

## Upstream transport observation
A fresh three-attempt sample was run after the local worker audit. The legacy RONSAS control origin failed all three attempts with connection-reset or Windows Schannel `SEC_E_MESSAGE_ALTERED` errors. The `resonance-hub` origin was intermittent: two attempts reset and one succeeded, returning `refs/heads/ronsas/ealiophin-production` at exact local/governed head `0329aeb42c3f10b26febb638482207468a050332`.

No TLS verification was disabled, no firewall/security policy was weakened, and no production promotion was attempted. Repository-local transport test overrides were removed. This certifies Spider local alignment, but not stable legacy-origin transport.

Because the target forge is GitLab, the remaining transport action is to repoint Spider worker remotes to the governed GitLab authority after import and demonstrate stable fresh fetches before relying on remote DR synchronization.

## Preserved divergent source evidence
Historical or dirty Spider sources were preserved before reconciliation rather than merged blindly. The evidence manifest is `spider-audit-20261004/SPIDER-AUDIT-MANIFEST-20261004.json`, SHA-256 `B3AE5A432DF2EB2C44B5B9D1E3F9DF9E1EAF28909B5D4418E97BE3F4BBEFE7A6`. It indexes the local Hub branch bundle, historical PR/worktree bundles, the ChatGPT-hosted prototype bundle/working patch/untracked hashes, and the uncommitted Sovereign Resonance AppDev ZIP/hash inventory.

## Current result
**Online and freshly audited — local worker state aligned; legacy Git transport degraded/intermittent.** Spider remains a support/DR worker with `promotionAuthority=false`. Non-destructive GitLab forge import is not blocked; remote Spider synchronization remains gated until post-import GitLab remotes demonstrate stable fresh fetches.
