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

## Upstream transport limitation
Fresh GitHub fetches from Spider fail at the Git/TLS transport layer. Port 443 and normal HTTPS to `github.com` succeed, while Git-for-Windows using system Schannel reports connection resets / `SEC_E_MESSAGE_ALTERED`. A repository-local OpenSSL backend was tested without disabling certificate verification; private repository transfers still fail with connection-reset / bad-record-MAC errors. The automated worker loop had successfully synced the control repo at `2026-10-04T17:15+02:00` before its Hub fetch failed; later manual refresh attempts for both governed private origins reset.

No TLS verification was disabled, no firewall/security policy was weakened, and no production promotion was attempted. The repository-local OpenSSL test override was removed after testing, so the worker repositories retain their pre-audit Git transport configuration.

Because upstream refs could not be freshly fetched, this evidence certifies the **directly observed local worker state and alignment to the latest available Weed/Ealiophin references**, not freshness against GitHub beyond those references.

## Current result
**Online and freshly audited — local worker state aligned; upstream Git transport degraded.** Spider remains a support/DR worker with `promotionAuthority=false`. Production promotion remains governed elsewhere.
